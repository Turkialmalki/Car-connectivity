import type { DoorId, TransientEvent, VehicleCommand, VehicleState } from '@/domain/entities';
import { DRIVE_AUTHORIZATION_SECONDS, TRANSIENT_EVENT_TTL_MS } from '@/domain/entities';
import { rangeForPercent } from '@/domain/use-cases';
import { entityId } from '@/utils/id';

/** How long the vehicle spends physically flashing or sounding the horn. */
const FLASH_DURATION_MS = 2600;
const HORN_DURATION_MS = 900;

/**
 * Records a bounded physical event with its own id.
 *
 * The id is what lets a screen know it has already shown this flash, so
 * remounting the vehicle scene cannot replay it.
 */
const withTransient = (
  state: VehicleState,
  kind: TransientEvent['kind'],
  durationMs: number,
  now: string,
): TransientEvent[] => {
  const cutoff = Date.now() - TRANSIENT_EVENT_TTL_MS;
  const kept = state.transientEvents.filter((e) => new Date(e.occurredAt).getTime() >= cutoff);
  return [...kept, { id: entityId('evt'), kind, occurredAt: now, durationMs }];
};

/**
 * Applies the physical effect of a CONFIRMED command to vehicle state.
 *
 * This function is the "Vehicle ECU" of the simulation. It is deliberately the
 * only place that mutates lock, climate or charge state as a result of a
 * command — nothing in the UI layer is permitted to optimistically flip a
 * switch, which is what guarantees the interface can never show a state the
 * vehicle has not actually reached.
 */
export const applyCommandEffect = (
  state: VehicleState,
  command: VehicleCommand,
  maxRangeKm: number,
): VehicleState => {
  const now = new Date().toISOString();
  const next: VehicleState = {
    ...state,
    climate: { ...state.climate },
    charge: { ...state.charge },
    doors: { ...state.doors },
    lights: { ...state.lights },
    driveAuthorization: { ...state.driveAuthorization },
    transientEvents: state.transientEvents,
    lastUpdatedAt: now,
    isCached: false,
  };

  switch (command.type) {
    case 'lock':
      next.lock = 'locked';
      break;
    case 'unlock':
      next.lock = 'unlocked';
      break;
    case 'start_climate':
      next.climate.active = true;
      break;
    case 'stop_climate':
      next.climate.active = false;
      break;
    case 'set_temperature': {
      const target = Number(command.payload?.temperatureC ?? state.climate.targetTempC);
      next.climate.targetTempC = target;
      if (next.climate.zonesSynced) next.climate.passengerTargetTempC = target;
      break;
    }
    case 'open_trunk':
      next.trunk = 'open';
      break;
    case 'close_trunk':
      next.trunk = 'closed';
      break;
    case 'start_charging':
      next.charge.status = 'charging';
      next.charge.powerKw = next.charge.locationLabel.startsWith('Home') ? 10.8 : 148;
      next.charge.minutesRemaining = 165;
      break;
    case 'stop_charging':
      next.charge.status = 'connected_not_charging';
      next.charge.powerKw = 0;
      next.charge.minutesRemaining = null;
      break;
    case 'open_frunk':
      next.frunk = 'open';
      break;
    case 'close_frunk':
      next.frunk = 'closed';
      break;
    case 'open_door':
    case 'close_door': {
      const door = command.payload?.door as DoorId | undefined;
      if (door && door in next.doors) {
        next.doors[door] = command.type === 'open_door' ? 'open' : 'closed';
      }
      break;
    }
    case 'open_charge_port':
      next.charge.portOpen = true;
      break;
    case 'close_charge_port':
      // A cable in the port physically blocks the flap. Refusing here keeps the
      // reported state honest rather than showing a flap that cannot have moved.
      if (next.charge.status === 'not_plugged_in') next.charge.portOpen = false;
      break;
    case 'wake_vehicle':
      next.power = 'awake';
      next.lights.daytimeRunning = true;
      break;
    case 'enable_driving':
      // Authorization is a permission with an expiry. It does NOT make the
      // vehicle ready — the vehicle reports that separately once it has woken.
      next.driveAuthorization = {
        granted: true,
        grantedAt: now,
        expiresAt: new Date(Date.now() + DRIVE_AUTHORIZATION_SECONDS * 1000).toISOString(),
      };
      if (next.power === 'asleep') next.power = 'waking';
      break;
    case 'disable_driving':
      next.driveAuthorization = { granted: false, grantedAt: null, expiresAt: null };
      next.driveReady = false;
      break;
    case 'flash_lights':
      // Bounded: the vehicle flashes, then stops. No persistent light state.
      next.transientEvents = withTransient(next, 'flash', FLASH_DURATION_MS, now);
      break;
    case 'sound_horn':
      next.transientEvents = withTransient(next, 'horn', HORN_DURATION_MS, now);
      break;
  }

  next.charge.estimatedRangeKm = rangeForPercent(next.charge.batteryPercent, maxRangeKm);
  return next;
};

/**
 * Ambient telemetry drift, driven on a slow interval by the mock cloud.
 *
 * Real vehicles push telemetry continuously; this reproduces just enough of that
 * behaviour (cabin cooling toward target, state of charge rising while plugged
 * in, `lastUpdatedAt` advancing) for the "is this data fresh?" question — the
 * central question of any connected-car UI — to actually mean something.
 */
export const driftTelemetry = (
  state: VehicleState,
  maxRangeKm: number,
  batteryCapacityKwh: number,
  tickSeconds: number,
): VehicleState => {
  const next: VehicleState = {
    ...state,
    climate: { ...state.climate },
    charge: { ...state.charge },
    lights: { ...state.lights },
    driveAuthorization: { ...state.driveAuthorization },
  };

  // Waking is a real transition with a duration, not an instant flag.
  if (next.power === 'waking') {
    next.power = 'awake';
    next.lights.daytimeRunning = true;
  }

  // Drive readiness is the VEHICLE's report. It follows authorization, but only
  // once the vehicle is actually awake — and it is never inferred by the app.
  next.driveReady =
    next.driveAuthorization.granted && next.power === 'awake' && !next.isCached;

  // A grant expires on its own. Nothing re-sends it; re-authorising is a fresh
  // deliberate action by the user.
  if (next.driveAuthorization.expiresAt) {
    if (Date.now() > new Date(next.driveAuthorization.expiresAt).getTime()) {
      next.driveAuthorization = { granted: false, grantedAt: null, expiresAt: null };
      next.driveReady = false;
    }
  }

  // Retire transient events once they can no longer be relevant.
  const cutoff = Date.now() - TRANSIENT_EVENT_TTL_MS;
  const liveEvents = next.transientEvents.filter(
    (e) => new Date(e.occurredAt).getTime() >= cutoff,
  );
  if (liveEvents.length !== next.transientEvents.length) next.transientEvents = liveEvents;

  // Tail lights follow the running lights; both go out when the car sleeps.
  next.lights.taillights = next.lights.daytimeRunning || next.lights.headlights;

  // Cabin temperature moves toward target when climate runs, toward ambient otherwise.
  const goal = next.climate.active ? next.climate.targetTempC : next.climate.exteriorTempC;
  const rate = next.climate.active ? 0.32 : 0.06;
  const delta = goal - next.climate.interiorTempC;
  if (Math.abs(delta) > 0.15) {
    next.climate.interiorTempC =
      Math.round(
        (next.climate.interiorTempC + Math.sign(delta) * Math.min(Math.abs(delta), rate)) * 10,
      ) / 10;
  }

  // Climate draws meaningful energy — roughly 3.5 kW of HVAC load.
  if (next.climate.active && next.charge.status !== 'charging') {
    const kwhUsed = (3.5 * tickSeconds) / 3600;
    next.charge.batteryPercent = Math.max(
      0,
      Math.round((next.charge.batteryPercent - (kwhUsed / batteryCapacityKwh) * 100) * 10) / 10,
    );
  }

  if (next.charge.status === 'charging') {
    const kwhAdded = (next.charge.powerKw * tickSeconds) / 3600;
    const percentAdded = (kwhAdded / batteryCapacityKwh) * 100;
    next.charge.batteryPercent = Math.min(
      next.charge.chargeLimitPercent,
      Math.round((next.charge.batteryPercent + percentAdded) * 10) / 10,
    );
    next.charge.addedRangeKm = Math.round(
      next.charge.addedRangeKm + percentAdded * (maxRangeKm / 100),
    );
    if (next.charge.batteryPercent >= next.charge.chargeLimitPercent) {
      next.charge.status = 'complete';
      next.charge.powerKw = 0;
      next.charge.minutesRemaining = null;
    } else if (next.charge.minutesRemaining !== null) {
      next.charge.minutesRemaining = Math.max(0, next.charge.minutesRemaining - tickSeconds / 60);
    }
  }

  next.charge.estimatedRangeKm = rangeForPercent(next.charge.batteryPercent, maxRangeKm);
  next.lastUpdatedAt = new Date().toISOString();
  return next;
};
