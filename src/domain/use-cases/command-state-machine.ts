import { type CommandStatus, type VehicleCommand, isTerminal } from '../entities/command';

/**
 * Legal forward transitions for a vehicle command.
 *
 * The graph is intentionally strict: a command can never move backwards, and it
 * can never leave a terminal state. This is what stops the UI from ever
 * "un-confirming" or re-animating a finished command when a late duplicate
 * message arrives from the broker (at-least-once delivery is normal in MQTT).
 */
export const ALLOWED_TRANSITIONS: Record<CommandStatus, readonly CommandStatus[]> = {
  requested: ['validating', 'rejected', 'failed', 'expired'],
  validating: ['queued', 'rejected', 'failed', 'expired'],
  queued: ['delivered', 'failed', 'expired', 'rejected'],
  delivered: ['executing', 'failed', 'expired', 'rejected'],
  executing: ['confirmed', 'failed', 'expired', 'rejected'],
  confirmed: [],
  rejected: [],
  expired: [],
  failed: [],
};

export const canTransition = (from: CommandStatus, to: CommandStatus): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to);

export type TransitionResult =
  { ok: true; command: VehicleCommand } | { ok: false; reason: string; command: VehicleCommand };

/**
 * Applies a status transition, returning a NEW command object.
 * Illegal transitions are refused rather than silently applied — a mismatch
 * means the client and the cloud disagree, and guessing would risk showing a
 * user "Unlocked" for a car that is still locked.
 */
export const transition = (
  command: VehicleCommand,
  to: CommandStatus,
  patch: Partial<
    Pick<VehicleCommand, 'failureReason' | 'failureCode' | 'trace' | 'completedAt'>
  > = {},
): TransitionResult => {
  if (command.status === to) {
    // Idempotent no-op: duplicate delivery of the same status is expected.
    return { ok: true, command };
  }
  if (isTerminal(command.status)) {
    return {
      ok: false,
      reason: `Command ${command.id} is already terminal (${command.status})`,
      command,
    };
  }
  if (!canTransition(command.status, to)) {
    return {
      ok: false,
      reason: `Illegal transition ${command.status} -> ${to}`,
      command,
    };
  }
  const next: VehicleCommand = {
    ...command,
    ...patch,
    status: to,
    completedAt: isTerminal(to) ? (patch.completedAt ?? new Date().toISOString()) : undefined,
  };
  return { ok: true, command: next };
};

/** A command is expired once wall-clock time passes `expiresAt` and it has not confirmed. */
export const isExpired = (command: VehicleCommand, now: Date = new Date()): boolean => {
  if (isTerminal(command.status)) return false;
  return now.getTime() > new Date(command.expiresAt).getTime();
};

/** Forces an in-flight command past its deadline into `expired`. */
export const expireIfDue = (command: VehicleCommand, now: Date = new Date()): VehicleCommand => {
  if (!isExpired(command, now)) return command;
  const result = transition(command, 'expired', {
    failureCode: 'command_expired',
    failureReason: 'Command expired',
  });
  return result.ok ? result.command : command;
};

export const remainingMs = (command: VehicleCommand, now: Date = new Date()): number =>
  Math.max(0, new Date(command.expiresAt).getTime() - now.getTime());

/** Only a failed / expired / rejected-for-transient-reason command may be retried. */
export const isRetryable = (command: VehicleCommand): boolean =>
  command.status === 'failed' || command.status === 'expired';
