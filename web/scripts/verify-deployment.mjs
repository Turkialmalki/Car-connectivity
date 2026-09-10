/**
 * End-to-end verification against the live deployment.
 *
 * Exercises the real network path: Supabase Auth → the Vercel API → Postgres →
 * a simulator session → back out through the API. Nothing here touches the
 * database directly; everything goes through HTTP the way the app does.
 */
const API = 'https://car-connectivity.vercel.app';
const SB = 'https://prcnihieupchvarwwmdf.supabase.co';
const PK = 'sb_publishable_dHu0ZhdTWHsKDNuPBLr9AA_nZnHGWwf';

let pass = 0;
let fail = 0;

const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const signIn = async (email) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PK, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'E2e-Passw0rd!' }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(b)}`);
  return b.access_token;
};

const api = async (path, { token, method = 'GET', body } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : {} };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  console.log(`\nAgainst ${API}\n`);

  // --- Auth and provisioning ------------------------------------------------
  console.log('Authentication and provisioning');
  const driver = await signIn('e2e-driver@carconnectivity.app');
  const stranger = await signIn('e2e-stranger@carconnectivity.app');
  check('both accounts sign in', Boolean(driver && stranger));

  const list = await api('/api/vehicles', { token: driver });
  check('GET /api/vehicles provisions a vehicle on first call', list.status === 200 && list.body.vehicles?.length === 1,
    `status ${list.status}`);
  const vehicle = list.body.vehicles[0];
  check('the vehicle is flagged as simulated', vehicle.isSimulated === true);
  check('the VIN is masked, never returned in full', /^•+[A-Z0-9]{4}$/.test(vehicle.vinMasked), vehicle.vinMasked);
  check('the caller is its owner and may command and simulate',
    vehicle.access.role === 'owner' && vehicle.access.canCommand && vehicle.access.canSimulate);

  const unauth = await api('/api/vehicles');
  check('an unauthenticated call is rejected', unauth.status === 401);

  // --- Isolation ------------------------------------------------------------
  console.log('\nIsolation between accounts');
  const peek = await api(`/api/vehicles/${vehicle.id}/state`, { token: stranger });
  check("a stranger cannot read another account's vehicle", peek.status === 404, `status ${peek.status}`);

  const hijack = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: stranger, method: 'POST',
    body: { type: 'unlock', idempotencyKey: `stranger-${Date.now()}` },
  });
  check("a stranger cannot command another account's vehicle", hijack.status === 404, `status ${hijack.status}`);

  const forgeSession = await api('/api/simulator/sessions', {
    token: stranger, method: 'POST', body: { vehicleId: vehicle.id },
  });
  check("a stranger cannot attach a simulator to another account's vehicle",
    forgeSession.status === 404, `status ${forgeSession.status}`);

  // --- Simulator session ----------------------------------------------------
  console.log('\nSimulator session');
  const session = await api('/api/simulator/sessions', {
    token: driver, method: 'POST', body: { vehicleId: vehicle.id, ttlSeconds: 600, label: 'e2e' },
  });
  check('an authorized user can open a session', session.status === 201, `status ${session.status}`);
  const simToken = session.body.session.token;
  check('the session secret is returned once', typeof simToken === 'string' && simToken.startsWith('sim_'));

  const bogus = await api('/api/simulator/telemetry', {
    token: 'sim_' + 'f'.repeat(64), method: 'POST',
    body: { observedAt: new Date().toISOString(), reported: {} },
  });
  check('a forged simulator token is rejected', bogus.status === 401, `status ${bogus.status}`);

  // --- Telemetry ------------------------------------------------------------
  console.log('\nTelemetry');
  const snap0 = await api(`/api/vehicles/${vehicle.id}/state`, { token: driver });
  const reported = { ...snap0.body.snapshot };
  delete reported.vehicleId; delete reported.revision;
  delete reported.observedAt; delete reported.lastUpdatedAt; delete reported.isCached;
  const revision0 = snap0.body.snapshot.revision;

  const t1 = new Date();
  const moved = {
    ...reported,
    location: { ...reported.location, latitude: 24.7205, longitude: 46.6710,
                headingDegrees: 12.5, capturedAt: t1.toISOString() },
    speedKph: 48.2, isMoving: true, gear: 'D',
    // Establish the precondition rather than inheriting it: a previous run left
    // this vehicle unlocked, which would make the pending-state assertion below
    // pass or fail for the wrong reason.
    lock: 'locked',
  };
  const send1 = await api('/api/simulator/telemetry', {
    token: simToken, method: 'POST', body: { observedAt: t1.toISOString(), reported: moved },
  });
  check('a report is accepted and bumps the revision',
    send1.status === 200 && send1.body.revision > revision0,
    `revision ${revision0} → ${send1.body.revision}`);

  const t0 = new Date(t1.getTime() - 8000);
  const delayed = { ...reported, location: { ...reported.location, capturedAt: t0.toISOString() } };
  const send2 = await api('/api/simulator/telemetry', {
    token: simToken, method: 'POST', body: { observedAt: t0.toISOString(), reported: delayed },
  });
  check('a delayed report cannot overwrite newer state',
    send2.status === 409 && send2.body.error.code === 'stale_report', `status ${send2.status}`);

  const afterDelayed = await api(`/api/vehicles/${vehicle.id}/state`, { token: driver });
  check('the newer position survived the delayed packet',
    afterDelayed.body.snapshot.location.latitude === 24.7205,
    `lat ${afterDelayed.body.snapshot.location.latitude}`);

  const bad = await api('/api/simulator/telemetry', {
    token: simToken, method: 'POST',
    body: { observedAt: new Date().toISOString(), reported: { ...moved, speedKph: 9999 } },
  });
  check('an out-of-range value is refused', bad.status === 400, `status ${bad.status}`);

  // --- A command, end to end ------------------------------------------------
  console.log('\nA command, end to end');
  const idem = `e2e-unlock-${Date.now()}`;
  const req = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST', body: { type: 'unlock', idempotencyKey: idem },
  });
  check('the app gets 202 Accepted, not a success', req.status === 202, `status ${req.status}`);
  check('the command is queued, not confirmed', req.body.command.status === 'queued');
  const commandId = req.body.command.id;

  const replay = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST', body: { type: 'unlock', idempotencyKey: idem },
  });
  check('a retry returns the original command instead of executing again',
    replay.status === 200 && replay.body.replayed && replay.body.command.id === commandId);

  const conflict = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST',
    body: { type: 'open_trunk', idempotencyKey: idem },
  });
  check('the same key with a different body is refused',
    conflict.status === 409 && conflict.body.error.code === 'idempotency_conflict');

  const stateWhilePending = await api(`/api/vehicles/${vehicle.id}/state`, { token: driver });
  check('the vehicle is still locked while the command is pending',
    stateWhilePending.body.snapshot.lock === 'locked', stateWhilePending.body.snapshot.lock);

  const claim1 = await api('/api/simulator/commands/claim', { token: simToken, method: 'POST' });
  check('the simulator claims the command', claim1.body.command?.id === commandId);
  check('claiming moves it to executing', claim1.body.command?.status === 'executing');

  const claim2 = await api('/api/simulator/commands/claim', { token: simToken, method: 'POST' });
  check('a second claim gets nothing — no duplicate execution', claim2.body.command === null);

  const t2 = new Date();
  const unlocked = { ...moved, lock: 'unlocked',
                     location: { ...moved.location, capturedAt: t2.toISOString() } };
  const result = await api(`/api/simulator/commands/${commandId}/result`, {
    token: simToken, method: 'POST',
    body: { status: 'succeeded', observedAt: t2.toISOString(), reported: unlocked },
  });
  check('the result is recorded', result.status === 200 && result.body.command.status === 'succeeded');

  const confirmed = await api(`/api/vehicles/${vehicle.id}/state`, { token: driver });
  check('the app now sees the vehicle unlocked', confirmed.body.snapshot.lock === 'unlocked');
  check('unlocking did not open any door',
    Object.values(confirmed.body.snapshot.doors).every((d) => d === 'closed'));
  check('the result and the state it produced are consistent',
    confirmed.body.commands.find((c) => c.id === commandId)?.status === 'succeeded');

  const dupResult = await api(`/api/simulator/commands/${commandId}/result`, {
    token: simToken, method: 'POST',
    body: { status: 'failed', failureCode: 'no_acknowledgment' },
  });
  check('a duplicated result cannot rewrite a settled outcome',
    dupResult.status === 409, `status ${dupResult.status}`);

  // --- Capability and validation -------------------------------------------
  console.log('\nValidation at the edge');
  const unknown = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST',
    body: { type: 'launch_rocket', idempotencyKey: `e2e-bad-${Date.now()}` },
  });
  check('an unknown command type is refused', unknown.status === 400, `status ${unknown.status}`);

  const badPayload = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST',
    body: { type: 'open_door', payload: { door: 'sunroof' }, idempotencyKey: `e2e-bad2-${Date.now()}` },
  });
  check('a payload outside the command’s own rules is refused',
    badPayload.status === 400, `status ${badPayload.status}`);

  const huge = await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST',
    body: { type: 'lock', idempotencyKey: `e2e-big-${Date.now()}`, payload: { blob: 'x'.repeat(40000) } },
  });
  check('an oversized body is refused', huge.status === 413 || huge.status === 400, `status ${huge.status}`);

  // --- Expiry ---------------------------------------------------------------
  console.log('\nExpiry');
  const shortIdem = `e2e-expire-${Date.now()}`;
  await api(`/api/vehicles/${vehicle.id}/commands`, {
    token: driver, method: 'POST',
    body: { type: 'lock', idempotencyKey: shortIdem, expiresInSeconds: 5 },
  });
  console.log('  (waiting 6s for the window to close)');
  await sleep(6000);
  const claimExpired = await api('/api/simulator/commands/claim', { token: simToken, method: 'POST' });
  check('a command whose window closed is never claimed', claimExpired.body.command === null);

  const afterExpiry = await api(`/api/vehicles/${vehicle.id}/state`, { token: driver });
  const expired = afterExpiry.body.commands.find((c) => c.idempotencyKey === shortIdem);
  check('it is reported as expired, with a reason',
    expired?.status === 'expired' && expired?.failureCode === 'command_expired',
    `${expired?.status} / ${expired?.failureCode}`);

  // --- One simulator per vehicle -------------------------------------------
  console.log('\nOne simulator per vehicle');
  const second = await api('/api/simulator/sessions', {
    token: driver, method: 'POST', body: { vehicleId: vehicle.id, ttlSeconds: 600, label: 'e2e-2' },
  });
  check('a second session can be opened', second.status === 201);
  const displaced = await api('/api/simulator/commands/claim', { token: simToken, method: 'POST' });
  check('the displaced session stops working immediately',
    displaced.status === 401, `status ${displaced.status}`);
  const current = await api('/api/simulator/commands/claim', {
    token: second.body.session.token, method: 'POST',
  });
  check('the current session works', current.status === 200);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error('\nAborted:', error.message);
  process.exit(1);
});
