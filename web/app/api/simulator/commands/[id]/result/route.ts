import { authenticateSimulator, isUuid } from '@/lib/api/auth';
import { toCommandDto, type CommandRow } from '@/lib/api/mappers';
import { fail, invalid, ok, readJson } from '@/lib/api/respond';
import { adminClient } from '@/lib/supabase/admin';
import { FAILURE_CODES } from '@/lib/vehicle/commands';
import { reportedStateSchema } from '@/lib/vehicle/state';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const resultSchema = z
  .object({
    status: z.enum(['succeeded', 'failed', 'rejected']),
    failureCode: z.enum(FAILURE_CODES).optional(),
    failureReason: z.string().max(240).optional(),
    /** The state the command produced. Written in the same transaction. */
    observedAt: z.string().datetime({ offset: true }).optional(),
    reported: reportedStateSchema.optional(),
    detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict()
  .refine((value) => value.status === 'succeeded' || Boolean(value.failureCode), {
    message: 'A non-successful result must carry a failureCode.',
    path: ['failureCode'],
  });

/**
 * POST /api/simulator/commands/:id/result
 *
 * The vehicle's acknowledgement. Two rules are enforced in the database rather
 * than here, because they are correctness rather than convenience:
 *
 *   - a session may only report on a command IT claimed;
 *   - a command that already reached a terminal status is not re-completed, so
 *     a duplicated delivery cannot rewrite an outcome that has already been
 *     shown to a user.
 *
 * The result and the resulting state land in one transaction. Without that, a
 * client could read "unlock succeeded" against a snapshot still reporting the
 * car as locked.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: commandId } = await ctx.params;
  if (!isUuid(commandId)) return fail('not_found', 'No such command.');

  const session = await authenticateSimulator(request);
  if (!session) return fail('session_expired', 'This simulator session is no longer valid.');

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = resultSchema.safeParse(body.value);
  if (!parsed.success) return invalid(parsed.error);

  const { status, failureCode, failureReason, observedAt, reported, detail } = parsed.data;

  const { data, error } = await adminClient()
    .rpc('apply_command_result', {
      p_command_id: commandId,
      p_vehicle_id: session.vehicleId,
      p_session_id: session.id,
      p_status: status,
      p_failure_code: failureCode ?? null,
      p_failure_reason: failureReason ?? null,
      p_result: detail ?? {},
      p_observed_at: observedAt ?? null,
      p_reported: reported ?? null,
    })
    .single();

  if (error) {
    // Error codes raised by apply_command_result, mapped to HTTP.
    if (error.code === 'P0002' || error.message.includes('NOTOWN')) {
      return fail('forbidden', 'That command was not claimed by this simulator session.');
    }
    if (error.code === 'P0003' || error.message.includes('DONE')) {
      return fail('conflict', 'That command already has a final result.');
    }
    return fail('server_error', 'The result could not be recorded.');
  }

  return ok({ command: toCommandDto(data as CommandRow) });
}
