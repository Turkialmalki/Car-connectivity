import type { VehicleCommand } from '../entities/command';

/**
 * Idempotency for retries.
 *
 * A retry MUST reuse the original idempotency key so the command service can
 * recognise it as the same intent. Otherwise a user tapping "Retry" on a request
 * that actually succeeded but whose response was lost would unlock the car twice
 * — or worse, unlock a car the user believed stayed locked.
 *
 * The correlation ID, by contrast, is regenerated per attempt: it identifies the
 * *network attempt* for tracing, not the *intent*.
 */
export type IdempotencyRegistry = Map<string, VehicleCommand>;

export const createRegistry = (): IdempotencyRegistry => new Map();

/**
 * Returns the previously accepted command for this key, if any.
 * A hit means "we already know about this intent — do not create a second one".
 */
export const lookup = (
  registry: IdempotencyRegistry,
  idempotencyKey: string,
): VehicleCommand | undefined => registry.get(idempotencyKey);

export const register = (
  registry: IdempotencyRegistry,
  command: VehicleCommand,
): IdempotencyRegistry => {
  registry.set(command.idempotencyKey, command);
  return registry;
};

/**
 * Builds the retry attempt for a failed command: same id and idempotency key,
 * fresh correlation id and a fresh expiry window.
 */
export const buildRetry = (
  original: VehicleCommand,
  correlationId: string,
  now: Date = new Date(),
): VehicleCommand => {
  const ttlMs = new Date(original.expiresAt).getTime() - new Date(original.requestedAt).getTime();
  return {
    ...original,
    correlationId,
    status: 'requested',
    failureReason: undefined,
    completedAt: undefined,
    trace: [],
    wasRetry: true,
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
};
