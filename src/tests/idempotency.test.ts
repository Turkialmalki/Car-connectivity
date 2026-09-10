import { buildRetry, createRegistry, lookup, register } from '@/domain/use-cases/idempotency';
import type { VehicleCommand } from '@/domain/entities';

const command: VehicleCommand = {
  id: 'cmd_1',
  idempotencyKey: 'idem_abc',
  correlationId: 'corr_1',
  vehicleId: 'nova_one_demo',
  type: 'unlock',
  requestedAt: '2026-09-09T10:00:00.000Z',
  expiresAt: '2026-09-09T10:00:30.000Z',
  status: 'failed',
  failureReason: 'Vehicle did not acknowledge the request',
  trace: [{ stage: 'api_gateway_received', startedAt: '', elapsedMs: 90, ok: true }],
};

describe('idempotent retry', () => {
  it('reuses the idempotency key so the retry is recognisably the same intent', () => {
    const retry = buildRetry(command, 'corr_2');
    expect(retry.idempotencyKey).toBe(command.idempotencyKey);
  });

  it('issues a fresh correlation id for the new attempt', () => {
    const retry = buildRetry(command, 'corr_2');
    expect(retry.correlationId).toBe('corr_2');
    expect(retry.correlationId).not.toBe(command.correlationId);
    expect(retry.wasRetry).toBe(true);
  });

  it('clears the previous failure and trace', () => {
    const retry = buildRetry(command, 'corr_2');
    expect(retry.status).toBe('requested');
    expect(retry.failureReason).toBeUndefined();
    expect(retry.trace).toEqual([]);
  });

  it('grants the retry a fresh window of the original length', () => {
    const now = new Date('2026-09-09T11:00:00.000Z');
    const retry = buildRetry(command, 'corr_2', now);
    const ttl = new Date(retry.expiresAt).getTime() - new Date(retry.requestedAt).getTime();
    expect(ttl).toBe(30_000);
    expect(retry.requestedAt).toBe(now.toISOString());
  });

  it('finds an already-registered intent by its key', () => {
    const registry = register(createRegistry(), command);
    expect(lookup(registry, 'idem_abc')).toBe(command);
    expect(lookup(registry, 'idem_other')).toBeUndefined();
  });
});
