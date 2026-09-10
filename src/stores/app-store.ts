import { create } from 'zustand';
import type { AppUser, NotificationPreferences } from '@/domain/entities';
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEMO_USER,
  PRIMARY_VEHICLE_ID,
} from '@/infrastructure/mock-connected-cloud';
import { connected, connectedBackend, simulationControl } from '@/infrastructure/api';
import { supabase } from '@/infrastructure/connected-backend';
import { logger } from '@/utils/logger';
import { secureStorage, SECURE_KEYS } from '@/infrastructure/secure-storage';
import type { UnitSystem } from '@/utils/format';
import type { Language } from '@/i18n';

export type PermissionKey = 'notifications' | 'location' | 'bluetooth' | 'biometrics';

export type AuthResult = { ok: true } | { ok: false; error: string; needsConfirmation?: boolean };

type AppState = {
  hydrated: boolean;
  onboarded: boolean;
  user: AppUser | null;
  activeVehicleId: string;
  language: Language;
  units: UnitSystem;
  /** High-risk commands ask for Face ID / fingerprint when enabled. */
  requireBiometricForUnlock: boolean;
  permissions: Record<PermissionKey, boolean>;
  notificationPrefs: NotificationPreferences;
  ambientMotionEnabled: boolean;
  /**
   * Gate for horn and flash feedback on the device.
   *
   * The vehicle sounding its horn is a physical event; the phone buzzing about
   * it is a courtesy, and courtesies are opt-out.
   */
  hapticsEnabled: boolean;

  hydrate: () => Promise<void>;
  loadVehicles: () => Promise<void>;
  /**
   * Signs in.
   *
   * In connected mode credentials are required and are verified by Supabase
   * Auth. On local fixtures they are ignored and the demo account is adopted,
   * so the app still opens on a machine with no backend configured.
   */
  signIn: (credentials?: { email: string; password: string }) => Promise<AuthResult>;
  signUp: (credentials: { email: string; password: string }) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setActiveVehicle: (id: string) => void;
  setLanguage: (language: Language) => void;
  setUnits: (units: UnitSystem) => void;
  setRequireBiometric: (value: boolean) => void;
  grantPermission: (key: PermissionKey, value: boolean) => void;
  setNotificationPref: (key: keyof NotificationPreferences, value: boolean) => void;
  setAmbientMotion: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  onboarded: false,
  user: null,
  activeVehicleId: PRIMARY_VEHICLE_ID,
  language: 'en',
  units: 'metric',
  requireBiometricForUnlock: true,
  permissions: { notifications: false, location: false, bluetooth: false, biometrics: false },
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  ambientMotionEnabled: true,
  hapticsEnabled: true,

  async hydrate() {
    if (connected) {
      // Supabase owns the session. A restored session is what makes the app
      // signed in; the access token itself is never mirrored into this store.
      const { data } = await supabase().auth.getSession();
      const session = data.session;
      if (!session) {
        set({ hydrated: true, onboarded: false, user: null });
        return;
      }

      const user: AppUser = {
        ...DEMO_USER,
        id: session.user.id,
        email: session.user.email ?? DEMO_USER.email,
      };

      set({ hydrated: true, onboarded: true, user });
      await get().loadVehicles();
      return;
    }

    // Local fixtures: a session token in secure storage is what makes the app
    // "signed in". It is never mirrored into this store — only the fact that
    // one exists.
    const token = await secureStorage.get(SECURE_KEYS.sessionToken);
    set({ hydrated: true, onboarded: Boolean(token), user: token ? DEMO_USER : null });
  },

  /**
   * Loads the account's vehicles and adopts the first one.
   *
   * Connected mode has no fixture vehicle id to fall back on: which vehicle the
   * app shows is decided by which vehicles the account is a member of.
   */
  async loadVehicles() {
    if (!connected) return;
    try {
      const vehicles = await connectedBackend.listVehicles();
      const first = vehicles[0];
      if (first) set({ activeVehicleId: first.id });
    } catch (error) {
      logger.warn('Could not load vehicles for this account', { error: String(error) });
    }
  },

  async signIn(credentials) {
    if (connected) {
      if (!credentials) {
        return { ok: false, error: 'Enter your email address and password.' };
      }

      const { data, error } = await supabase().auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error || !data.session) {
        return { ok: false, error: error?.message ?? 'Sign-in failed.' };
      }

      set({
        user: {
          ...DEMO_USER,
          id: data.session.user.id,
          email: data.session.user.email ?? credentials.email,
        },
      });
      await get().loadVehicles();
      return { ok: true };
    }

    await secureStorage.set(SECURE_KEYS.sessionToken, `sim_session_${Date.now().toString(36)}`);
    set({ user: DEMO_USER });
    return { ok: true };
  },

  async signUp(credentials) {
    if (!connected) return get().signIn(credentials);

    const { data, error } = await supabase().auth.signUp({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) return { ok: false, error: error.message };

    // A project with email confirmation on returns no session yet. Saying so is
    // better than leaving the user on a screen that appears to have done nothing.
    if (!data.session) {
      return {
        ok: false,
        needsConfirmation: true,
        error: 'Check your email to confirm the account, then sign in.',
      };
    }

    set({
      user: {
        ...DEMO_USER,
        id: data.session.user.id,
        email: data.session.user.email ?? credentials.email,
      },
    });
    await get().loadVehicles();
    return { ok: true };
  },

  async signOut() {
    if (connected) {
      // Order matters: drop the realtime channel and every cache BEFORE the
      // token goes away, so nothing tries to refetch with a dead session.
      connectedBackend.reset();
      await supabase().auth.signOut();
    }
    await secureStorage.remove(SECURE_KEYS.sessionToken);
    await secureStorage.remove(SECURE_KEYS.fullVin);
    set({ user: null, onboarded: false });
  },

  completeOnboarding: () => set({ onboarded: true }),
  resetOnboarding: () => set({ onboarded: false, user: null }),

  setActiveVehicle: (id) => {
    if (!connected) simulationControl.setActiveVehicle(id);
    set({ activeVehicleId: id });
  },
  setLanguage: (language) => set({ language }),
  setUnits: (units) => set({ units }),
  setRequireBiometric: (value) => set({ requireBiometricForUnlock: value }),
  grantPermission: (key, value) => set({ permissions: { ...get().permissions, [key]: value } }),
  setNotificationPref: (key, value) =>
    set({ notificationPrefs: { ...get().notificationPrefs, [key]: value } }),
  setAmbientMotion: (value) => set({ ambientMotionEnabled: value }),
  setHapticsEnabled: (value) => set({ hapticsEnabled: value }),
}));
