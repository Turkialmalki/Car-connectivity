import {
  canTransitionKey,
  initialKeyState,
  isKeyUsable,
  proximityGrade,
  techForCapability,
  transitionKey,
} from '@/domain/use-cases';
import type { DigitalKey } from '@/domain/entities';

const key = (overrides: Partial<DigitalKey> = {}): DigitalKey => ({
  id: 'key_1',
  vehicleId: 'nova_one_demo',
  carrier: 'phone',
  state: 'active',
  deviceLabel: 'iPhone 16 Pro',
  holderName: 'Owner',
  holderId: 'usr_1',
  supportedTech: ['ble', 'uwb', 'nfc'],
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  credentialRef: 'ck_ref_1',
  isOwnerKey: true,
  ...overrides,
});

describe('digital key lifecycle', () => {
  it('provisions from available through to active', () => {
    expect(canTransitionKey('available', 'provisioning')).toBe(true);
    expect(canTransitionKey('provisioning', 'active')).toBe(true);
  });

  it('suspends and resumes an active key', () => {
    const suspended = transitionKey(key(), 'suspended');
    expect(suspended.ok).toBe(true);
    if (suspended.ok) {
      const resumed = transitionKey(suspended.key, 'active');
      expect(resumed.ok).toBe(true);
    }
  });

  it('never reactivates a revoked key', () => {
    // The vehicle has already been told to distrust the credential, so there is
    // no honest way back other than provisioning new key material.
    const result = transitionKey(key({ state: 'revoked' }), 'active');
    expect(result.ok).toBe(false);
    expect(canTransitionKey('revoked', 'suspended')).toBe(false);
    expect(canTransitionKey('revoked', 'provisioning')).toBe(false);
  });

  it('cannot do anything with an unsupported key', () => {
    expect(canTransitionKey('not_supported', 'provisioning')).toBe(false);
  });

  it('falls back from provisioning to available when it aborts', () => {
    expect(canTransitionKey('provisioning', 'available')).toBe(true);
  });
});

describe('digital key usability', () => {
  it('treats only an active, unexpired key as usable', () => {
    expect(isKeyUsable(key())).toBe(true);
    expect(isKeyUsable(key({ state: 'suspended' }))).toBe(false);
    expect(isKeyUsable(key({ state: 'revoked' }))).toBe(false);
  });

  it('treats a past expiry as unusable even while marked active', () => {
    const expired = key({ expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(isKeyUsable(expired)).toBe(false);
  });
});

describe('capability mapping', () => {
  it('maps the vehicle capability to available radios', () => {
    expect(techForCapability('none')).toEqual([]);
    expect(techForCapability('nfc')).toEqual(['nfc']);
    expect(techForCapability('ble_nfc')).toEqual(['ble', 'nfc']);
    expect(techForCapability('uwb_ble_nfc')).toEqual(['ble', 'uwb', 'nfc']);
  });

  it('derives the initial state from vehicle and device support', () => {
    expect(initialKeyState('none', true)).toBe('not_supported');
    expect(initialKeyState('uwb_ble_nfc', false)).toBe('not_supported');
    expect(initialKeyState('uwb_ble_nfc', true)).toBe('available');
  });

  it('grades entry experience by the radios available', () => {
    expect(proximityGrade(['ble', 'uwb', 'nfc']).grade).toBe('hands_free');
    expect(proximityGrade(['ble', 'nfc']).grade).toBe('approach');
    expect(proximityGrade(['nfc']).grade).toBe('tap');
  });
});
