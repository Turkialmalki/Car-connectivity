/**
 * Identifier helpers.
 *
 * These IDs are for correlation and idempotency only — they are never used as
 * security tokens, nonces or key material, so a non-cryptographic source is
 * appropriate. Anything security-bearing is generated server-side or inside the
 * Secure Element, never here.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const randomString = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
};

export const commandId = (): string => `cmd_${randomString(10)}`;
export const correlationId = (): string => `corr_${randomString(12)}`;
export const idempotencyKey = (): string => `idem_${Date.now().toString(36)}_${randomString(8)}`;
export const entityId = (prefix: string): string => `${prefix}_${randomString(8)}`;

/**
 * Replay-protection concept.
 *
 * In production the command service issues a single-use nonce that the vehicle
 * checks and burns, so a captured message cannot be replayed later. The value
 * below is a placeholder that carries the *shape* of that design into the
 * prototype without pretending to provide the guarantee.
 */
export const replayNonce = (): string => `nonce_${Date.now().toString(36)}_${randomString(16)}`;
