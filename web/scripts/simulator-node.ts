/**
 * Headless simulator.
 *
 * Runs exactly the same simulation module as the browser console — the engine,
 * the transport and the loop are shared, and only the way credentials are
 * obtained differs. Useful when you want a vehicle moving while nobody has a
 * browser tab open, or when demonstrating the mobile app on its own.
 *
 *   npm run simulator
 *
 * Configuration comes from the environment (see .env.example):
 *
 *   SIMULATOR_API_URL     where the API lives, e.g. http://localhost:3000
 *   SIMULATOR_EMAIL       an account that may simulate the vehicle
 *   SIMULATOR_PASSWORD
 *   SIMULATOR_VEHICLE_ID  optional; defaults to the first simulatable vehicle
 *   SIMULATOR_JOURNEY     "1" to start driving immediately
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { VehicleSimulation, buildInitialState } from '../lib/simulator/engine';
import { SimulatorRunner, type RunnerEvent } from '../lib/simulator/runner';
import { openHttpTransport } from '../lib/simulator/transport';
import type { ReportedVehicleState } from '../lib/vehicle/state';

loadEnv({ path: '.env.local' });
loadEnv();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See web/.env.example.`);
    process.exit(1);
  }
  return value;
};

const main = async () => {
  const apiUrl = (process.env.SIMULATOR_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
  const publishableKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const email = required('SIMULATOR_EMAIL');
  const password = required('SIMULATOR_PASSWORD');

  // The headless simulator signs in as a user exactly as the console does, then
  // exchanges that for a short-lived, vehicle-bound simulator credential. It
  // never holds the secret key.
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !auth.session) {
    console.error(`Sign-in failed: ${authError?.message ?? 'no session returned'}`);
    process.exit(1);
  }

  const accessToken = auth.session.access_token;
  const authHeaders = { authorization: `Bearer ${accessToken}` };

  let vehicleId = process.env.SIMULATOR_VEHICLE_ID ?? '';
  if (!vehicleId) {
    const response = await fetch(`${apiUrl}/api/vehicles`, { headers: authHeaders });
    const body = (await response.json()) as {
      vehicles?: { id: string; name: string; access: { canSimulate: boolean } }[];
      error?: { message: string };
    };
    if (!response.ok) {
      console.error(`Could not list vehicles: ${body.error?.message ?? response.status}`);
      process.exit(1);
    }
    const candidate = body.vehicles?.find((vehicle) => vehicle.access.canSimulate);
    if (!candidate) {
      console.error('This account has no vehicle it may simulate.');
      process.exit(1);
    }
    vehicleId = candidate.id;
    console.log(`Using vehicle ${candidate.name} (${vehicleId}).`);
  }

  // Hydrate from stored state so the headless run continues from wherever the
  // vehicle actually is, rather than teleporting it back to a default pose.
  const stateResponse = await fetch(`${apiUrl}/api/vehicles/${vehicleId}/state`, {
    headers: authHeaders,
  });
  const stateBody = (await stateResponse.json()) as {
    snapshot?: ReportedVehicleState | null;
    error?: { message: string };
  };
  if (!stateResponse.ok) {
    console.error(`Could not read vehicle state: ${stateBody.error?.message ?? stateResponse.status}`);
    process.exit(1);
  }

  const simulation = new VehicleSimulation(stateBody.snapshot ?? buildInitialState());

  const { transport, expiresAt } = await openHttpTransport({
    baseUrl: apiUrl,
    accessToken,
    vehicleId,
    label: 'Node simulator',
    ttlSeconds: 7200,
  });

  const onEvent = (event: RunnerEvent) => {
    switch (event.kind) {
      case 'state':
        if (event.revision > 0) {
          process.stdout.write(
            `\rrevision ${event.revision} · ${event.state.speedKph.toFixed(0)} km/h · ` +
              `${event.state.charge.batteryPercent.toFixed(1)}% · ${event.state.lock}      `,
          );
        }
        break;
      case 'command_claimed':
        console.log(`\nclaimed ${event.command.type}`);
        break;
      case 'command_result':
        console.log(`  → ${event.status}${event.failureReason ? ` (${event.failureReason})` : ''}`);
        break;
      case 'log':
        console.log(`\n[${event.level}] ${event.message}`);
        break;
      case 'stopped':
        console.log(`\nstopped: ${event.reason}`);
        break;
    }
  };

  const runner = new SimulatorRunner({ simulation, transport, onEvent });
  runner.start();
  console.log(`Simulator running against ${apiUrl}. Session valid until ${expiresAt}.`);

  if (process.env.SIMULATOR_JOURNEY === '1') {
    const result = simulation.setJourneyRunning(true);
    console.log(result.ok ? 'Journey started.' : `Journey not started: ${result.reason}`);
  }

  // Release the session on the way out, so the vehicle is immediately available
  // to another simulator rather than waiting for the TTL to lapse.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await runner.stop('process exiting');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
