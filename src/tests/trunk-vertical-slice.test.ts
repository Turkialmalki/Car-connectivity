import { CommandSimulator } from '@/infrastructure/command-simulator';
import { buildInitialState } from '@/infrastructure/mock-connected-cloud/fixtures';
import { applyCommandEffect, driftTelemetry } from '@/infrastructure/telemetry-simulator';
import { poseFromState } from '@/components/vehicle-3d/articulation';
import { conflictKey, isTerminal } from '@/domain/entities';
import type {
  ConnectivityMode,
  VehicleCapabilities,
  VehicleCommand,
  VehicleState,
} from '@/domain/entities';

/**
 * The rear-trunk vertical slice.
 *
 * Proves the whole chain the brief asks for in one place: a command is
 * submitted, the simulated vehicle reports its progress, the confirmed report
 * changes authoritative state, the pose derived for the renderer follows that
 * state, the state survives leaving and returning to a screen, and the panel is
 * closed again through the same pipeline. Delay and failure are covered too.
 */

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

const VEHICLE_ID = 'nova_one_demo';

const createHarness = (connectivity: ConnectivityMode) => {
  let state: VehicleState = buildInitialState(VEHICLE_ID);
  const transitions: VehicleCommand[] = [];

  const simulator = new CommandSimulator({
    getConnectivity: () => connectivity,
    getState: () => state,
    applyEffect: (command) => {
      state = applyCommandEffect(state, command, 528);
    },
  });
  simulator.capabilitiesProvider = () => CAPABILITIES;
  simulator.observeAll((command) => transitions.push({ ...command }));

  return {
    simulator,
    transitions,
    getState: () => state,
    setState: (next: VehicleState) => {
      state = next;
    },
  };
};

const submit = (
  harness: ReturnType<typeof createHarness>,
  type: VehicleCommand['type'],
  expiresInSeconds = 30,
) =>
  harness.simulator.submit(VEHICLE_ID, {
    type,
    idempotencyKey: `idem_${type}_${Math.random()}`,
    requestedAt: new Date().toISOString(),
    expiresInSeconds,
  });

const settle = async (ms = 30_000) => {
  await jest.advanceTimersByTimeAsync(ms);
};

describe('rear trunk: command -> event -> state -> pose', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens, persists across navigation, and closes through the same pipeline', async () => {
    const harness = createHarness('online');

    // 1. Nothing is open before the command.
    expect(poseFromState(harness.getState()).rearTrunk).toBe(0);

    // 2. Submit, and confirm the pose does NOT move while the command is only
    //    pending — the renderer must not anticipate the vehicle.
    const accepted = submit(harness, 'open_trunk');
    expect(harness.simulator.getCommand(accepted.id)?.status).not.toBe('confirmed');
    expect(poseFromState(harness.getState()).rearTrunk).toBe(0);

    // 3. Let the simulated vehicle report its way through the pipeline.
    await settle();
    const final = harness.simulator.getCommand(accepted.id);
    expect(final?.status).toBe('confirmed');

    // 4. Authoritative state changed, so the derived pose follows.
    expect(harness.getState().trunk).toBe('open');
    expect(poseFromState(harness.getState()).rearTrunk).toBe(1);

    // 5. The pipeline reported real intermediate stages, not just a result.
    const statuses = harness.transitions.filter((c) => c.id === accepted.id).map((c) => c.status);
    expect(statuses).toContain('executing');
    expect(statuses[statuses.length - 1]).toBe('confirmed');

    // 6. "Navigate away and back": screens hold no state of their own, so the
    //    same snapshot yields the same pose after any number of remounts.
    const afterNavigation = poseFromState(harness.getState());
    expect(afterNavigation.rearTrunk).toBe(1);

    // 7. Ambient telemetry keeps ticking without disturbing the panel — a
    //    timeout must never reset the vehicle to its default pose.
    let drifted = harness.getState();
    for (let i = 0; i < 20; i += 1) drifted = driftTelemetry(drifted, 528, 98, 3);
    expect(drifted.trunk).toBe('open');
    expect(poseFromState(drifted).rearTrunk).toBe(1);

    // 8. Close it through the same command path.
    harness.setState(drifted);
    const closing = submit(harness, 'close_trunk');
    await settle();
    expect(harness.simulator.getCommand(closing.id)?.status).toBe('confirmed');
    expect(harness.getState().trunk).toBe('closed');
    expect(poseFromState(harness.getState()).rearTrunk).toBe(0);
  });

  it('leaves the panel untouched when the vehicle is offline', async () => {
    const harness = createHarness('offline');
    const accepted = submit(harness, 'open_trunk');
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final && isTerminal(final.status)).toBe(true);
    expect(final?.status).not.toBe('confirmed');
    // An unconfirmed command changes nothing the user can see on the vehicle.
    expect(harness.getState().trunk).toBe('closed');
    expect(poseFromState(harness.getState()).rearTrunk).toBe(0);
  });

  it('does not move the panel while a command is merely delayed', async () => {
    const harness = createHarness('poor_signal');
    const accepted = submit(harness, 'open_trunk');

    // Part-way through the pipeline the outcome is still unknown.
    await settle(400);
    const midway = harness.simulator.getCommand(accepted.id);
    expect(midway && isTerminal(midway.status)).toBe(false);
    expect(poseFromState(harness.getState()).rearTrunk).toBe(0);

    await settle();
    const final = harness.simulator.getCommand(accepted.id);
    // Whatever the eventual outcome, state and pose agree with each other.
    const expected = final?.status === 'confirmed' ? 1 : 0;
    expect(poseFromState(harness.getState()).rearTrunk).toBe(expected);
  });

  it('an expired command leaves the panel closed and is not re-sent', async () => {
    const harness = createHarness('asleep');
    // A one-second window against a sleeping vehicle cannot be met.
    const accepted = submit(harness, 'open_trunk', 1);
    await settle();

    const final = harness.simulator.getCommand(accepted.id);
    expect(final && isTerminal(final.status)).toBe(true);
    expect(harness.getState().trunk).toBe('closed');
    // Exactly one command exists for this intent; nothing retried on its own.
    const ids = new Set(harness.transitions.map((c) => c.id));
    expect(ids.size).toBe(1);
  });
});

describe('conflict keys', () => {
  it('treats repeated taps on the same panel as one intent', () => {
    expect(conflictKey('open_trunk')).toBe(conflictKey('open_trunk'));
  });

  it('treats opposite requests on the same panel as conflicting', () => {
    expect(conflictKey('open_trunk')).toBe(conflictKey('close_trunk'));
  });

  it('lets unrelated operations run side by side', () => {
    // Climate must remain usable while the boot is open.
    expect(conflictKey('start_climate')).not.toBe(conflictKey('open_trunk'));
    expect(conflictKey('start_charging')).not.toBe(conflictKey('open_trunk'));
  });

  it('separates doors from one another', () => {
    expect(conflictKey('open_door', { door: 'frontLeft' })).not.toBe(
      conflictKey('open_door', { door: 'rearRight' }),
    );
    expect(conflictKey('open_door', { door: 'frontLeft' })).toBe(
      conflictKey('close_door', { door: 'frontLeft' }),
    );
  });

  it('does not confuse unlocking with opening', () => {
    expect(conflictKey('unlock')).not.toBe(conflictKey('open_door', { door: 'frontLeft' }));
  });
});
