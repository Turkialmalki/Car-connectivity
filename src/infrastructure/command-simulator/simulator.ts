import {
  type CommandStatus,
  type CommandTraceStage,
  type ConnectivityMode,
  type FailureReason,
  type VehicleCommand,
  type VehicleState,
  DEFAULT_EXPIRY_SECONDS,
  FAILURE_REASON_COPY,
  isHighRisk,
} from '@/domain/entities';
import { authorizeCommand, transition, expireIfDue } from '@/domain/use-cases';
import type { CommandRequest } from '@/domain/repositories';
import {
  commandId as newCommandId,
  correlationId as newCorrelationId,
  replayNonce,
} from '@/utils/id';
import { logger } from '@/utils/logger';
import { nowIso, sleep } from '@/utils/time';
import { CONNECTIVITY_PROFILES, PIPELINE, STAGE_STATUS, stageDuration } from './pipeline';

/**
 * The command simulator.
 *
 * It stands in for everything east of the mobile app:
 *   Connected Services API → Command Service → IoT Broker → TCU → Gateway → ECU
 *
 * Design rules it enforces, all of which are real production concerns:
 *  1. Nothing reports success until the *vehicle* confirms execution.
 *  2. Every command carries a correlation ID and produces a full stage trace.
 *  3. High-risk commands expire rather than queue indefinitely.
 *  4. An offline vehicle fails honestly; it never optimistically "succeeds".
 *  5. Retries reuse the idempotency key so a duplicate intent is recognisable.
 */

export type SimulatorContext = {
  getConnectivity: () => ConnectivityMode;
  getState: () => VehicleState;
  /** Applies the physical effect of a confirmed command to vehicle state. */
  applyEffect: (command: VehicleCommand) => void;
  onWakeStart?: () => void;
  onWakeEnd?: () => void;
};

type Listener = (command: VehicleCommand) => void;

export class CommandSimulator {
  private commands = new Map<string, VehicleCommand>();
  /** Idempotency key -> command id. Retries resolve through this map. */
  private idempotencyIndex = new Map<string, string>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private history: VehicleCommand[] = [];

  constructor(private readonly ctx: SimulatorContext) {}

  getCommand(id: string): VehicleCommand | undefined {
    const command = this.commands.get(id);
    return command ? expireIfDue(command) : undefined;
  }

  getHistory(): VehicleCommand[] {
    return [...this.history].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }

  observe(commandId: string, listener: Listener): () => void {
    const set = this.listeners.get(commandId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(commandId, set);
    return () => set.delete(listener);
  }

  observeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /**
   * Accepts a command request and starts the pipeline.
   * Returns as soon as the request is *accepted* — mirroring a real 202 response.
   */
  submit(vehicleId: string, request: CommandRequest): VehicleCommand {
    const existingId = this.idempotencyIndex.get(request.idempotencyKey);
    const existing = existingId ? this.commands.get(existingId) : undefined;

    // Idempotent replay: an in-flight command with this key is returned as-is
    // rather than duplicated. This is what makes "Retry" safe on an unlock.
    if (existing && !['failed', 'expired'].includes(existing.status)) {
      logger.info('Idempotent replay ignored', {
        idempotencyKey: request.idempotencyKey,
        commandId: existing.id,
      });
      return existing;
    }

    const expirySeconds = request.expiresInSeconds || DEFAULT_EXPIRY_SECONDS[request.type];
    const isRetry = Boolean(existing);
    const command: VehicleCommand = {
      // A retry keeps the original command id so history shows one intent, not two.
      id: existing?.id ?? newCommandId(),
      idempotencyKey: request.idempotencyKey,
      correlationId: newCorrelationId(),
      vehicleId,
      type: request.type,
      requestedAt: request.requestedAt,
      expiresAt: new Date(
        new Date(request.requestedAt).getTime() + expirySeconds * 1000,
      ).toISOString(),
      status: 'requested',
      payload: request.payload,
      trace: [],
      wasRetry: isRetry,
    };

    this.commands.set(command.id, command);
    this.idempotencyIndex.set(command.idempotencyKey, command.id);
    if (!isRetry) this.history.unshift(command);

    logger.info('Command accepted', {
      commandId: command.id,
      correlationId: command.correlationId,
      type: command.type,
      // A single-use nonce would accompany the signed payload in production.
      nonce: replayNonce(),
    });

    void this.run(command.id);
    return command;
  }

  private emit(command: VehicleCommand) {
    this.commands.set(command.id, command);
    const index = this.history.findIndex((c) => c.id === command.id);
    if (index >= 0) this.history[index] = command;
    this.listeners.get(command.id)?.forEach((l) => l(command));
    this.globalListeners.forEach((l) => l(command));
  }

  private fail(
    command: VehicleCommand,
    status: Extract<CommandStatus, 'failed' | 'rejected' | 'expired'>,
    code: FailureReason,
  ) {
    const result = transition(command, status, {
      failureCode: code,
      failureReason: FAILURE_REASON_COPY[code],
    });
    if (result.ok) this.emit(result.command);
    return result.command;
  }

  private async run(id: string): Promise<void> {
    let command = this.commands.get(id);
    if (!command) return;

    const connectivity = this.ctx.getConnectivity();
    const profile = CONNECTIVITY_PROFILES[connectivity];
    const state = this.ctx.getState();

    // --- Pre-flight authorization -----------------------------------------
    const auth = authorizeCommand({
      type: command.type,
      capabilities: this.capabilitiesFor(state),
      connectivity,
      isMoving: state.isMoving,
      requireBiometricForUnlock: false,
    });
    if (!auth.allowed) {
      this.fail(command, 'rejected', auth.reason);
      return;
    }

    // --- Offline: fail fast and honestly ----------------------------------
    if (!profile.reachable) {
      // Give the request just long enough to look like a real attempt, then
      // report the truth. High-risk commands expire; the rest fail.
      await sleep(900);
      const stillThere = this.commands.get(id);
      if (!stillThere) return;
      const highRisk = isHighRisk(stillThere.type);
      this.fail(
        stillThere,
        highRisk ? 'expired' : 'failed',
        highRisk ? 'command_expired' : 'vehicle_offline',
      );
      return;
    }

    // --- Sleeping vehicle: wake it first ----------------------------------
    if (profile.wakeMs) {
      this.ctx.onWakeStart?.();
      const [min, max] = profile.wakeMs;
      await sleep(min + Math.random() * (max - min));
      this.ctx.onWakeEnd?.();
    }

    // --- Walk the pipeline -------------------------------------------------
    const trace: CommandTraceStage[] = [];
    // A timeout, when it happens, strikes at the vehicle hop — that is where
    // real-world radio loss actually occurs.
    const willTimeout = Math.random() < profile.timeoutProbability;
    const timeoutStage = willTimeout ? 'vehicle_tcu_acknowledged' : null;

    for (const timing of PIPELINE) {
      const current = this.commands.get(id);
      if (!current) return;

      // Expiry is checked at every hop: a command must never outlive its window.
      const expired = expireIfDue(current);
      if (expired.status === 'expired') {
        this.emit({
          ...expired,
          trace,
          failureCode: 'command_expired',
          failureReason: FAILURE_REASON_COPY.command_expired,
        });
        return;
      }

      const startedAt = nowIso();
      const duration = stageDuration(timing, profile);
      await sleep(duration);

      const afterSleep = this.commands.get(id);
      if (!afterSleep) return;

      if (timing.stage === timeoutStage) {
        trace.push({
          stage: timing.stage,
          startedAt,
          elapsedMs: duration,
          ok: false,
          detail: 'No acknowledgement received within the delivery window.',
        });
        const failed = transition(afterSleep, 'failed', {
          failureCode: 'no_acknowledgment',
          failureReason: FAILURE_REASON_COPY.no_acknowledgment,
          trace,
        });
        if (failed.ok) this.emit(failed.command);
        return;
      }

      trace.push({ stage: timing.stage, startedAt, elapsedMs: duration, ok: true });

      const nextStatus = STAGE_STATUS[timing.stage];
      if (nextStatus) {
        const result = transition(afterSleep, nextStatus, { trace: [...trace] });
        if (!result.ok) {
          logger.warn('Refused illegal transition', { reason: result.reason });
          return;
        }
        command = result.command;
        // The physical effect lands only when the vehicle confirms execution.
        if (nextStatus === 'confirmed') this.ctx.applyEffect(command);
        this.emit(command);
      } else {
        const latest = this.commands.get(id);
        if (latest) this.emit({ ...latest, trace: [...trace] });
      }
    }
  }

  private capabilitiesFor(_state: VehicleState) {
    // Capabilities belong to the vehicle, not to its live state. The mock cloud
    // injects a provider so authorization always sees the *selected* vehicle.
    return this.capabilitiesProvider?.() ?? FULL_CAPABILITIES;
  }

  /** Injected by the mock cloud so authorization sees the selected vehicle. */
  capabilitiesProvider?: () => import('@/domain/entities').VehicleCapabilities;

  reset(): void {
    this.commands.clear();
    this.idempotencyIndex.clear();
    this.history = [];
  }
}

const FULL_CAPABILITIES: import('@/domain/entities').VehicleCapabilities = {
  remoteLock: true,
  remoteClimate: true,
  remoteTrunk: true,
  remoteFrunk: true,
  remoteDoors: false,
  remoteChargePort: true,
  remoteDriveAuthorization: true,
  remoteHorn: true,
  remoteLights: true,
  chargeControl: true,
  chargeScheduling: true,
  digitalKey: 'uwb_ble_nfc',
  location: true,
  otaUpdates: true,
};
