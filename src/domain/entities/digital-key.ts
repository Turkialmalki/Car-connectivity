/**
 * Digital Key domain model.
 *
 * IMPORTANT ARCHITECTURAL DISTINCTION:
 * - Remote cloud unlock (see command.ts) travels through the connected cloud and
 *   works from anywhere, but depends on cellular coverage of the vehicle TCU.
 * - Digital Key is a LOCAL proximity capability. It works with no network at all,
 *   using BLE for discovery, UWB for secure ranging, and NFC for tap fallback.
 * These are separate capabilities with separate trust models and separate failure
 * modes, and this app never conflates them.
 *
 * In production the actual key material is an OEM-issued credential held in the
 * device Secure Element / eSE (via Apple Wallet Car Keys or Google Wallet Digital
 * Car Key, both built on the CCC Digital Key R3 spec). No private key material
 * ever enters JavaScript. Everything below models *metadata about* keys only.
 */

export type DigitalKeyState =
  'not_supported' | 'available' | 'provisioning' | 'active' | 'suspended' | 'revoked';

export const DIGITAL_KEY_STATE_COPY: Record<DigitalKeyState, { label: string; detail: string }> = {
  not_supported: {
    label: 'Not supported',
    detail: 'This vehicle or device does not support Digital Key.',
  },
  available: { label: 'Available', detail: 'Ready to set up on this device.' },
  provisioning: { label: 'Provisioning', detail: 'Creating a protected credential…' },
  active: { label: 'Active', detail: 'Your device can unlock and drive this vehicle.' },
  suspended: { label: 'Suspended', detail: 'Temporarily disabled. Can be restored by the owner.' },
  revoked: { label: 'Revoked', detail: 'Permanently removed. A new key must be provisioned.' },
};

export type DigitalKeyCarrier = 'phone' | 'watch' | 'key_card' | 'shared_phone';

export const CARRIER_COPY: Record<DigitalKeyCarrier, string> = {
  phone: 'Phone key',
  watch: 'Watch key',
  key_card: 'Physical key card',
  shared_phone: 'Shared driver key',
};

export type ProximityTech = 'ble' | 'uwb' | 'nfc';

export const PROXIMITY_COPY: Record<ProximityTech, { label: string; role: string }> = {
  ble: {
    label: 'Bluetooth LE',
    role: 'Discovers the vehicle nearby and establishes the encrypted session.',
  },
  uwb: {
    label: 'Ultra-Wideband',
    role: 'Measures precise distance so the car only opens for you, not a relayed signal.',
  },
  nfc: {
    label: 'NFC',
    role: 'Tap the door handle to unlock. Works even when your battery is low.',
  },
};

export type DigitalKey = {
  id: string;
  vehicleId: string;
  carrier: DigitalKeyCarrier;
  state: DigitalKeyState;
  deviceLabel: string;
  holderName: string;
  holderId: string;
  supportedTech: ProximityTech[];
  createdAt: string;
  lastUsedAt: string | null;
  /** ISO date, or null for a permanent owner key. */
  expiresAt: string | null;
  /** Non-secret public identifier only. Never the credential itself. */
  credentialRef: string;
  isOwnerKey: boolean;
};

export const PROVISIONING_STEPS = [
  {
    id: 'identity',
    label: 'Verify owner identity',
    detail: 'Confirming your account owns this vehicle.',
  },
  {
    id: 'eligibility',
    label: 'Confirm vehicle eligibility',
    detail: 'Checking model, software version and key slots.',
  },
  {
    id: 'biometric',
    label: 'Biometric authentication',
    detail: 'Proving it is you on this device.',
  },
  {
    id: 'credential',
    label: 'Create protected credential',
    detail: 'Generating key material inside the Secure Element.',
  },
  {
    id: 'pairing',
    label: 'Pair with vehicle',
    detail: 'Exchanging certificates with the vehicle over a secure channel.',
  },
  {
    id: 'proximity',
    label: 'Verify proximity capability',
    detail: 'Testing UWB ranging and BLE session setup.',
  },
  {
    id: 'activate',
    label: 'Activate key',
    detail: 'Enabling the key for door access and drive authorization.',
  },
] as const;

export type ProvisioningStepId = (typeof PROVISIONING_STEPS)[number]['id'];
