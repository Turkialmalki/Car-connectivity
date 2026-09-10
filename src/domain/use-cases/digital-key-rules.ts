import { type DigitalKey, type DigitalKeyState, type ProximityTech } from '../entities/digital-key';
import type { VehicleCapabilities } from '../entities/vehicle';

/**
 * Digital Key lifecycle.
 *
 * Note that `revoked` is terminal by design. A revoked credential must never be
 * reactivated — the vehicle has already been told to distrust that key. The only
 * path back is provisioning a brand-new credential with new key material.
 */
export const KEY_TRANSITIONS: Record<DigitalKeyState, readonly DigitalKeyState[]> = {
  not_supported: [],
  available: ['provisioning'],
  provisioning: ['active', 'available'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked: [],
};

export const canTransitionKey = (from: DigitalKeyState, to: DigitalKeyState): boolean =>
  KEY_TRANSITIONS[from].includes(to);

export type KeyTransitionResult = { ok: true; key: DigitalKey } | { ok: false; reason: string };

export const transitionKey = (key: DigitalKey, to: DigitalKeyState): KeyTransitionResult => {
  if (!canTransitionKey(key.state, to)) {
    return { ok: false, reason: `Illegal key transition ${key.state} -> ${to}` };
  }
  return { ok: true, key: { ...key, state: to } };
};

/** Maps the vehicle capability enum to the concrete radios available. */
export const techForCapability = (
  capability: VehicleCapabilities['digitalKey'],
): ProximityTech[] => {
  switch (capability) {
    case 'none':
      return [];
    case 'nfc':
      return ['nfc'];
    case 'ble_nfc':
      return ['ble', 'nfc'];
    case 'uwb_ble_nfc':
      return ['ble', 'uwb', 'nfc'];
  }
};

export const initialKeyState = (
  capability: VehicleCapabilities['digitalKey'],
  deviceSupportsSecureElement: boolean,
): DigitalKeyState => {
  if (capability === 'none' || !deviceSupportsSecureElement) return 'not_supported';
  return 'available';
};

export const isKeyUsable = (key: DigitalKey, now: Date = new Date()): boolean => {
  if (key.state !== 'active') return false;
  if (key.expiresAt && new Date(key.expiresAt).getTime() < now.getTime()) return false;
  return true;
};

/** Passive-entry quality depends on which radios both ends support. */
export const proximityGrade = (
  tech: ProximityTech[],
): { grade: 'tap' | 'approach' | 'hands_free'; detail: string } => {
  if (tech.includes('uwb')) {
    return {
      grade: 'hands_free',
      detail: 'Hands-free entry. UWB confirms your exact distance and blocks relay attacks.',
    };
  }
  if (tech.includes('ble')) {
    return {
      grade: 'approach',
      detail: 'Unlocks as you approach using Bluetooth LE.',
    };
  }
  return { grade: 'tap', detail: 'Tap your phone on the door handle to unlock.' };
};
