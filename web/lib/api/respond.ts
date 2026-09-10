import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

/**
 * One error shape for the whole API, so a client never has to guess where the
 * message lives:  { error: { code, message, details? } }
 */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'payload_too_large'
  | 'conflict'
  | 'stale_report'
  | 'idempotency_conflict'
  | 'session_expired'
  | 'server_error';

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  payload_too_large: 413,
  conflict: 409,
  stale_report: 409,
  idempotency_conflict: 409,
  session_expired: 401,
  server_error: 500,
};

export const fail = (code: ApiErrorCode, message: string, details?: unknown) =>
  NextResponse.json({ error: { code, message, details } }, { status: STATUS[code] });

export const ok = <T>(body: T, status = 200) => NextResponse.json(body, { status });

/** Zod issues, flattened to something a client can actually show a user. */
export const invalid = (error: ZodError) =>
  fail(
    'invalid_request',
    'The request body did not match the expected shape.',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );

/**
 * Body size guard.
 *
 * A telemetry frame is about 1.5 KB. Anything an order of magnitude larger is
 * not a vehicle report, and parsing it before finding that out would be the
 * expensive way to learn it.
 */
export const MAX_BODY_BYTES = 32 * 1024;

export const readJson = async (
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof fail> }> => {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, response: fail('payload_too_large', 'Request body is too large.') };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: fail('payload_too_large', 'Request body is too large.') };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: fail('invalid_request', 'Request body is not valid JSON.') };
  }
};
