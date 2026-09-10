import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleSimulation, buildInitialState } from '../lib/simulator/engine';
import { SimulatorRunner, TELEMETRY_INTERVAL_MS, type RunnerEvent } from '../lib/simulator/runner';
import {
  TransportError,
  type ClaimedCommand,
  type CommandResultReport,
  type SimulatorTransport,
  type TelemetryAck,
} from '../lib/simulator/transport';
import type { ReportedVehicleState } from '../lib/vehicle/state';

/**
 * A transport that records what the loop did, and can be told to be slow or to
 * fail. Everything the runner is responsible for — scheduling, overlap,
 * cleanup, backoff — is observable through it.
 */
class FakeTransport implements SimulatorTransport {
  readonly vehicleId = 'vehicle-1';
  telemetryCalls = 0;
  claimCalls = 0;
  results: { commandId: string; result: CommandResultReport }[] = [];
  closed = 0;
  queue: ClaimedCommand[] = [];
  failTelemetryWith: Error | null = null;
  telemetryDelayMs = 0;
  concurrentTelemetry = 0;
  maxConcurrentTelemetry = 0;

  async sendTelemetry(_observedAt: string, _reported: ReportedVehicleState): Promise<TelemetryAck> {
    this.telemetryCalls += 1;
    this.concurrentTelemetry += 1;
    this.maxConcurrentTelemetry = Math.max(this.maxConcurrentTelemetry, this.concurrentTelemetry);
    try {
      if (this.telemetryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.telemetryDelayMs));
      }
      if (this.failTelemetryWith) throw this.failTelemetryWith;
      return { accepted: true, revision: this.telemetryCalls };
    } finally {
      this.concurrentTelemetry -= 1;
    }
  }

  async claimCommand(): Promise<ClaimedCommand | null> {
    this.claimCalls += 1;
    return this.queue.shift() ?? null;
  }

  async reportResult(commandId: string, result: CommandResultReport): Promise<void> {
    this.results.push({ commandId, result });
  }

  async close(): Promise<void> {
    this.closed += 1;
  }
}

const command = (overrides: Partial<ClaimedCommand> = {}): ClaimedCommand => ({
  id: 'cmd-1',
  vehicleId: 'vehicle-1',
  type: 'lock',
  payload: {},
  requestedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  correlationId: 'corr-1',
  ...overrides,
});

const makeRunner = (transport: FakeTransport, events: RunnerEvent[] = []) =>
  new SimulatorRunner({
    simulation: new VehicleSimulation(buildInitialState(), { commandDelayMs: 0 }),
    transport,
    onEvent: (event) => events.push(event),
  });

describe('SimulatorRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports telemetry on a fixed cadence', async () => {
    const transport = new FakeTransport();
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.telemetryCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 3);
    expect(transport.telemetryCalls).toBe(4);

    await runner.stop();
  });

  it('starting twice does not create a second loop', async () => {
    const transport = new FakeTransport();
    const runner = makeRunner(transport);

    runner.start();
    runner.start();
    runner.start();

    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 2);
    // One loop: the initial report plus two intervals.
    expect(transport.telemetryCalls).toBe(3);

    await runner.stop();
  });

  it('does not overlap requests when one is slower than the interval', async () => {
    const transport = new FakeTransport();
    transport.telemetryDelayMs = TELEMETRY_INTERVAL_MS * 2;
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 6);

    expect(transport.maxConcurrentTelemetry).toBe(1);
    await runner.stop();
  });

  it('stops every timer and releases the session on stop', async () => {
    const transport = new FakeTransport();
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 2);
    const callsAtStop = transport.telemetryCalls;

    await runner.stop();
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 5);

    expect(transport.telemetryCalls).toBe(callsAtStop);
    expect(transport.closed).toBe(1);
    expect(runner.isRunning()).toBe(false);
  });

  it('restarting after a stop runs exactly one loop', async () => {
    const transport = new FakeTransport();
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS);
    await runner.stop();

    const before = transport.telemetryCalls;
    runner.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 2);

    // One immediate report plus two intervals, not two loops' worth.
    expect(transport.telemetryCalls - before).toBe(3);
    await runner.stop();
  });

  it('claims a command, executes it and reports the result', async () => {
    const transport = new FakeTransport();
    transport.queue.push(command({ type: 'unlock' }));
    const events: RunnerEvent[] = [];
    const runner = makeRunner(transport, events);

    runner.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(transport.results).toHaveLength(1);
    expect(transport.results[0]!.result.status).toBe('succeeded');
    expect(transport.results[0]!.result.reported?.lock).toBe('unlocked');
    expect(events.some((e) => e.kind === 'command_claimed')).toBe(true);

    await runner.stop();
  });

  it('does not execute a command whose window has already closed', async () => {
    const transport = new FakeTransport();
    transport.queue.push(
      command({ type: 'unlock', expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(transport.results[0]!.result.status).toBe('failed');
    expect(transport.results[0]!.result.failureCode).toBe('command_expired');
    // The vehicle was not touched.
    expect(runner.getSimulation().snapshot().lock).toBe('locked');

    await runner.stop();
  });

  it('backs off after a failure instead of hammering the API', async () => {
    const transport = new FakeTransport();
    transport.failTelemetryWith = new Error('network down');
    const events: RunnerEvent[] = [];
    const runner = makeRunner(transport, events);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.telemetryCalls).toBe(1);

    // The first retry waits a second, so nothing happens in the first half of it.
    await vi.advanceTimersByTimeAsync(500);
    expect(transport.telemetryCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(transport.telemetryCalls).toBe(2);

    await runner.stop();
  });

  it('gives up and stops once retries are exhausted', async () => {
    const transport = new FakeTransport();
    transport.failTelemetryWith = new Error('network down');
    const events: RunnerEvent[] = [];
    const runner = makeRunner(transport, events);

    runner.start();
    await vi.advanceTimersByTimeAsync(200_000);

    expect(runner.isRunning()).toBe(false);
    expect(events.some((e) => e.kind === 'stopped')).toBe(true);
  });

  it('stops immediately when the session is rejected, rather than retrying it', async () => {
    const transport = new FakeTransport();
    transport.failTelemetryWith = new TransportError('gone', 401, 'session_expired');
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(runner.isRunning()).toBe(false);
    expect(transport.telemetryCalls).toBe(1);
  });

  it('stops reporting while connectivity is lost', async () => {
    const transport = new FakeTransport();
    const runner = makeRunner(transport);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.telemetryCalls).toBe(1);

    runner.configure({ connectivityLost: true });
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS * 4);
    expect(transport.telemetryCalls).toBe(1);

    runner.configure({ connectivityLost: false });
    await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS);
    expect(transport.telemetryCalls).toBeGreaterThan(1);

    await runner.stop();
  });
});
