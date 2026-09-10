/**
 * Native connectivity boundary.
 *
 * Everything the app needs from the device that JavaScript cannot safely own is
 * expressed here as a typed interface. The prototype ships simulation
 * implementations; production would swap in native modules without any change
 * to features, screens or domain code.
 *
 * PRODUCTION OWNERSHIP MAP
 * ------------------------------------------------------------------------
 * BiometricAdapter          iOS: LocalAuthentication (Swift)
 *                           Android: BiometricPrompt + StrongBox (Kotlin)
 * SecureStorageAdapter      iOS: Keychain, kSecAttrAccessibleWhenUnlockedThisDeviceOnly
 *                           Android: EncryptedSharedPreferences + Keystore (StrongBox)
 * BluetoothAdapter          iOS: CoreBluetooth (Swift)
 *                           Android: BluetoothLeScanner (Kotlin)
 * UwbAdapter                iOS: NearbyInteraction (requires U1/U2 chip)
 *                           Android: androidx.core.uwb
 * NfcAdapter                iOS: CoreNFC / Wallet express mode
 *                           Android: HostApduService (HCE)
 * DigitalWalletAdapter      Apple Wallet Car Keys — requires the Apple Car Key
 *                           entitlement, granted only to automakers under an
 *                           executed agreement. Google Wallet Digital Car Key
 *                           requires Google partner onboarding. Both implement
 *                           the CCC (Car Connectivity Consortium) Digital Key
 *                           R3 specification, with OEM-issued certificates and
 *                           a vehicle-side pairing ceremony.
 * DeviceAttestationAdapter  iOS: App Attest / DeviceCheck
 *                           Android: Play Integrity API
 * PushNotificationAdapter   APNs / FCM via the OEM notification service
 * ------------------------------------------------------------------------
 *
 * SECURITY INVARIANT: no adapter below ever returns private key material into
 * JavaScript. They return booleans, handles, opaque references and public
 * identifiers only. Private keys live in the Secure Enclave / StrongBox / eSE
 * and are used there, never exported.
 */

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

export type BiometricResult =
  | { success: true; kind: BiometricKind }
  | { success: false; reason: 'cancelled' | 'unavailable' | 'not_enrolled' | 'failed' };

export interface BiometricAdapter {
  isAvailable(): Promise<boolean>;
  supportedKind(): Promise<BiometricKind>;
  /** `reason` is shown by the OS prompt and must state what is being authorised. */
  authenticate(reason: string): Promise<BiometricResult>;
}

export interface SecureStorageAdapter {
  /**
   * Values written here are considered sensitive (session tokens, VIN,
   * pairing references). Never Zustand, never AsyncStorage, never source.
   */
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  isHardwareBacked(): Promise<boolean>;
}

export type DiscoveredVehicle = {
  /** Rotating, privacy-preserving advertisement id — never the VIN. */
  advertisementId: string;
  vehicleId: string;
  rssi: number;
};

export interface BluetoothAdapter {
  isSupported(): Promise<boolean>;
  isPoweredOn(): Promise<boolean>;
  /** Scans for the vehicle's Digital Key service UUID. Returns an unsubscribe. */
  scan(onFound: (vehicle: DiscoveredVehicle) => void): () => void;
  /** Establishes the encrypted BLE session used to carry Digital Key APDUs. */
  connect(advertisementId: string): Promise<{ sessionId: string }>;
  disconnect(sessionId: string): Promise<void>;
}

export type RangingSample = { distanceMeters: number; azimuthDegrees: number | null };

export interface UwbAdapter {
  isSupported(): Promise<boolean>;
  /**
   * Precise, time-of-flight ranging. This is what makes passive entry safe:
   * a relay attacker can amplify a BLE signal, but cannot fake the speed of light.
   */
  startRanging(sessionId: string, onSample: (sample: RangingSample) => void): () => void;
  stopRanging(sessionId: string): Promise<void>;
}

export interface NfcAdapter {
  isSupported(): Promise<boolean>;
  /** Card-emulation availability — the phone acting as the key, not reading one. */
  isCardEmulationEnabled(): Promise<boolean>;
  /** Simulates presenting the key to a door-handle reader. */
  presentKey(keyRef: string): Promise<{ accepted: boolean }>;
}

export type WalletProvisioningState = 'unsupported' | 'eligible' | 'provisioning' | 'provisioned';

export interface DigitalWalletAdapter {
  /**
   * Returns whether this device+account can hold an OEM car key in the platform
   * wallet. Requires the Apple Car Key entitlement / Google Wallet partnership.
   */
  eligibility(): Promise<WalletProvisioningState>;
  /**
   * Kicks off the platform provisioning ceremony. The OEM server, the wallet and
   * the vehicle perform the key exchange; the app only observes progress.
   * Returns a NON-SECRET credential reference for display and revocation.
   */
  provision(
    vehicleId: string,
    onStep: (stepId: string) => void,
  ): Promise<{ credentialRef: string }>;
  revoke(credentialRef: string): Promise<void>;
}

export type AttestationResult = {
  verified: boolean;
  /** Opaque token forwarded to the backend; the backend, not the app, verifies it. */
  token: string;
  risk: 'low' | 'medium' | 'high';
};

export interface DeviceAttestationAdapter {
  /** Proves this is a genuine, unmodified app on genuine hardware. */
  attest(challenge: string): Promise<AttestationResult>;
}

export interface PushNotificationAdapter {
  requestPermission(): Promise<boolean>;
  getToken(): Promise<string | null>;
  onMessage(handler: (payload: { title: string; body: string }) => void): () => void;
}

export type NativeAdapters = {
  biometric: BiometricAdapter;
  secureStorage: SecureStorageAdapter;
  bluetooth: BluetoothAdapter;
  uwb: UwbAdapter;
  nfc: NfcAdapter;
  wallet: DigitalWalletAdapter;
  attestation: DeviceAttestationAdapter;
  push: PushNotificationAdapter;
};
