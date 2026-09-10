'use client';

import Link from 'next/link';
import { SignInPanel, useSession } from './auth-gate';
import { browserClient } from '@/lib/supabase/browser';

export default function Home() {
  const { session, loading } = useSession();

  return (
    <main className="shell">
      <header style={{ marginBottom: 28 }}>
        <p className="pill" style={{ marginBottom: 14 }}>
          Simulated vehicles only
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: 30, letterSpacing: '-0.02em' }}>
          Connected vehicle backend
        </h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          The authenticated API and the simulator console for the connected-vehicle mobile app.
          The mobile app sends commands, the simulator on this site executes them, and confirmed
          vehicle state flows back to every signed-in client over a private realtime channel.
        </p>
      </header>

      {loading ? (
        <p className="muted">Checking your session…</p>
      ) : session ? (
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>Signed in</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {session.user.email}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link className="btn primary" href="/simulator">
              Open the simulator console
            </Link>
            <button className="btn" onClick={() => void browserClient().auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <SignInPanel heading="Sign in to continue" />
      )}

      <section className="card" style={{ marginTop: 28 }}>
        <h2>API</h2>
        <dl className="kv">
          <dt className="mono">GET /api/vehicles</dt>
          <dd>Vehicles this account may access</dd>
          <dt className="mono">GET /api/vehicles/:id/state</dt>
          <dd>Snapshot, revision and recent commands</dd>
          <dt className="mono">POST /api/vehicles/:id/commands</dt>
          <dd>Request a command — 202 Accepted</dd>
          <dt className="mono">POST /api/simulator/sessions</dt>
          <dd>Open a vehicle-bound simulator session</dd>
          <dt className="mono">POST /api/simulator/telemetry</dt>
          <dd>Report vehicle state</dd>
          <dt className="mono">POST /api/simulator/commands/claim</dt>
          <dd>Claim the next command</dd>
          <dt className="mono">POST /api/simulator/commands/:id/result</dt>
          <dd>Report an execution result</dd>
        </dl>
      </section>
    </main>
  );
}
