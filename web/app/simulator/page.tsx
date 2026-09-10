'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SignInPanel, useSession } from '../auth-gate';
import { browserClient } from '@/lib/supabase/browser';
import { VehicleSimulation, buildInitialState } from '@/lib/simulator/engine';
import { SimulatorRunner, type RunnerEvent } from '@/lib/simulator/runner';
import { openHttpTransport } from '@/lib/simulator/transport';
import type { ReportedVehicleState } from '@/lib/vehicle/state';

type VehicleSummary = {
  id: string;
  name: string;
  model: string;
  vinMasked: string;
  isSimulated: boolean;
  access: { canSimulate: boolean; canCommand: boolean; role: string };
};

type LogEntry = { at: number; level: 'info' | 'warn' | 'error'; message: string };

const MAX_LOG_ENTRIES = 120;

export default function SimulatorPage() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <main className="shell">
        <p className="muted">Checking your session…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>Simulator console</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          This console controls a simulated vehicle. Sign in with an account that owns one.
        </p>
        <SignInPanel heading="Sign in" />
      </main>
    );
  }

  return <Console accessToken={session.access_token} email={session.user.email ?? ''} />;
}

function Console({ accessToken, email }: { accessToken: string; email: string }) {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [state, setState] = useState<ReportedVehicleState | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [journeyRunning, setJourneyRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Simulator conditions. Held in React so the controls are live, and pushed
  // into the engine on change rather than read from it every frame.
  const [exteriorTempC, setExteriorTempC] = useState(41);
  const [commandDelayMs, setCommandDelayMs] = useState(900);
  const [rejectCommands, setRejectCommands] = useState(false);
  const [connectivityLost, setConnectivityLost] = useState(false);
  const [targetSpeedKph, setTargetSpeedKph] = useState(52);

  const runnerRef = useRef<SimulatorRunner | null>(null);
  const mounted = useRef(true);

  const appendLog = useCallback((level: LogEntry['level'], message: string) => {
    setLog((entries) => [{ at: Date.now(), level, message }, ...entries].slice(0, MAX_LOG_ENTRIES));
  }, []);

  // --- Vehicle list ---------------------------------------------------------

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/vehicles', {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const body = (await response.json()) as {
          vehicles?: VehicleSummary[];
          error?: { message: string };
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error?.message ?? 'Could not load vehicles.');
          return;
        }
        const list = body.vehicles ?? [];
        setVehicles(list);
        setVehicleId((current) => current || (list.find((v) => v.access.canSimulate)?.id ?? ''));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // The runner owns timers and a network session, so unmount must stop it.
  // Without this, navigating away and back would leave two loops reporting
  // telemetry for the same vehicle.
  useEffect(
    () => () => {
      mounted.current = false;
      void runnerRef.current?.stop('console closed');
      runnerRef.current = null;
    },
    [],
  );

  const onRunnerEvent = useCallback(
    (event: RunnerEvent) => {
      if (!mounted.current) return;
      switch (event.kind) {
        case 'state':
          setState(event.state);
          if (event.revision > 0) setRevision(event.revision);
          setJourneyRunning(runnerRef.current?.getSimulation().isJourneyRunning() ?? false);
          break;
        case 'command_claimed':
          appendLog('info', `Claimed ${event.command.type}`);
          break;
        case 'command_result':
          appendLog(
            event.status === 'succeeded' ? 'info' : 'warn',
            `${event.command.type} → ${event.status}${
              event.failureReason ? ` (${event.failureReason})` : ''
            }`,
          );
          break;
        case 'log':
          appendLog(event.level, event.message);
          break;
        case 'stopped':
          appendLog('warn', `Simulator stopped: ${event.reason}`);
          setRunning(false);
          setJourneyRunning(false);
          break;
      }
    },
    [appendLog],
  );

  // --- Start / stop ---------------------------------------------------------

  const start = useCallback(async () => {
    if (!vehicleId || runnerRef.current?.isRunning() || busy) return;
    setBusy(true);
    setError(null);

    try {
      // Hydrate from the backend first. Whatever this browser remembers is
      // irrelevant: the stored snapshot is what every client has been shown.
      const stateResponse = await fetch(`/api/vehicles/${vehicleId}/state`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const stateBody = (await stateResponse.json()) as {
        snapshot?: (ReportedVehicleState & { revision: number }) | null;
        error?: { message: string };
      };
      if (!stateResponse.ok) throw new Error(stateBody.error?.message ?? 'Could not load state.');

      const initial = stateBody.snapshot ?? buildInitialState();
      const simulation = new VehicleSimulation(initial, {
        exteriorTempC,
        commandDelayMs,
        rejectCommands,
        connectivityLost,
        targetSpeedKph,
      });

      const { transport, expiresAt } = await openHttpTransport({
        baseUrl: window.location.origin,
        accessToken,
        vehicleId,
        label: 'Browser simulator',
      });

      const runner = new SimulatorRunner({ simulation, transport, onEvent: onRunnerEvent });
      runnerRef.current = runner;
      runner.start();

      setState(simulation.snapshot());
      setRevision(stateBody.snapshot?.revision ?? null);
      setRunning(true);
      setJourneyRunning(simulation.isJourneyRunning());
      appendLog('info', `Session open until ${new Date(expiresAt).toLocaleTimeString()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [
    accessToken,
    appendLog,
    busy,
    commandDelayMs,
    connectivityLost,
    exteriorTempC,
    onRunnerEvent,
    rejectCommands,
    targetSpeedKph,
    vehicleId,
  ]);

  const stop = useCallback(async () => {
    setBusy(true);
    await runnerRef.current?.stop('stopped from the console');
    runnerRef.current = null;
    setRunning(false);
    setJourneyRunning(false);
    setBusy(false);
  }, []);

  const toggleJourney = useCallback(() => {
    const simulation = runnerRef.current?.getSimulation();
    if (!simulation) return;
    const next = !simulation.isJourneyRunning();
    const result = simulation.setJourneyRunning(next);
    if (!result.ok) {
      setError(result.reason ?? 'The journey could not start.');
      return;
    }
    setError(null);
    setJourneyRunning(next);
    appendLog('info', next ? 'Journey started.' : 'Journey paused.');
  }, [appendLog]);

  // Condition changes reach a running engine immediately; when it is not
  // running they are simply the settings the next session starts with.
  useEffect(() => {
    runnerRef.current?.configure({
      exteriorTempC,
      commandDelayMs,
      rejectCommands,
      connectivityLost,
      targetSpeedKph,
    });
  }, [exteriorTempC, commandDelayMs, rejectCommands, connectivityLost, targetSpeedKph]);

  const setBattery = useCallback((percent: number) => {
    runnerRef.current?.getSimulation().setBatteryPercent(percent);
    setState(runnerRef.current?.getSimulation().snapshot() ?? null);
  }, []);

  const selected = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  const simulatable = vehicles.filter((vehicle) => vehicle.access.canSimulate);

  return (
    <main className="shell">
      <div className="simulated-banner" role="status">
        <span aria-hidden>▲</span>
        <span>
          <strong>Simulated vehicle.</strong> Nothing on this page contacts a physical car. Every
          command and every report here is produced by the simulation running in this browser tab.
        </span>
      </div>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.02em' }}>
            Simulator console
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Signed in as {email} · <Link href="/">Back</Link>
          </p>
        </div>
        <span className={`pill ${running ? 'live' : ''}`}>
          {running ? 'Simulation running' : 'Stopped'}
          {revision !== null ? ` · revision ${revision}` : ''}
        </span>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        <section className="card">
          <h2>Vehicle</h2>
          {simulatable.length === 0 ? (
            <p className="muted">
              No vehicle on this account allows simulation. Sign in on the mobile app once to have
              one provisioned, or ask an owner for simulator access.
            </p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="vehicle">Authorized vehicles</label>
                <select
                  id="vehicle"
                  value={vehicleId}
                  disabled={running}
                  onChange={(event) => setVehicleId(event.target.value)}
                >
                  {simulatable.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} — {vehicle.model} ({vehicle.vinMasked})
                    </option>
                  ))}
                </select>
              </div>
              {selected ? (
                <p className="muted">
                  Role: {selected.access.role}. Changing vehicle requires stopping the simulation,
                  because a session is bound to one vehicle.
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  onClick={() => void start()}
                  disabled={running || busy || !vehicleId}
                >
                  Start simulation
                </button>
                <button className="btn danger" onClick={() => void stop()} disabled={!running || busy}>
                  Stop
                </button>
                <button className="btn" onClick={toggleJourney} disabled={!running}>
                  {journeyRunning ? 'Pause journey' : 'Start journey'}
                </button>
              </div>
              {running && !journeyRunning && !state?.driveReady ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  A journey needs the vehicle ready to drive. Send <strong>Enable EV power</strong>{' '}
                  from the mobile app first — authorising drive power and moving the car are
                  deliberately two separate acts.
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="card">
          <h2>Reported state</h2>
          {state ? (
            <dl className="kv">
              <dt>Connectivity</dt>
              <dd>{state.connectivity}</dd>
              <dt>Lock</dt>
              <dd>{state.lock}</dd>
              <dt>Power</dt>
              <dd>{state.power}</dd>
              <dt>Drive ready</dt>
              <dd>{state.driveReady ? 'yes' : 'no'}</dd>
              <dt>Gear · speed</dt>
              <dd>
                {state.gear} · {state.speedKph.toFixed(1)} km/h
              </dd>
              <dt>Position</dt>
              <dd className="mono">
                {state.location.latitude.toFixed(5)}, {state.location.longitude.toFixed(5)}
              </dd>
              <dt>Heading</dt>
              <dd>{state.location.headingDegrees.toFixed(0)}°</dd>
              <dt>Battery</dt>
              <dd>
                {state.charge.batteryPercent.toFixed(1)}% · {state.charge.estimatedRangeKm} km
              </dd>
              <dt>Charging</dt>
              <dd>{state.charge.status}</dd>
              <dt>Doors</dt>
              <dd>
                {Object.entries(state.doors)
                  .filter(([, value]) => value === 'open')
                  .map(([key]) => key)
                  .join(', ') || 'all closed'}
              </dd>
              <dt>Boot · front boot</dt>
              <dd>
                {state.trunk} · {state.frunk}
              </dd>
              <dt>Climate</dt>
              <dd>
                {state.climate.active ? 'on' : 'off'} · cabin{' '}
                {state.climate.interiorTempC.toFixed(1)}°C → {state.climate.targetTempC}°C
              </dd>
            </dl>
          ) : (
            <p className="muted">Start the simulation to see reported state.</p>
          )}
        </section>

        <section className="card">
          <h2>Conditions</h2>
          <div className="field">
            <label htmlFor="battery">
              Battery — {state ? `${state.charge.batteryPercent.toFixed(0)}%` : 'n/a'}
            </label>
            <input
              id="battery"
              type="range"
              min={1}
              max={100}
              step={1}
              disabled={!running}
              value={state?.charge.batteryPercent ?? 72}
              onChange={(event) => setBattery(Number(event.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="exterior">Outside temperature — {exteriorTempC}°C</label>
            <input
              id="exterior"
              type="range"
              min={-10}
              max={55}
              step={1}
              value={exteriorTempC}
              onChange={(event) => setExteriorTempC(Number(event.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="speed">Cruising speed — {targetSpeedKph} km/h</label>
            <input
              id="speed"
              type="range"
              min={10}
              max={120}
              step={1}
              value={targetSpeedKph}
              onChange={(event) => setTargetSpeedKph(Number(event.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="delay">Command delay — {commandDelayMs} ms</label>
            <input
              id="delay"
              type="range"
              min={0}
              max={8000}
              step={100}
              value={commandDelayMs}
              onChange={(event) => setCommandDelayMs(Number(event.target.value))}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="reject">Refuse every command</label>
            <input
              id="reject"
              type="checkbox"
              checked={rejectCommands}
              onChange={(event) => setRejectCommands(event.target.checked)}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="offline">Simulate connectivity loss</label>
            <input
              id="offline"
              type="checkbox"
              checked={connectivityLost}
              onChange={(event) => setConnectivityLost(event.target.checked)}
            />
          </div>
          {connectivityLost ? (
            <p className="muted" style={{ marginTop: 10 }}>
              The simulator has stopped reporting. The app should now show its last known state
              with an age, not a frozen live view.
            </p>
          ) : null}
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Commands and events</h2>
          {log.length === 0 ? (
            <p className="muted">
              Nothing yet. Send a command from the mobile app and it will be claimed here.
            </p>
          ) : (
            <div className="log">
              {log.map((entry) => (
                <div className="log-row" key={`${entry.at}-${entry.message}`}>
                  <time className="mono">{new Date(entry.at).toLocaleTimeString()}</time>
                  <span
                    style={{
                      color:
                        entry.level === 'error'
                          ? 'var(--red)'
                          : entry.level === 'warn'
                            ? 'var(--amber)'
                            : 'var(--text)',
                    }}
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
