import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Privileged server client.
 *
 * This client bypasses Row Level Security, so every handler that touches it
 * MUST authorize explicitly first — see `lib/api/auth.ts`. It is marked
 * `server-only`, which turns an accidental import from a client component into
 * a build error rather than a leaked secret key.
 */
let cached: SupabaseClient | null = null;

export const adminClient = (): SupabaseClient => {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      'Server Supabase credentials are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.',
    );
  }

  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'connected-vehicle-api' } },
  });
  return cached;
};
