import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SecureStorageAdapter } from '../native-connectivity/types';

/**
 * SecureStore abstraction.
 *
 * On device this is Keychain (iOS) / EncryptedSharedPreferences backed by the
 * Android Keystore. On web there is no hardware-backed store at all, so the
 * adapter degrades to an explicitly in-memory implementation that is wiped on
 * reload — the demo keeps working, but nothing sensitive is ever persisted to
 * localStorage where any script could read it.
 *
 * WHAT BELONGS HERE: session tokens, the full VIN, pairing references.
 * WHAT NEVER BELONGS ANYWHERE IN JS: private key material for Digital Key.
 * That lives in the Secure Enclave / StrongBox / eSE and is used there.
 */

const memoryStore = new Map<string, string>();
const isWeb = Platform.OS === 'web';

/**
 * Keychain entry names.
 *
 * These are storage identifiers, not user-facing copy. Renaming them would
 * orphan every session, VIN and device id already written on a device — an
 * existing install would silently sign out and re-pair — so the historical
 * prefix is retained deliberately. Nothing here is ever shown in the UI.
 */
export const SECURE_KEYS = {
  sessionToken: 'nova.session.token',
  refreshToken: 'nova.session.refresh',
  fullVin: 'nova.vehicle.vin',
  pairingRef: 'nova.vehicle.pairingRef',
  deviceId: 'nova.device.id',
} as const;

export const secureStorage: SecureStorageAdapter = {
  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      memoryStore.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async get(key: string): Promise<string | null> {
    if (isWeb) return memoryStore.get(key) ?? null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async remove(key: string): Promise<void> {
    if (isWeb) {
      memoryStore.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
  async isHardwareBacked(): Promise<boolean> {
    return !isWeb;
  },
};

/** Redacts a VIN for display: only the last 4 characters are ever rendered. */
export const maskVin = (vin: string): string =>
  vin.length <= 4 ? '••••' : `${'•'.repeat(vin.length - 4)}${vin.slice(-4)}`;
