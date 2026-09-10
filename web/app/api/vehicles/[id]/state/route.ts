import { authenticateUser, vehicleAccessFor } from '@/lib/api/auth';
import {
  toCommandDto,
  toSnapshot,
  toVehicleDto,
  type CommandRow,
  type VehicleRow,
  type VehicleStateRow,
} from '@/lib/api/mappers';
import { fail, ok } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vehicles/:id/state
 *
 * Returns everything a client needs to reconcile in one round trip:
 *
 *   vehicle   — identity and capabilities
 *   snapshot  — the current confirmed state, with its revision
 *   commands  — recent commands, so a client returning from the background can
 *               resolve what happened to anything it left in flight instead of
 *               guessing or, worse, resending it
 *
 * The revision is the reconciliation primitive: a client adopts a realtime
 * message only when its revision exceeds the one it already holds, so an
 * out-of-order delivery cannot move state backwards.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: vehicleId } = await ctx.params;

  const user = await authenticateUser(request);
  if (!user) return fail('unauthenticated', 'A valid access token is required.');

  const access = await vehicleAccessFor(user.id, vehicleId);
  if (!access) return fail('not_found', 'No such vehicle, or you do not have access to it.');

  const db = adminClient();

  // Settle expiry before reporting, so a client is never told a command is
  // still queued when its window has already closed.
  await db.rpc('expire_stale_commands', { p_vehicle_id: vehicleId });

  const [vehicleResult, stateResult, commandResult] = await Promise.all([
    db.from('vehicles').select('*').eq('id', vehicleId).single(),
    db.from('vehicle_state').select('*').eq('vehicle_id', vehicleId).maybeSingle(),
    db
      .from('vehicle_commands')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('requested_at', { ascending: false })
      .limit(40),
  ]);

  if (vehicleResult.error || !vehicleResult.data) {
    return fail('not_found', 'No such vehicle, or you do not have access to it.');
  }

  const snapshot = stateResult.data
    ? toSnapshot(stateResult.data as VehicleStateRow)
    : null;

  return ok({
    vehicle: {
      ...toVehicleDto(vehicleResult.data as VehicleRow),
      access: {
        role: access.role,
        canCommand: access.canCommand,
        canSimulate: access.canSimulate,
      },
    },
    snapshot,
    commands: ((commandResult.data ?? []) as CommandRow[]).map(toCommandDto),
    serverTime: new Date().toISOString(),
  });
}
