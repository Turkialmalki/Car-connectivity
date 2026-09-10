/**
 * Server-only. Kept out of `lib/vehicle/commands.ts` so that module stays
 * importable from the browser simulator, which must not pull in node:crypto.
 */
import { createHash } from 'node:crypto';

/**
 * Identifies the *body* behind an idempotency key.
 *
 * Two requests with the same key must be the same intent. Hashing the type and
 * a key-sorted payload means "unlock" and "open the rear left door" can never
 * collapse into one another just because a client reused a key.
 */
export const requestDigest = (type: string, payload: Record<string, unknown>): string => {
  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = payload[key];
        return acc;
      }, {}),
  );
  return createHash('sha256').update(`${type} ${canonical}`).digest('hex');
};
