import { authenticateUser } from '@/lib/api/auth';
import { toVehicleDto, type VehicleRow } from '@/lib/api/mappers';
import { fail, ok } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vehicles — the vehicles this account may access.
 *
 * On a first call for an account with no vehicles, one simulated vehicle is
 * provisioned and the caller becomes its owner. That is a server-side function;
 * a user still cannot make themselves a member of a vehicle that already
 * belongs to somebody else.
 */
export async function GET(request: Request) {
  const user = await authenticateUser(request);
  if (!user) return fail('unauthenticated', 'A valid access token is required.');
  return listVehicles(user.id, true);
}

/** `allowProvision` is false on the second pass, so this can never loop. */
async function listVehicles(userId: string, allowProvision: boolean) {
  const user = { id: userId };
  const db = adminClient();

  const { data: memberships, error: membershipError } = await db
    .from('vehicle_members')
    .select('vehicle_id, role, can_command, can_simulate')
    .eq('user_id', user.id);

  if (membershipError) {
    return fail('server_error', 'Could not read vehicle membership.');
  }

  if (!memberships || memberships.length === 0) {
    if (!allowProvision) return ok({ vehicles: [] });
    const { error: provisionError } = await db.rpc('provision_demo_vehicle', {
      p_user_id: user.id,
    });
    if (provisionError) {
      return fail('server_error', 'Could not provision a vehicle for this account.');
    }
    return listVehicles(user.id, false);
  }

  const ids = memberships.map((m) => m.vehicle_id as string);
  const { data: vehicles, error: vehicleError } = await db
    .from('vehicles')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: true });

  if (vehicleError || !vehicles) {
    return fail('server_error', 'Could not read vehicles.');
  }

  const permissions = new Map(memberships.map((m) => [m.vehicle_id as string, m]));

  return ok({
    vehicles: vehicles.map((row) => {
      const membership = permissions.get((row as VehicleRow).id);
      return {
        ...toVehicleDto(row as VehicleRow),
        access: {
          role: membership?.role ?? 'viewer',
          canCommand: Boolean(membership?.can_command),
          canSimulate: Boolean(membership?.can_simulate),
        },
      };
    }),
  });
}
