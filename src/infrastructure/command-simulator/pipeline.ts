import type { ConnectivityMode } from '@/domain/entities';
import type { TraceStageName } from '@/domain/entities';

/**
 * Timing model for the simulated end-to-end pipeline.
 *
 * These numbers are a *user-friendly representation* of a real connected-vehicle
 * round trip, not production measurements. They exist so the interface can be
 * designed and demonstrated against realistic latency instead of instant,
 * dishonest success.
 */

export type StageTiming = { stage: TraceStageName; minMs: number; maxMs: number };

/** Ordered pipeline: every command walks these hops in this order. */
export const PIPELINE: StageTiming[] = [
  { stage: 'mobile_request_created', minMs: 8, maxMs: 24 },
  { stage: 'api_gateway_received', minMs: 60, maxMs: 140 },
  { stage: 'authorization_passed', minMs: 120, maxMs: 300 },
  { stage: 'command_service_published', minMs: 80, maxMs: 200 },
  { stage: 'iot_broker_delivered', minMs: 220, maxMs: 620 },
  { stage: 'vehicle_tcu_acknowledged', minMs: 260, maxMs: 700 },
  { stage: 'vehicle_function_executed', minMs: 340, maxMs: 900 },
  { stage: 'state_returned', minMs: 120, maxMs: 320 },
  { stage: 'push_delivered', minMs: 90, maxMs: 240 },
];

/**
 * Which pipeline stage corresponds to which user-visible command status.
 * The status changes when the pipeline *reaches* that hop.
 */
export const STAGE_STATUS: Partial<
  Record<TraceStageName, import('@/domain/entities').CommandStatus>
> = {
  mobile_request_created: 'requested',
  api_gateway_received: 'validating',
  command_service_published: 'queued',
  iot_broker_delivered: 'delivered',
  vehicle_tcu_acknowledged: 'executing',
  vehicle_function_executed: 'confirmed',
};

/**
 * Per-connectivity latency multipliers and failure characteristics.
 *
 * Requirement mapping:
 *  online      validation 300-600ms, delivery 500-1200ms, confirmation 700-1500ms
 *  asleep      3-7s wake-up first, then behaves like online
 *  poor_signal longer randomized delays, occasional timeout, retry allowed
 *  offline     never reports success
 *  service_mode restricted commands rejected with a clear reason
 */
export type ConnectivityProfile = {
  latencyMultiplier: number;
  jitter: number;
  /** Probability a command times out before the vehicle acknowledges. */
  timeoutProbability: number;
  /** Wake-up delay range in ms, applied before the pipeline starts. */
  wakeMs: [number, number] | null;
  reachable: boolean;
};

export const CONNECTIVITY_PROFILES: Record<ConnectivityMode, ConnectivityProfile> = {
  online: {
    latencyMultiplier: 1,
    jitter: 0.25,
    timeoutProbability: 0.02,
    wakeMs: null,
    reachable: true,
  },
  asleep: {
    latencyMultiplier: 1.15,
    jitter: 0.3,
    timeoutProbability: 0.04,
    wakeMs: [3000, 7000],
    reachable: true,
  },
  poor_signal: {
    latencyMultiplier: 2.6,
    jitter: 0.9,
    // Roughly one in three attempts fails to complete — this is what makes the
    // retry path worth demonstrating.
    timeoutProbability: 0.34,
    wakeMs: null,
    reachable: true,
  },
  offline: {
    latencyMultiplier: 1,
    jitter: 0,
    timeoutProbability: 1,
    wakeMs: null,
    reachable: false,
  },
  service_mode: {
    latencyMultiplier: 1,
    jitter: 0.2,
    timeoutProbability: 0,
    wakeMs: null,
    reachable: true,
  },
};

export const stageDuration = (timing: StageTiming, profile: ConnectivityProfile): number => {
  const base = timing.minMs + Math.random() * (timing.maxMs - timing.minMs);
  const jitter = 1 + (Math.random() * 2 - 1) * profile.jitter;
  return Math.round(base * profile.latencyMultiplier * jitter);
};

/** User-facing progress copy shown in the command status sheet. */
export const COMMAND_SHEET_STEPS = [
  {
    id: 'securing',
    i18nKey: 'command.securing',
    stage: 'mobile_request_created' as TraceStageName,
  },
  {
    id: 'permission',
    i18nKey: 'command.verifying',
    stage: 'authorization_passed' as TraceStageName,
  },
  {
    id: 'contacting',
    i18nKey: 'command.contacting',
    stage: 'iot_broker_delivered' as TraceStageName,
  },
  {
    id: 'acknowledged',
    i18nKey: 'command.acknowledged',
    stage: 'vehicle_tcu_acknowledged' as TraceStageName,
  },
  {
    id: 'completed',
    i18nKey: 'command.completed',
    stage: 'vehicle_function_executed' as TraceStageName,
  },
] as const;
