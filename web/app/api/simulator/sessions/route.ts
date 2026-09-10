import {
  authenticateUser,
  authenticateSimulator,
  hashToken,
  mintSessionToken,
  vehicleAccessFor,
} from '@/lib/api/auth';
import { fail, invalid, ok, readJson } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSessionSchema = z
  .object({
    vehicleId: z.string().uuid(),
    /** Short by default. A simulator left running overnight should have to re-ask. */
    ttlSeconds: z.number().int().min(60).max(7200).optional(),
    label: z.string().max(60).optional(),
  })
  .strict();

/**
 * POST /api/simulator/sessions
 *
 * Issues a vehicle-bound simulator credential to a user who is allowed to
 * simulate that vehicle. The secret is returned exactly once and stored only as
 * a SHA-256 digest.
 *
 * Opening a session displaces any session already attached to the vehicle: a
 * partial unique index makes "one active simulator per vehicle" a database
 * guarantee rather than a convention, so two consoles cannot both claim the
 * same command.
 */
export async function POST(request: Request) {
  const user = await authenticateUser(request);
  if (!user) return fail('unauthenticated', 'A valid access token is required.');

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSessionSchema.safeParse(body.value);
  if (!parsed.success) return invalid(parsed.error);

  const { vehicleId, ttlSeconds = 1800, label } = parsed.data;

  const access = await vehicleAccessFor(user.id, vehicleId);
  if (!access) return fail('not_found', 'No such vehicle, or you do not have access to it.');
  if (!access.canSimulate) {
    return fail('forbidden', 'Your access to this vehicle does not include running a simulator.');
  }

  const token = mintSessionToken();

  const { data, error } = await adminClient()
    .rpc('open_simulator_session', {
      p_vehicle_id: vehicleId,
      p_user_id: user.id,
      p_token_hash: hashToken(token),
      p_ttl_seconds: ttlSeconds,
      p_label: label ?? 'Browser simulator',
    })
    .single();

  if (error || !data) {
    return fail('server_error', 'The simulator session could not be created.');
  }

  const row = data as { id: string; vehicle_id: string; expires_at: string; label: string };

  return ok(
    {
      session: {
        id: row.id,
        vehicleId: row.vehicle_id,
        expiresAt: row.expires_at,
        label: row.label,
        // Shown once. It is not retrievable afterwards.
        token,
      },
    },
    201,
  );
}

/**
 * DELETE /api/simulator/sessions
 *
 * Ends the caller's own simulator session. Accepts the simulator's own bearer
 * token, so a simulator can hang up cleanly when the page unloads.
 */
export async function DELETE(request: Request) {
  const session = await authenticateSimulator(request);
  if (!session) return fail('session_expired', 'This simulator session is no longer valid.');

  const { error } = await adminClient().rpc('close_simulator_session', {
    p_session_id: session.id,
    p_user_id: session.userId,
  });

  if (error) return fail('server_error', 'The session could not be closed.');
  return ok({ closed: true, sessionId: session.id });
}
