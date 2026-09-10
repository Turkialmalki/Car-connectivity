/**
 * The simulation loop.
 *
 * Two independent schedules run here:
 *
 *   telemetry — every ~2 s: advance the simulation and report the result
 *   commands  — every ~1 s: claim at most one command, execute it, report it
 *
 * Both are self-rescheduling timeouts rather than intervals. An interval will
 * happily stack a second request on top of a slow first one; a chain cannot,
 * because the next tick is only scheduled once the previous one has finished.
 *
 * A generation counter guards against the other way loops duplicate: a page
 * that remounts, or a start button pressed twice, would otherwise leave the
 * first loop running invisibly. Every scheduled callback checks that it still
 * belongs to the current generation and returns if it does not.
 */
import { VehicleSimulation, type SimulatorConfig } from './engine';
import {
  TransportError,
  type ClaimedCommand,
  type SimulatorTransport,
} from './transport';
import type { CommandType } from '../vehicle/commands';
import type { ReportedVehicleState } from '../vehicle/state';

export const TELEMETRY_INTERVAL_MS = 2000;
export const COMMAND_POLL_INTERVAL_MS = 1000;

/** Retries are bounded. A simulator that cannot reach the API stops trying. */
const MAX_CONSECUTIVE_FAILURES = 6;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 20_000;

export type RunnerEvent =
  | { kind: 'state'; state: ReportedVehicleState; revision: number }
  | { kind: 'command_claimed'; command: ClaimedCommand }
  | {
      kind: 'command_result';
      command: ClaimedCommand;
      status: 'succeeded' | 'failed' | 'rejected';
      failureReason?: string;
    }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'stopped'; reason: string };

export type RunnerListener = (event: RunnerEvent) => void;

const backoffFor = (failures: number): number =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));

export class SimulatorRunner {
  private readonly simulation: VehicleSimulation;
  private readonly transport: SimulatorTransport;
  private readonly listener: RunnerListener;

  private generation = 0;
  private running = false;
  private telemetryTimer: ReturnType<typeof setTimeout> | null = null;
  private commandTimer: ReturnType<typeof setTimeout> | null = null;
  private telemetryInFlight = false;
  private commandInFlight = false;
  private telemetryFailures = 0;
  private commandFailures = 0;
  private lastTickAt = Date.now();

  constructor(options: {
    simulation: VehicleSimulation;
    transport: SimulatorTransport;
    onEvent: RunnerListener;
  }) {
    this.simulation = options.simulation;
    this.transport = options.transport;
    this.listener = options.onEvent;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Idempotent: starting an already-running runner does nothing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.telemetryFailures = 0;
    this.commandFailures = 0;
    this.lastTickAt = Date.now();

    const generation = this.generation;
    this.emit({ kind: 'log', level: 'info', message: 'Simulator started.' });
    this.scheduleTelemetry(generation, 0);
    this.scheduleCommands(generation, COMMAND_POLL_INTERVAL_MS);
  }

  /**
   * Stops both loops and releases the session.
   *
   * Bumping the generation is what makes this safe to call from a React cleanup:
   * any callback already queued by the platform finds itself out of date and
   * returns without touching anything.
   */
  async stop(reason = 'stopped by operator'): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;

    if (this.telemetryTimer) clearTimeout(this.telemetryTimer);
    if (this.commandTimer) clearTimeout(this.commandTimer);
    this.telemetryTimer = null;
    this.commandTimer = null;

    this.emit({ kind: 'stopped', reason });
    await this.transport.close();
  }

  getSimulation(): VehicleSimulation {
    return this.simulation;
  }

  configure(patch: Partial<SimulatorConfig>): void {
    this.simulation.configure(patch);
  }

  private emit(event: RunnerEvent): void {
    try {
      this.listener(event);
    } catch {
      // A listener that throws is the console's problem, not the loop's.
    }
  }

  private scheduleTelemetry(generation: number, delay: number): void {
    if (!this.running || generation !== this.generation) return;
    this.telemetryTimer = setTimeout(() => {
      void this.telemetryTick(generation);
    }, delay);
  }

  private scheduleCommands(generation: number, delay: number): void {
    if (!this.running || generation !== this.generation) return;
    this.commandTimer = setTimeout(() => {
      void this.commandTick(generation);
    }, delay);
  }

  private async telemetryTick(generation: number): Promise<void> {
    if (!this.running || generation !== this.generation) return;
    if (this.telemetryInFlight) {
      this.scheduleTelemetry(generation, TELEMETRY_INTERVAL_MS);
      return;
    }

    this.telemetryInFlight = true;
    const now = Date.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;

    const state = this.simulation.tick(delta, now);

    // A vehicle with no connectivity does not report. The app is expected to
    // notice the silence and say so, rather than being told "offline" politely.
    if (this.simulation.getConfig().connectivityLost) {
      this.telemetryInFlight = false;
      this.emit({ kind: 'state', state, revision: -1 });
      this.scheduleTelemetry(generation, TELEMETRY_INTERVAL_MS);
      return;
    }

    try {
      const ack = await this.transport.sendTelemetry(new Date(now).toISOString(), state);
      this.telemetryFailures = 0;
      if (generation === this.generation) {
        this.emit({ kind: 'state', state, revision: ack.revision });
      }
      this.scheduleTelemetry(generation, TELEMETRY_INTERVAL_MS);
    } catch (error) {
      await this.handleFailure('telemetry', error, generation);
    } finally {
      this.telemetryInFlight = false;
    }
  }

  private async commandTick(generation: number): Promise<void> {
    if (!this.running || generation !== this.generation) return;
    if (this.commandInFlight) {
      this.scheduleCommands(generation, COMMAND_POLL_INTERVAL_MS);
      return;
    }

    this.commandInFlight = true;
    try {
      const command = await this.transport.claimCommand();
      this.commandFailures = 0;

      if (!command) {
        this.scheduleCommands(generation, COMMAND_POLL_INTERVAL_MS);
        return;
      }

      this.emit({ kind: 'command_claimed', command });
      await this.executeClaimed(command, generation);
      // Poll again immediately: a queue with work in it should drain, not idle.
      this.scheduleCommands(generation, 50);
    } catch (error) {
      await this.handleFailure('commands', error, generation);
    } finally {
      this.commandInFlight = false;
    }
  }

  private async executeClaimed(command: ClaimedCommand, generation: number): Promise<void> {
    const delay = this.simulation.getConfig().commandDelayMs;
    if (delay > 0) await sleep(delay);
    if (!this.running || generation !== this.generation) return;

    // Expiry is re-checked here, after the delay: a command whose window closed
    // while it was being processed must not take effect.
    if (new Date(command.expiresAt).getTime() <= Date.now()) {
      await this.transport.reportResult(command.id, {
        status: 'failed',
        failureCode: 'command_expired',
        failureReason: 'The command expired before the vehicle executed it.',
      });
      this.emit({
        kind: 'command_result',
        command,
        status: 'failed',
        failureReason: 'Expired before execution',
      });
      return;
    }

    const outcome = this.simulation.execute(command.type as CommandType, command.payload);
    const observedAt = new Date().toISOString();
    const reported = this.simulation.snapshot();

    await this.transport.reportResult(command.id, {
      status: outcome.status,
      failureCode: outcome.failureCode,
      failureReason: outcome.failureReason,
      observedAt,
      reported,
      // The event id travels with the result so a client can tie a transient
      // effect to the command that caused it and present it exactly once.
      detail: outcome.eventId ? { eventId: outcome.eventId } : undefined,
    });

    this.emit({
      kind: 'command_result',
      command,
      status: outcome.status,
      failureReason: outcome.failureReason,
    });
    this.emit({ kind: 'state', state: reported, revision: -1 });
  }

  /**
   * Backoff, with a floor under how much failure is tolerated.
   *
   * An expired or revoked session is fatal — retrying a credential that the
   * server has rejected is not resilience, it is a busy loop.
   */
  private async handleFailure(
    loop: 'telemetry' | 'commands',
    error: unknown,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) return;

    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof TransportError && error.isFatal) {
      this.emit({ kind: 'log', level: 'error', message: `Session rejected: ${message}` });
      await this.stop('the simulator session is no longer valid');
      return;
    }

    const failures =
      loop === 'telemetry' ? (this.telemetryFailures += 1) : (this.commandFailures += 1);

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      this.emit({
        kind: 'log',
        level: 'error',
        message: `${loop} failed ${failures} times in a row: ${message}`,
      });
      await this.stop(`${loop} could not reach the API`);
      return;
    }

    const delay = backoffFor(failures);
    this.emit({
      kind: 'log',
      level: 'warn',
      message: `${loop} failed (${message}). Retrying in ${Math.round(delay / 1000)}s.`,
    });

    if (loop === 'telemetry') this.scheduleTelemetry(generation, delay);
    else this.scheduleCommands(generation, delay);
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
