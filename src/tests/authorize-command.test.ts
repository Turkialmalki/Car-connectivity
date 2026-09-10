import { authorizeCommand, canReachVehicle, explainUnavailable } from '@/domain/use-cases';
import type { VehicleCapabilities } from '@/domain/entities';

const fullCapabilities: VehicleCapabilities = {
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

const base = {
  capabilities: fullCapabilities,
  connectivity: 'online' as const,
  isMoving: false,
  requireBiometricForUnlock: true,
};

describe('capability-based validation', () => {
  it('allows a command the vehicle supports', () => {
    expect(authorizeCommand({ ...base, type: 'lock' }).allowed).toBe(true);
  });

  it('blocks a command the vehicle does not support, with a reason', () => {
    const result = authorizeCommand({
      ...base,
      type: 'open_trunk',
      capabilities: { ...fullCapabilities, remoteTrunk: false },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('capability_unsupported');
  });

  it('requires biometric step-up for high-risk commands only', () => {
    const unlock = authorizeCommand({ ...base, type: 'unlock' });
    const climate = authorizeCommand({ ...base, type: 'start_climate' });
    expect(unlock.allowed && unlock.requiresBiometric).toBe(true);
    expect(climate.allowed && climate.requiresBiometric).toBe(false);
  });

  it('honours the user setting that disables biometric step-up', () => {
    const result = authorizeCommand({ ...base, type: 'unlock', requireBiometricForUnlock: false });
    expect(result.allowed && result.requiresBiometric).toBe(false);
  });
});

describe('permission validation for shared drivers', () => {
  it('allows a command the driver was granted', () => {
    const result = authorizeCommand({
      ...base,
      type: 'start_climate',
      grantedPermissions: ['climate', 'drive'],
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks a command whose permission was revoked', () => {
    const result = authorizeCommand({
      ...base,
      type: 'unlock',
      grantedPermissions: ['climate'],
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('permission_revoked');
  });

  it('blocks everything for a driver with no effective permissions', () => {
    const result = authorizeCommand({ ...base, type: 'lock', grantedPermissions: [] });
    expect(result.allowed).toBe(false);
  });
});

describe('vehicle-state gating', () => {
  it('rejects restricted commands in service mode', () => {
    const result = authorizeCommand({ ...base, type: 'unlock', connectivity: 'service_mode' });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('service_mode');
  });

  it('still allows non-restricted commands in service mode', () => {
    expect(
      authorizeCommand({ ...base, type: 'flash_lights', connectivity: 'service_mode' }).allowed,
    ).toBe(true);
  });

  it('blocks unsafe commands while the vehicle is moving', () => {
    const result = authorizeCommand({ ...base, type: 'unlock', isMoving: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('vehicle_moving');
  });

  it('treats an offline vehicle as unreachable', () => {
    expect(canReachVehicle('offline')).toBe(false);
    expect(canReachVehicle('poor_signal')).toBe(true);
    expect(canReachVehicle('asleep')).toBe(true);
  });

  it('explains an unavailable control for the UI', () => {
    const reason = explainUnavailable(
      'open_trunk',
      { connectivity: 'online', isMoving: false },
      { ...fullCapabilities, remoteTrunk: false },
    );
    expect(reason).toContain('does not support');
    expect(
      explainUnavailable('lock', { connectivity: 'online', isMoving: false }, fullCapabilities),
    ).toBeNull();
  });
});
