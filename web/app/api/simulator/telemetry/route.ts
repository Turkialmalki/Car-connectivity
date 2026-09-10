import { authenticateSimulator } from '@/lib/api/auth';
import { toSnapshot, type VehicleStateRow } from '@/lib/api/mappers';
import { fail, invalid, ok, readJson } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';
import { reportedStateSchema } from '@/lib/vehicle/state';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const telemetrySchema = z
  .object({
    observedAt: z.string().datetime({ offset: true }),
    reported: reportedStateSchema,
  })
  .strict();

/**
 * How far in the future an observation time may be.
 *
 * Client clocks drift. A little tolerance keeps honest simulators working; an
 * unbounded one would let a report with a year-2030 timestamp permanently block
 * every later update, because nothing could ever be newer than it.
 */
const MAX_CLOCK_SKEW_MS = 60_000;

/**
 * POST /api/simulator/telemetry
 *
 * The vehicle reporting what it is. The vehicle id comes from the session, not
 * the body, so a simulator can only ever speak for the car it was issued for.
 *
 * Staleness is decided in the database, in the same statement that writes:
 * a report whose observation time is not strictly newer than the stored one
 * changes nothing and comes back 409. That is what stops a delayed packet from
 * overwriting newer state.
 */
export async function POST(request: Request) {
  const session = await authenticateSimulator(request);
  if (!session) return fail('session_expired', 'This simulator session is no longer valid.');

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = telemetrySchema.safeParse(body.value);
  if (!parsed.success) return invalid(parsed.error);

  const observedAt = new Date(parsed.data.observedAt);
  if (observedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
    return fail('invalid_request', 'observedAt is too far in the future.');
  }

  const { data, error } = await adminClient()
    .rpc('ingest_vehicle_state', {
      p_vehicle_id: session.vehicleId,
      p_observed_at: observedAt.toISOString(),
      p_reported: parsed.data.reported,
    })
    .maybeSingle();

  if (error) {
    return fail('server_error', 'The report could not be stored.');
  }

  if (!data) {
    // Not an error on the simulator's part — just a packet that arrived after a
    // newer one. Saying so lets the simulator resynchronise instead of retrying.
    return fail('stale_report', 'A newer report is already stored for this vehicle.');
  }

  const snapshot = toSnapshot(data as VehicleStateRow);

  return ok({
    accepted: true,
    vehicleId: snapshot.vehicleId,
    revision: snapshot.revision,
    receivedAt: snapshot.lastUpdatedAt,
  });
}
