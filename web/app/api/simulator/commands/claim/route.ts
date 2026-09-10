import { authenticateSimulator } from '@/lib/api/auth';
import { toCommandDto, type CommandRow } from '@/lib/api/mappers';
import { fail, ok } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/simulator/commands/claim
 *
 * Hands the simulator the next command to execute, or nothing.
 *
 * The claim is a single UPDATE with FOR UPDATE SKIP LOCKED, so a command is
 * handed out exactly once even if two requests arrive in the same millisecond —
 * which is what keeps a double-tapped unlock from being executed twice.
 *
 * Expired commands are settled before the claim runs, so a command whose window
 * closed while it sat in the queue is never started.
 */
export async function POST(request: Request) {
  const session = await authenticateSimulator(request);
  if (!session) return fail('session_expired', 'This simulator session is no longer valid.');

  const { data, error } = await adminClient()
    .rpc('claim_next_command', {
      p_vehicle_id: session.vehicleId,
      p_session_id: session.id,
    })
    .maybeSingle();

  if (error) return fail('server_error', 'The command queue could not be read.');

  // An empty queue is a normal answer, not a 404.
  if (!data || !(data as CommandRow).id) return ok({ command: null });

  return ok({ command: toCommandDto(data as CommandRow) });
}
