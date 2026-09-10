import type { VehicleCommand } from '@/domain/entities';

/**
 * Fleet-style observability metrics computed from the local command log.
 *
 * In production these come from the telemetry pipeline, not the client. They
 * are computed here so the developer screen can show the same shape of numbers
 * an SRE would actually watch during a connected-services incident.
 */
export type CommandMetrics = {
  total: number;
  successRate: number;
  timeoutRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  vehicleAvailability: number;
  keyProvisioningSuccess: number;
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
};

export const computeMetrics = (
  commands: VehicleCommand[],
  keyProvisioningAttempts: { succeeded: number; total: number },
): CommandMetrics => {
  const terminal = commands.filter((c) =>
    ['confirmed', 'failed', 'expired', 'rejected'].includes(c.status),
  );
  const confirmed = terminal.filter((c) => c.status === 'confirmed');
  const timedOut = terminal.filter(
    (c) => c.status === 'expired' || c.failureReason?.includes('acknowledge'),
  );

  const latencies = confirmed
    .map((c) => (c.trace ?? []).reduce((sum, stage) => sum + stage.elapsedMs, 0))
    .filter((n) => n > 0);

  // Availability here means: of the commands we attempted, how often was the
  // vehicle actually reachable (i.e. not offline / unacknowledged)?
  const unreachable = terminal.filter((c) =>
    (c.failureReason ?? '').match(/offline|acknowledge|expired/i),
  ).length;

  return {
    total: terminal.length,
    successRate: terminal.length === 0 ? 1 : confirmed.length / terminal.length,
    timeoutRate: terminal.length === 0 ? 0 : timedOut.length / terminal.length,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    vehicleAvailability: terminal.length === 0 ? 1 : 1 - unreachable / terminal.length,
    keyProvisioningSuccess:
      keyProvisioningAttempts.total === 0
        ? 1
        : keyProvisioningAttempts.succeeded / keyProvisioningAttempts.total,
  };
};
