import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import type {
  AttestationResult,
  BiometricAdapter,
  BiometricKind,
  BiometricResult,
  BluetoothAdapter,
  DeviceAttestationAdapter,
  DigitalWalletAdapter,
  DiscoveredVehicle,
  NativeAdapters,
  NfcAdapter,
  PushNotificationAdapter,
  RangingSample,
  UwbAdapter,
  WalletProvisioningState,
} from './types';
import { secureStorage } from '../secure-storage';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isWeb = Platform.OS === 'web';

/**
 * Biometric adapter.
 * On iOS/Android this calls the real OS prompt via expo-local-authentication.
 * On web — where no biometric API exists — it falls back to a clearly-labelled
 * simulation so the demo still runs end to end in a browser.
 */
export const createBiometricAdapter = (): BiometricAdapter => ({
  async isAvailable() {
    if (isWeb) return true; // simulated
    try {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      return hasHardware && enrolled;
    } catch {
      return false;
    }
  },
  async supportedKind(): Promise<BiometricKind> {
    if (isWeb) return 'face';
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
      if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
      return 'none';
    } catch {
      return 'none';
    }
  },
  async authenticate(reason: string): Promise<BiometricResult> {
    const kind = await this.supportedKind();
    if (isWeb) {
      // Simulated verification: the demo must not claim a real biometric check.
      await delay(900);
      return { success: true, kind: 'face' };
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) return { success: true, kind };
      const err = 'error' in result ? String(result.error) : 'failed';
      if (err.includes('cancel')) return { success: false, reason: 'cancelled' };
      if (err.includes('not_enrolled')) return { success: false, reason: 'not_enrolled' };
      return { success: false, reason: 'failed' };
    } catch {
      return { success: false, reason: 'unavailable' };
    }
  },
});

/** BLE discovery simulation. Real implementation: CoreBluetooth / BluetoothLeScanner. */
export const createBluetoothAdapter = (vehicleId: string): BluetoothAdapter => {
  const sessions = new Set<string>();
  return {
    async isSupported() {
      return !isWeb;
    },
    async isPoweredOn() {
      return true;
    },
    scan(onFound: (v: DiscoveredVehicle) => void) {
      let active = true;
      let rssi = -88;
      const tick = setInterval(() => {
        if (!active) return;
        // Simulate the vehicle getting "closer" as the user walks toward it.
        rssi = Math.max(-42, rssi + Math.round(Math.random() * 6 - 1));
        onFound({
          advertisementId: `adv_${vehicleId.slice(0, 6)}_rotating`,
          vehicleId,
          rssi,
        });
      }, 700);
      return () => {
        active = false;
        clearInterval(tick);
      };
    },
    async connect(advertisementId: string) {
      await delay(600);
      const sessionId = `ble_${advertisementId}_${Date.now()}`;
      sessions.add(sessionId);
      return { sessionId };
    },
    async disconnect(sessionId: string) {
      sessions.delete(sessionId);
    },
  };
};

/** UWB ranging simulation. Real implementation: NearbyInteraction / androidx.core.uwb. */
export const createUwbAdapter = (): UwbAdapter => ({
  async isSupported() {
    return !isWeb;
  },
  startRanging(_sessionId: string, onSample: (s: RangingSample) => void) {
    let distance = 6.2;
    const tick = setInterval(() => {
      distance = Math.max(0.3, distance - 0.35 + (Math.random() * 0.2 - 0.1));
      onSample({
        distanceMeters: Number(distance.toFixed(2)),
        azimuthDegrees: Math.round((Math.random() * 40 - 20) * 10) / 10,
      });
    }, 450);
    return () => clearInterval(tick);
  },
  async stopRanging() {
    /* no-op in simulation */
  },
});

/** NFC simulation. Real implementation: CoreNFC express mode / Android HCE. */
export const createNfcAdapter = (): NfcAdapter => ({
  async isSupported() {
    return !isWeb;
  },
  async isCardEmulationEnabled() {
    return !isWeb;
  },
  async presentKey(_keyRef: string) {
    await delay(700);
    return { accepted: true };
  },
});

/**
 * Wallet adapter simulation.
 * A real implementation is gated behind the Apple Car Key entitlement or Google
 * Wallet partner onboarding, and requires an OEM key server issuing CCC Digital
 * Key R3 credentials. None of that can be simulated honestly, so this adapter
 * reports `eligible` and walks the same step sequence without ever producing
 * real key material.
 */
export const createWalletAdapter = (): DigitalWalletAdapter => ({
  async eligibility(): Promise<WalletProvisioningState> {
    return isWeb ? 'unsupported' : 'eligible';
  },
  async provision(vehicleId: string, onStep: (stepId: string) => void) {
    const steps = [
      'identity',
      'eligibility',
      'biometric',
      'credential',
      'pairing',
      'proximity',
      'activate',
    ];
    for (const step of steps) {
      onStep(step);
      await delay(step === 'pairing' ? 1400 : 750);
    }
    // A reference, not a secret. The credential itself never leaves the eSE.
    return { credentialRef: `ck_ref_${vehicleId.slice(0, 6)}_${Date.now().toString(36)}` };
  },
  async revoke() {
    await delay(600);
  },
});

/** Attestation simulation. Real: App Attest (iOS) / Play Integrity (Android). */
export const createAttestationAdapter = (): DeviceAttestationAdapter => ({
  async attest(challenge: string): Promise<AttestationResult> {
    await delay(320);
    return {
      verified: true,
      // Opaque and meaningless by design: the backend is the verifier, not the app.
      token: `att_${challenge.slice(0, 8)}_simulated`,
      risk: 'low',
    };
  },
});

/** Push simulation. Real: APNs / FCM through the OEM notification service. */
export const createPushAdapter = (): PushNotificationAdapter => {
  const handlers = new Set<(p: { title: string; body: string }) => void>();
  return {
    async requestPermission() {
      await delay(400);
      return true;
    },
    async getToken() {
      return `push_token_simulated_${Platform.OS}`;
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
};

export const createNativeAdapters = (vehicleId: string): NativeAdapters => ({
  biometric: createBiometricAdapter(),
  secureStorage,
  bluetooth: createBluetoothAdapter(vehicleId),
  uwb: createUwbAdapter(),
  nfc: createNfcAdapter(),
  wallet: createWalletAdapter(),
  attestation: createAttestationAdapter(),
  push: createPushAdapter(),
});
