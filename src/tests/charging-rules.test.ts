import {
  canScheduleCharging,
  canStartCharging,
  canStopCharging,
  estimateMinutesToLimit,
  isWithinOffPeak,
  rangeForPercent,
} from '@/domain/use-cases';
import type { ChargeState, VehicleCapabilities } from '@/domain/entities';

const capabilities: VehicleCapabilities = {
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

const charge = (overrides: Partial<ChargeState> = {}): ChargeState => ({
  batteryPercent: 50,
  estimatedRangeKm: 260,
  status: 'connected_not_charging',
  chargeLimitPercent: 80,
  powerKw: 0,
  addedRangeKm: 0,
  minutesRemaining: null,
  portOpen: true,
  locationLabel: 'Home — Al Nakheel',
  scheduleEnabled: true,
  scheduleStart: '23:00',
  scheduleEnd: '06:00',
  batteryHealthPercent: 97,
  ...overrides,
});

describe('charging prerequisites', () => {
  it('refuses to start when the cable is not connected', () => {
    const result = canStartCharging(charge({ status: 'not_plugged_in' }), capabilities);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Plug in');
  });

  it('starts when connected and below the limit', () => {
    expect(canStartCharging(charge(), capabilities).ok).toBe(true);
  });

  it('refuses to start when already at the charge limit', () => {
    const result = canStartCharging(charge({ batteryPercent: 80 }), capabilities);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('80%');
  });

  it('refuses to start while a fault is unresolved, and surfaces the fault', () => {
    const result = canStartCharging(
      charge({ status: 'fault', faultReason: 'Ground fault detected.' }),
      capabilities,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Ground fault detected.');
  });

  it('refuses to start when the vehicle lacks charge control', () => {
    const result = canStartCharging(charge(), { ...capabilities, chargeControl: false });
    expect(result.ok).toBe(false);
  });

  it('refuses to stop when no session is running', () => {
    expect(canStopCharging(charge()).ok).toBe(false);
    expect(canStopCharging(charge({ status: 'charging' })).ok).toBe(true);
  });

  it('gates scheduling on the capability flag', () => {
    expect(canScheduleCharging(capabilities).ok).toBe(true);
    expect(canScheduleCharging({ ...capabilities, chargeScheduling: false }).ok).toBe(false);
  });
});

describe('charging estimates', () => {
  it('returns no estimate when no power is flowing', () => {
    expect(estimateMinutesToLimit(charge(), 98)).toBeNull();
  });

  it('estimates time to the limit from current power', () => {
    // 30% of 100 kWh = 30 kWh at 10 kW ≈ 180 minutes.
    const minutes = estimateMinutesToLimit(charge({ powerKw: 10 }), 100);
    expect(minutes).toBe(180);
  });

  it('applies a taper penalty above an 80% limit', () => {
    const normal = estimateMinutesToLimit(charge({ powerKw: 10, chargeLimitPercent: 80 }), 100);
    const tapered = estimateMinutesToLimit(charge({ powerKw: 10, chargeLimitPercent: 90 }), 100);
    expect(tapered).toBeGreaterThan(normal!);
  });

  it('converts a percentage into range', () => {
    expect(rangeForPercent(50, 528)).toBe(264);
  });
});

describe('off-peak window', () => {
  it('recognises times inside the overnight window', () => {
    expect(isWithinOffPeak('23:30')).toBe(true);
    expect(isWithinOffPeak('02:00')).toBe(true);
    expect(isWithinOffPeak('05:59')).toBe(true);
  });

  it('recognises times outside it', () => {
    expect(isWithinOffPeak('06:00')).toBe(false);
    expect(isWithinOffPeak('14:00')).toBe(false);
    expect(isWithinOffPeak('22:59')).toBe(false);
  });
});
