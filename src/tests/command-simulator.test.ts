import { CommandSimulator } from '@/infrastructure/command-simulator';
import { buildInitialState } from '@/infrastructure/mock-connected-cloud/fixtures';
import { applyCommandEffect } from '@/infrastructure/telemetry-simulator';
import type {
  ConnectivityMode,
  VehicleCapabilities,
  VehicleCommand,
  VehicleState,
} from '@/domain/entities';

const CAPABILITIES: VehicleCapabilities = {
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

/**
 * Drives the simulator with fake timers so a command that takes seconds of
 * wall-clock time in the app resolves instantly in the suite.
 */
const createHarness = (connectivity: ConnectivityMode) => {
  let state: VehicleState = buildInitialState('nova_one_demo');
  const seen: VehicleCommand[] = [];

  const simulator = new CommandSimulator({
    getConnectivity: () => connectivity,
    getState: () => state,
    applyEffect: (command) => {
      state = applyCommandEffect(state, command, 528);
    },
  });
  simulator.capabilitiesProvider = () => CAPABILITIES;
  simulator.observeAll((command) => seen.push(command));

  return {
    simulator,
    seen,
    getState: () => state,
    setState: (next: VehicleState) => {
      state = next;
    },
  };
};

const submit = (
  harness: ReturnType<typeof createHarness>,
  type: VehicleCommand['type'],
  idempotencyKey = `idem_${type}_${Math.random()}`,
  expiresInSeconds = 30,
) =>
  harness.simulator.submit('nova_one_demo', {
    type,
    idempotencyKey,
    requestedAt: new Date().toISOString(),
    expiresInSeconds,
  });

/** Runs the pipeline to completion under fake timers. */
const settle = async (ms = 30_000) => {
  await jest.advanceTimersByTimeAsync(ms);
};

describe('command simulator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Math.random is used for stage jitter and timeout rolls; pinning it keeps
    // the "online" path deterministic (0.5 < 0.02 is false, so no timeout).
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('confirms a lock command against an online vehicle', async () => {
    const harness = createHarness('online');
    const accepted = submit(harness, 'lock');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('confirmed');
    expect(harness.getState().lock).toBe('locked');
  });

  it('applies the physical effect only once the vehicle confirms', async () => {
    const harness = createHarness('online');
    harness.setState({ ...harness.getState(), lock: 'locked' });
    const accepted = submit(harness, 'unlock');

    // Part-way through the pipeline the car must still be locked.
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.getState().lock).toBe('locked');

    await settle();
    expect(harness.simulator.getCommand(accepted.id)?.status).toBe('confirmed');
    expect(harness.getState().lock).toBe('unlocked');
  });

  it('records a full stage trace with a correlation id', async () => {
    const harness = createHarness('online');
    const accepted = submit(harness, 'flash_lights');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.correlationId).toMatch(/^corr_/);
    expect(final?.trace).toHaveLength(9);
    expect(final?.trace?.[0]?.stage).toBe('mobile_request_created');
    expect(final?.trace?.at(-1)?.stage).toBe('push_delivered');
    expect(final?.trace?.every((s) => s.ok)).toBe(true);
  });

  it('progresses through the documented status sequence', async () => {
    const harness = createHarness('online');
    const accepted = submit(harness, 'lock');
    await settle();

    const statuses = harness.seen
      .filter((c) => c.id === accepted.id)
      .map((c) => c.status)
      .filter((status, index, all) => status !== all[index - 1]);

    // 'requested' is emitted once the mobile hop is recorded, then the command
    // walks the pipeline. No status is ever skipped or revisited.
    expect(statuses).toEqual([
      'requested',
      'validating',
      'queued',
      'delivered',
      'executing',
      'confirmed',
    ]);
  });

  it('never reports success for an offline vehicle', async () => {
    const harness = createHarness('offline');
    const accepted = submit(harness, 'lock');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('failed');
    expect(final?.failureReason).toBe('Vehicle is offline');
    expect(harness.getState().lock).toBe('locked'); // unchanged
  });

  it('expires rather than fails a high-risk command when offline', async () => {
    // An unlock must never sit queued waiting for a car to come back online.
    const harness = createHarness('offline');
    const accepted = submit(harness, 'unlock');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('expired');
    expect(harness.getState().lock).toBe('locked');
  });

  it('wakes a sleeping vehicle before executing', async () => {
    const harness = createHarness('asleep');
    const accepted = submit(harness, 'start_climate');

    // The wake-up window is 3–7s; nothing should have executed inside it.
    await jest.advanceTimersByTimeAsync(2_000);
    expect(harness.simulator.getCommand(accepted.id)?.status).toBe('requested');
    expect(harness.getState().climate.active).toBe(false);

    await settle(40_000);
    expect(harness.simulator.getCommand(accepted.id)?.status).toBe('confirmed');
    expect(harness.getState().climate.active).toBe(true);
  });

  it('times out on a poor signal and leaves the command retryable', async () => {
    const harness = createHarness('poor_signal');
    // Force the timeout roll to land inside poor_signal's 34% probability.
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const accepted = submit(harness, 'lock');
    await settle(60_000);

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('failed');
    expect(final?.failureReason).toBe('Vehicle did not acknowledge the request');
    // The trace records exactly where it broke down.
    expect(final?.trace?.at(-1)?.ok).toBe(false);
    expect(final?.trace?.at(-1)?.stage).toBe('vehicle_tcu_acknowledged');
  });

  it('rejects a restricted command in service mode', async () => {
    const harness = createHarness('service_mode');
    const accepted = submit(harness, 'unlock');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('rejected');
    expect(final?.failureReason).toBe('Vehicle is in service mode');
  });

  it('rejects a command the vehicle cannot perform', async () => {
    const harness = createHarness('online');
    harness.simulator.capabilitiesProvider = () => ({ ...CAPABILITIES, remoteTrunk: false });
    const accepted = submit(harness, 'open_trunk');
    await settle();

    expect(harness.simulator.getCommand(accepted.id)?.failureReason).toBe(
      'This vehicle does not support that function',
    );
  });

  it('expires a command whose window elapses mid-flight', async () => {
    const harness = createHarness('poor_signal');
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // slow, but no forced timeout
    const accepted = submit(harness, 'lock', 'idem_short', 1); // 1-second window
    await settle(20_000);

    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('expired');
  });
});

describe('idempotent submission', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ignores a duplicate submission of an in-flight intent', async () => {
    const harness = createHarness('online');
    const first = submit(harness, 'lock', 'idem_same');
    const second = submit(harness, 'lock', 'idem_same');

    // The same key returns the same command rather than creating a second one.
    expect(second.id).toBe(first.id);
    await settle();
    expect(harness.simulator.getHistory()).toHaveLength(1);
  });

  it('allows a retry of a failed intent under the same key', async () => {
    const harness = createHarness('offline');
    const first = submit(harness, 'lock', 'idem_retry');
    await settle();
    expect(harness.simulator.getCommand(first.id)?.status).toBe('failed');

    const retry = harness.simulator.submit('nova_one_demo', {
      type: 'lock',
      idempotencyKey: 'idem_retry',
      requestedAt: new Date().toISOString(),
      expiresInSeconds: 30,
    });

    // A retry is the same intent, so it keeps the command id and the history
    // shows one action, not two.
    expect(retry.id).toBe(first.id);
    expect(retry.wasRetry).toBe(true);
    expect(harness.simulator.getHistory()).toHaveLength(1);
  });
});
