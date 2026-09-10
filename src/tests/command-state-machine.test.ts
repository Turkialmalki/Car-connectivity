import {
  ALLOWED_TRANSITIONS,
  canTransition,
  expireIfDue,
  isExpired,
  isRetryable,
  remainingMs,
  transition,
} from '@/domain/use-cases/command-state-machine';
import type { CommandStatus, VehicleCommand } from '@/domain/entities';
import { TERMINAL_STATUSES } from '@/domain/entities';

const buildCommand = (overrides: Partial<VehicleCommand> = {}): VehicleCommand => ({
  id: 'cmd_test',
  idempotencyKey: 'idem_test',
  correlationId: 'corr_test',
  vehicleId: 'nova_one_demo',
  type: 'unlock',
  requestedAt: '2026-09-09T10:00:00.000Z',
  expiresAt: '2026-09-09T10:00:30.000Z',
  status: 'requested',
  trace: [],
  ...overrides,
});

describe('command state machine', () => {
  it('walks the full happy path', () => {
    const sequence: CommandStatus[] = [
      'validating',
      'queued',
      'delivered',
      'executing',
      'confirmed',
    ];
    let command = buildCommand();
    for (const next of sequence) {
      const result = transition(command, next);
      expect(result.ok).toBe(true);
      if (result.ok) command = result.command;
    }
    expect(command.status).toBe('confirmed');
    expect(command.completedAt).toBeDefined();
  });

  it('refuses to move backwards', () => {
    const command = buildCommand({ status: 'executing' });
    const result = transition(command, 'queued');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Illegal transition');
  });

  it('refuses any transition out of a terminal state', () => {
    for (const terminal of TERMINAL_STATUSES) {
      const command = buildCommand({ status: terminal });
      const result = transition(command, 'executing');
      expect(result.ok).toBe(false);
    }
  });

  it('treats a duplicate status as an idempotent no-op', () => {
    // At-least-once broker delivery means the same status can arrive twice.
    const command = buildCommand({ status: 'delivered' });
    const result = transition(command, 'delivered');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toBe(command);
  });

  it('does not mutate the original command', () => {
    const command = buildCommand();
    transition(command, 'validating');
    expect(command.status).toBe('requested');
  });

  it('allows failure from every in-flight state', () => {
    const inFlight: CommandStatus[] = [
      'requested',
      'validating',
      'queued',
      'delivered',
      'executing',
    ];
    for (const status of inFlight) {
      expect(canTransition(status, 'failed')).toBe(true);
      expect(canTransition(status, 'expired')).toBe(true);
    }
  });

  it('leaves terminal states with no outgoing transitions', () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });
});

describe('command expiry', () => {
  const now = new Date('2026-09-09T10:00:45.000Z'); // 15s past expiry

  it('reports an in-flight command past its deadline as expired', () => {
    expect(isExpired(buildCommand(), now)).toBe(true);
  });

  it('never expires a command that already confirmed', () => {
    // A late clock check must not "un-confirm" a command the vehicle executed.
    expect(isExpired(buildCommand({ status: 'confirmed' }), now)).toBe(false);
  });

  it('moves an overdue command into the expired state', () => {
    const expired = expireIfDue(buildCommand(), now);
    expect(expired.status).toBe('expired');
    expect(expired.failureReason).toBe('Command expired');
  });

  it('leaves a command inside its window untouched', () => {
    const early = new Date('2026-09-09T10:00:10.000Z');
    const command = buildCommand();
    expect(expireIfDue(command, early)).toBe(command);
  });

  it('reports remaining time and floors it at zero', () => {
    expect(remainingMs(buildCommand(), new Date('2026-09-09T10:00:10.000Z'))).toBe(20_000);
    expect(remainingMs(buildCommand(), now)).toBe(0);
  });

  it('allows retry only for failed and expired commands', () => {
    expect(isRetryable(buildCommand({ status: 'failed' }))).toBe(true);
    expect(isRetryable(buildCommand({ status: 'expired' }))).toBe(true);
    expect(isRetryable(buildCommand({ status: 'confirmed' }))).toBe(false);
    expect(isRetryable(buildCommand({ status: 'rejected' }))).toBe(false);
    expect(isRetryable(buildCommand({ status: 'executing' }))).toBe(false);
  });
});
