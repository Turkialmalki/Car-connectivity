import type { ChargeState, VehicleCapabilities } from '../entities/vehicle';

/**
 * Charging preconditions.
 *
 * The single most important rule: if the cable is not physically connected,
 * "Start charging" must fail honestly. A prototype that shows a success
 * animation for an unplugged car is teaching the user to distrust the app.
 */
export type ChargingCheck = { ok: true } | { ok: false; message: string };

export const canStartCharging = (
  charge: ChargeState,
  capabilities: VehicleCapabilities,
): ChargingCheck => {
  if (!capabilities.chargeControl) {
    return { ok: false, message: 'This vehicle does not support remote charge control.' };
  }
  if (charge.status === 'not_plugged_in') {
    return { ok: false, message: 'Plug in the charging cable to start a session.' };
  }
  if (charge.status === 'fault') {
    return {
      ok: false,
      message: charge.faultReason ?? 'A charging fault must be cleared before charging can start.',
    };
  }
  if (charge.status === 'charging') {
    return { ok: false, message: 'The vehicle is already charging.' };
  }
  if (charge.batteryPercent >= charge.chargeLimitPercent) {
    return {
      ok: false,
      message: `Battery is already at the ${charge.chargeLimitPercent}% charge limit.`,
    };
  }
  return { ok: true };
};

export const canStopCharging = (charge: ChargeState): ChargingCheck => {
  if (charge.status !== 'charging') {
    return { ok: false, message: 'No charging session is in progress.' };
  }
  return { ok: true };
};

export const canScheduleCharging = (capabilities: VehicleCapabilities): ChargingCheck =>
  capabilities.chargeScheduling
    ? { ok: true }
    : { ok: false, message: 'Scheduled charging is not available on this software version.' };

/** Riyadh off-peak tariff window used for the recommendation card. */
export const OFF_PEAK_WINDOW = { start: '23:00', end: '06:00' } as const;

export const isWithinOffPeak = (time: string): boolean => {
  const minutes = toMinutes(time);
  const start = toMinutes(OFF_PEAK_WINDOW.start);
  const end = toMinutes(OFF_PEAK_WINDOW.end);
  // Window wraps midnight.
  return minutes >= start || minutes < end;
};

const toMinutes = (time: string): number => {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** Linear-ish estimate; a production app would use the vehicle's own charge curve. */
export const estimateMinutesToLimit = (
  charge: ChargeState,
  batteryCapacityKwh: number,
): number | null => {
  if (charge.powerKw <= 0) return null;
  const missingPercent = Math.max(0, charge.chargeLimitPercent - charge.batteryPercent);
  const kwhNeeded = (missingPercent / 100) * batteryCapacityKwh;
  // Taper factor: the last 20% charges materially slower on DC.
  const taper = charge.chargeLimitPercent > 80 ? 1.25 : 1;
  return Math.round((kwhNeeded / charge.powerKw) * 60 * taper);
};

export const rangeForPercent = (percent: number, maxRangeKm: number): number =>
  Math.round((percent / 100) * maxRangeKm);
