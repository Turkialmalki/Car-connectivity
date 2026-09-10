/**
 * Backend configuration.
 *
 * The app runs in one of two modes, decided here and nowhere else:
 *
 *   connected — a real Supabase project and the Next.js API. Vehicle state
 *               comes from a separate simulator over the network.
 *   local     — the in-process mock connected cloud that shipped with the
 *               prototype. Used when no backend is configured, so the app still
 *               runs end to end on a machine with no credentials.
 *
 * The distinction is deliberately a configuration fact rather than a build
 * flag: the same binary can be pointed at a deployment or run standalone.
 */

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const readEnv = (name: string): string | null => {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
};

export const backendConfig = {
  apiUrl: readEnv('EXPO_PUBLIC_API_URL')
    ? trimTrailingSlash(readEnv('EXPO_PUBLIC_API_URL') as string)
    : null,
  supabaseUrl: readEnv('EXPO_PUBLIC_SUPABASE_URL'),
  /**
   * Publishable key only. Every permission it carries is bounded by Row Level
   * Security; the secret key exists solely on the server and is never bundled
   * into an app that ships to a device.
   */
  supabasePublishableKey: readEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
} as const;

export const isConnectedMode = (): boolean =>
  Boolean(
    backendConfig.apiUrl && backendConfig.supabaseUrl && backendConfig.supabasePublishableKey,
  );

/** Explains, in one line, why the app is running against local fixtures. */
export const localModeReason = (): string | null => {
  if (isConnectedMode()) return null;
  const missing = [
    backendConfig.apiUrl ? null : 'EXPO_PUBLIC_API_URL',
    backendConfig.supabaseUrl ? null : 'EXPO_PUBLIC_SUPABASE_URL',
    backendConfig.supabasePublishableKey ? null : 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean);
  return `Running on local fixtures. Missing ${missing.join(', ')}.`;
};
