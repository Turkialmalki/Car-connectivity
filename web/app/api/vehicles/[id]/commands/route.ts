import { randomUUID } from 'node:crypto';
import { authenticateUser, vehicleAccessFor } from '@/lib/api/auth';
import { requestDigest } from '@/lib/api/digest';
import { toCommandDto, type CommandRow } from '@/lib/api/mappers';
import { fail, ok, invalid, readJson } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';
import {
  COMMAND_CAPABILITY,
  COMMAND_PAYLOAD_SCHEMA,
  DEFAULT_EXPIRY_SECONDS,
  commandRequestSchema,
} from '@/lib/vehicle/commands';
import type { VehicleCapabilities } from '@/lib/vehicle/state';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vehicles/:id/commands
 *
 * Accepts a *request*, returns 202. The response says the request was recorded;
 * it says nothing about whether the vehicle did anything, because at this point
 * nothing has been asked of the vehicle yet.
 *
 * Order matters here:
 *   1. authenticate the user
 *   2. check they may command THIS vehicle
 *   3. check the vehicle can do the thing at all (capabilities)
 *   4. validate the payload against that specific command's rules
 *   5. persist under the idempotency key
 *
 * A retry with the same key returns the original command with 200 instead of
 * queueing a second one — the difference between "unlock" and "unlock twice".
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: vehicleId } = await ctx.params;

  const user = await authenticateUser(request);
  if (!user) return fail('unauthenticated', 'A valid access token is required.');

  const access = await vehicleAccessFor(user.id, vehicleId);
  if (!access) return fail('not_found', 'No such vehicle, or you do not have access to it.');
  if (!access.canCommand) {
    return fail('forbidden', 'Your access to this vehicle does not include sending commands.');
  }

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = commandRequestSchema.safeParse(body.value);
  if (!parsed.success) return invalid(parsed.error);

  const { type, idempotencyKey } = parsed.data;

  const payloadParsed = COMMAND_PAYLOAD_SCHEMA[type].safeParse(parsed.data.payload ?? {});
  if (!payloadParsed.success) return invalid(payloadParsed.error);
  const payload = payloadParsed.data as Record<string, unknown>;

  const db = adminClient();

  const { data: vehicle, error: vehicleError } = await db
    .from('vehicles')
    .select('capabilities')
    .eq('id', vehicleId)
    .single();

  if (vehicleError || !vehicle) {
    return fail('not_found', 'No such vehicle, or you do not have access to it.');
  }

  const capabilities = vehicle.capabilities as VehicleCapabilities;
  const requiredCapability = COMMAND_CAPABILITY[type];
  if (!capabilities?.[requiredCapability]) {
    return fail(
      'forbidden',
      `This vehicle does not support ${type.replace(/_/g, ' ')}.`,
      { failureCode: 'capability_unsupported', capability: requiredCapability },
    );
  }

  const expiresInSeconds = parsed.data.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS[type];
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const { data, error } = await db
    .rpc('request_command', {
      p_vehicle_id: vehicleId,
      p_user_id: user.id,
      p_type: type,
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
      p_request_digest: requestDigest(type, payload),
      p_correlation_id: `corr_${randomUUID()}`,
      p_expires_at: expiresAt,
    })
    .single();

  if (error || !data) {
    return fail('server_error', 'The command could not be recorded.');
  }

  const result = data as {
    command: CommandRow;
    replayed: boolean;
    digest_conflict: boolean;
  };

  if (result.digest_conflict) {
    return fail(
      'idempotency_conflict',
      'That idempotency key was already used for a different command.',
    );
  }

  const command = toCommandDto(result.command);

  // A replay is answered with 200 and the original command: the caller learns
  // the outcome of their first attempt rather than causing a second one.
  return ok({ command, replayed: result.replayed }, result.replayed ? 200 : 202);
}
