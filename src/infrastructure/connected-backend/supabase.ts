import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { backendConfig, isConnectedMode } from './config';

/**
 * The app's Supabase client.
 *
 * Auth tokens are held by the client in AsyncStorage so a session survives a
 * restart. That is deliberately different from the Digital Key material and the
 * full VIN, which stay in the platform keychain via `secureStorage` — an OAuth
 * access token is a bearer credential with a short life and a server-side
 * revocation path; key material is neither.
 */
let client: SupabaseClient | null = null;

export const supabase = (): SupabaseClient => {
  if (client) return client;
  if (!isConnectedMode()) {
    throw new Error('Supabase is not configured. The app is running on local fixtures.');
  }

  client = createClient(backendConfig.supabaseUrl!, backendConfig.supabasePublishableKey!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no browser redirect on a device; the app handles its own links.
      detectSessionInUrl: false,
    },
  });

  return client;
};

/** The current access token, or null when nobody is signed in. */
export const currentAccessToken = async (): Promise<string | null> => {
  if (!isConnectedMode()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
};
