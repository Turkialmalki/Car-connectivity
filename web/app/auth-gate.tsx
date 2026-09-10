'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabase/browser';

/**
 * Session plumbing shared by the landing page and the simulator console.
 *
 * The subscription is torn down on unmount, and a ref guards against a state
 * update landing after the component has gone — the same discipline the mobile
 * client applies to its realtime subscription, for the same reason.
 */
export const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const supabase = browserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted.current) return;
      setSession(next);
    });

    return () => {
      mounted.current = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
};

/**
 * A shared, pre-provisioned account.
 *
 * Every vehicle in this system is simulated, so a demo account controls nothing
 * that exists. Its purpose is that somebody can look at the system without
 * first inventing a password and waiting for a confirmation email — and it is
 * an ordinary account with ordinary permissions, not a bypass: it authenticates
 * through Supabase Auth like any other and sees only its own vehicle.
 */
export const DEMO_ACCOUNT = {
  email: 'demo@carconnectivity.app',
  password: 'demo-vehicle-2026',
} as const;

export const SignInPanel = ({ heading }: { heading: string }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signInAsDemo = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: demoError } = await browserClient().auth.signInWithPassword(DEMO_ACCOUNT);
    if (demoError) setError(demoError.message);
    setBusy(false);
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      setNotice(null);

      const supabase = browserClient();
      const result =
        mode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/simulator` },
            });

      if (result.error) {
        setError(result.error.message);
      } else if (mode === 'sign-up' && !result.data.session) {
        setNotice('Check your email to confirm the account, then sign in.');
      }
      setBusy(false);
    },
    [email, password, mode],
  );

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>{heading}</h2>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <button
        className="btn primary"
        style={{ width: '100%', marginBottom: 8 }}
        onClick={() => void signInAsDemo()}
        disabled={busy}
      >
        {busy ? 'Signing in…' : 'Open the demo vehicle'}
      </button>
      <p className="muted" style={{ marginBottom: 18 }}>
        No sign-up needed. A simulated vehicle is already attached to this account.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '18px 0',
          color: 'var(--text-tertiary)',
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        or use your own account
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 14 }}>
        {mode === 'sign-in' ? 'No account yet?' : 'Already have an account?'}{' '}
        <button
          className="btn"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'sign-in' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  );
};
