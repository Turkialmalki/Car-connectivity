'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser client for the simulator console.
 *
 * Publishable key only. Everything this client can do is bounded by RLS: read
 * the vehicles you are a member of, read their state and commands, and join
 * their private realtime channel. It cannot write vehicle state or command
 * results — those tables grant it nothing but SELECT.
 */
let cached: SupabaseClient | null = null;

export const browserClient = (): SupabaseClient => {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.',
    );
  }

  cached = createBrowserClient(url, key);
  return cached;
};
