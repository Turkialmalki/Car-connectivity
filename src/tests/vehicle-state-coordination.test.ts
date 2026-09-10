import { buildInitialState } from '@/infrastructure/mock-connected-cloud/fixtures';
import { applyCommandEffect, driftTelemetry } from '@/infrastructure/telemetry-simulator';
import { useCommandStore, findConflicting } from '@/stores/command-store';
import { DRIVE_AUTHORIZATION_SECONDS, isInFlight } from '@/domain/entities';
import type { TransientEvent, VehicleCommand, VehicleState } from '@/domain/entities';

/**
 * Coordination between commands, vehicle-reported events, and what the app is
 * allowed to show. These are the rules that keep the visualisation honest.
 */

const VEHICLE_ID = 'nova_one_demo';

const command = (
  type: VehicleCommand['type'],
  overrides: Partial<VehicleCommand> = {},
): VehicleCommand => ({
  id: `cmd_${type}_${Math.random().toString(36).slice(2)}`,
  idempotencyKey: `idem_${Math.random()}`,
  correlationId: `corr_${Math.random()}`,
  vehicleId: VEHICLE_ID,
  type,
  requestedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  status: 'executing',
  ...overrides,
});

const confirm = (state: VehicleState, cmd: VehicleCommand): VehicleState =>
  applyCommandEffect(state, { ...cmd, status: 'confirmed' }, 528);

describe('drive authorization is distinct from drive readiness', () => {
  it('granting authorization does not by itself make the vehicle ready', () => {
    const state = buildInitialState(VEHICLE_ID);
    expect(state.power).toBe('asleep');

    const authorized = confirm(state, command('enable_driving'));
    expect(authorized.driveAuthorization.granted).toBe(true);
    // The vehicle has only started waking. Readiness is its report, not ours.
    expect(authorized.power).toBe('waking');
    expect(authorized.driveReady).toBe(false);
  });

  it('readiness arrives only once the vehicle reports itself awake', () => {
    let state = confirm(buildInitialState(VEHICLE_ID), command('enable_driving'));
    state = driftTelemetry(state, 528, 98, 3);
    expect(state.power).toBe('awake');
    expect(state.driveReady).toBe(true);
  });

  it('a grant expires on its own and readiness lapses with it', () => {
    let state = confirm(buildInitialState(VEHICLE_ID), command('enable_driving'));
    state = driftTelemetry(state, 528, 98, 3);
    expect(state.driveReady).toBe(true);

    // Wind the grant past its expiry without touching anything else.
    state = {
      ...state,
      driveAuthorization: {
        ...state.driveAuthorization,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    };
    state = driftTelemetry(state, 528, 98, 3);
    expect(state.driveAuthorization.granted).toBe(false);
    expect(state.driveReady).toBe(false);
  });

  it('expires after the documented window, not silently forever', () => {
    const state = confirm(buildInitialState(VEHICLE_ID), command('enable_driving'));
    const seconds =
      (new Date(state.driveAuthorization.expiresAt!).getTime() -
        new Date(state.driveAuthorization.grantedAt!).getTime()) /
      1000;
    expect(Math.round(seconds)).toBe(DRIVE_AUTHORIZATION_SECONDS);
  });

  it('revoking clears both authorization and readiness', () => {
    let state = confirm(buildInitialState(VEHICLE_ID), command('enable_driving'));
    state = driftTelemetry(state, 528, 98, 3);
    state = confirm(state, command('disable_driving'));
    expect(state.driveAuthorization.granted).toBe(false);
    expect(state.driveReady).toBe(false);
  });

  it('a parked vehicle stays parked when driving is authorised', () => {
    let state = confirm(buildInitialState(VEHICLE_ID), command('enable_driving'));
    state = driftTelemetry(state, 528, 98, 3);
    // No gear change, no motion, no speed. Readiness is not driving.
    expect(state.gear).toBe('P');
    expect(state.isMoving).toBe(false);
    expect(state.speedKph).toBe(0);
  });
});

describe('transient events', () => {
  it('gives every flash a unique id', () => {
    let state = buildInitialState(VEHICLE_ID);
    state = confirm(state, command('flash_lights'));
    state = confirm(state, command('flash_lights'));
    const ids = state.transientEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records a bounded duration rather than an open-ended flag', () => {
    const state = confirm(buildInitialState(VEHICLE_ID), command('flash_lights'));
    const event = state.transientEvents.at(-1)!;
    expect(event.durationMs).toBeGreaterThan(0);
    expect(event.durationMs).toBeLessThan(10_000);
  });

  it('does not leave any light latched on after a flash', () => {
    const state = confirm(buildInitialState(VEHICLE_ID), command('flash_lights'));
    expect(state.lights.headlights).toBe(false);
    expect(state.lights.indicators).toBe(false);
  });

  it('retires stale events so revisiting a screen cannot replay them', () => {
    let state = confirm(buildInitialState(VEHICLE_ID), command('sound_horn'));
    expect(state.transientEvents).toHaveLength(1);
    state = {
      ...state,
      transientEvents: state.transientEvents.map((e) => ({
        ...e,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      })),
    };
    state = driftTelemetry(state, 528, 98, 3);
    expect(state.transientEvents).toHaveLength(0);
  });

  it('marks an event as presented exactly once', () => {
    const event: TransientEvent = {
      id: 'evt_once',
      kind: 'horn',
      occurredAt: new Date().toISOString(),
      durationMs: 900,
    };
    useCommandStore.getState().reset();
    useCommandStore.getState().markEventPresented(event);
    useCommandStore.getState().markEventPresented(event);
    expect(useCommandStore.getState().presentedEventIds.filter((id) => id === 'evt_once')).toHaveLength(1);
  });
});

describe('command deduplication and conflict policy', () => {
  beforeEach(() => useCommandStore.getState().reset());

  it('finds the in-flight command that already owns a repeated intent', () => {
    const first = command('open_trunk');
    useCommandStore.getState().upsert(first);
    const match = findConflicting(useCommandStore.getState(), 'open_trunk');
    expect(match?.id).toBe(first.id);
  });

  it('treats the opposite request on the same panel as a conflict', () => {
    const opening = command('open_trunk');
    useCommandStore.getState().upsert(opening);
    const match = findConflicting(useCommandStore.getState(), 'close_trunk');
    expect(match?.id).toBe(opening.id);
  });

  it('leaves unrelated controls free while a panel is moving', () => {
    useCommandStore.getState().upsert(command('open_trunk'));
    expect(findConflicting(useCommandStore.getState(), 'start_climate')).toBeNull();
    expect(findConflicting(useCommandStore.getState(), 'flash_lights')).toBeNull();
  });

  it('stops matching once the command has finished', () => {
    const done = command('open_trunk', { status: 'confirmed' });
    useCommandStore.getState().upsert(done);
    expect(isInFlight(done.status)).toBe(false);
    expect(findConflicting(useCommandStore.getState(), 'open_trunk')).toBeNull();
  });

  it('does not let a late duplicate resurrect a finished command', () => {
    const finished = command('open_trunk', { status: 'confirmed' });
    useCommandStore.getState().upsert(finished);
    useCommandStore.getState().upsert({ ...finished, status: 'executing' });
    expect(useCommandStore.getState().commands[finished.id]?.status).toBe('confirmed');
  });

  it('keeps doors independent of one another', () => {
    useCommandStore.getState().upsert(command('open_door', { payload: { door: 'frontLeft' } }));
    expect(
      findConflicting(useCommandStore.getState(), 'open_door', { door: 'rearRight' }),
    ).toBeNull();
    expect(
      findConflicting(useCommandStore.getState(), 'close_door', { door: 'frontLeft' }),
    ).not.toBeNull();
  });
});

describe('multiple states coexist', () => {
  it('climate keeps running while the boot is open', () => {
    let state = buildInitialState(VEHICLE_ID);
    state = confirm(state, command('start_climate'));
    state = confirm(state, command('open_trunk'));
    expect(state.climate.active).toBe(true);
    expect(state.trunk).toBe('open');
  });

  it('stopping charging does not unplug the cable', () => {
    let state = buildInitialState(VEHICLE_ID);
    state = { ...state, charge: { ...state.charge, status: 'charging', portOpen: true } };
    state = confirm(state, command('stop_charging'));
    expect(state.charge.status).toBe('connected_not_charging');
    // Still physically connected, and the flap is still open.
    expect(state.charge.portOpen).toBe(true);
  });

  it('refuses to close the charge flap while a cable is connected', () => {
    let state = buildInitialState(VEHICLE_ID);
    state = {
      ...state,
      charge: { ...state.charge, status: 'connected_not_charging', portOpen: true },
    };
    state = confirm(state, command('close_charge_port'));
    expect(state.charge.portOpen).toBe(true);
  });

  it('closes the flap once nothing is plugged in', () => {
    let state = buildInitialState(VEHICLE_ID);
    state = { ...state, charge: { ...state.charge, status: 'not_plugged_in', portOpen: true } };
    state = confirm(state, command('close_charge_port'));
    expect(state.charge.portOpen).toBe(false);
  });

  it('opens only the door named in the payload', () => {
    const state = confirm(
      buildInitialState(VEHICLE_ID),
      command('open_door', { payload: { door: 'rearLeft' } }),
    );
    expect(state.doors.rearLeft).toBe('open');
    expect(state.doors.frontLeft).toBe('closed');
    expect(state.doors.rearRight).toBe('closed');
  });

  it('unlocking leaves every door physically closed', () => {
    const state = confirm(buildInitialState(VEHICLE_ID), command('unlock'));
    expect(state.lock).toBe('unlocked');
    expect(Object.values(state.doors).every((d) => d === 'closed')).toBe(true);
    expect(state.trunk).toBe('closed');
  });
});
