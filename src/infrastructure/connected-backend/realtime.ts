import type { RealtimeChannel } from '@supabase/supabase-js';
import type { VehicleCommand, VehicleState } from '@/domain/entities';
import { logger } from '@/utils/logger';
import { apiRequest } from './api-client';
import { toCommand, toVehicleState, type ApiCommand, type ApiSnapshot, type ApiVehicle } from './mappers';
import { supabase } from './supabase';

/**
 * The private per-vehicle realtime channel.
 *
 * Topic: `vehicle:<vehicle-id>`, joined with `private: true`, which makes the
 * server check RLS on `realtime.messages` before the socket is allowed in.
 * Membership of the vehicle is the whole test. Nobody may publish: there is no
 * INSERT grant on that table, so every message on this channel originated in a
 * database trigger on a committed row.
 *
 * A realtime message is treated as a NOTIFICATION, never as the truth. It
 * carries the new row, but the rules below decide whether to believe it:
 *
 *   - a snapshot is adopted only when its revision is higher than the one held;
 *   - a reconnect always re-fetches the authoritative snapshot, because
 *     messages sent while the socket was down are simply gone.
 */

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type VehicleStreamCallbacks = {
  onState: (state: VehicleState) => void;
  onCommand: (command: VehicleCommand) => void;
  onStatus: (status: ConnectionStatus) => void;
};

type StateBroadcast = {
  payload?: {
    record?: {
      vehicle_id: string;
      revision: number | string;
      reported: Record<string, unknown>;
      observed_at: string;
      received_at: string;
    };
  };
};

type CommandBroadcast = { payload?: { record?: Record<string, unknown> } };

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * One vehicle's live connection.
 *
 * Created per vehicle, disposed when the vehicle changes or the user signs out.
 * Everything it owns — a channel, a timer, a generation counter — is released
 * by `dispose`, so remounting a screen cannot accumulate subscriptions.
 */
export class VehicleStream {
  private channel: RealtimeChannel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private generation = 0;
  private lastRevision = 0;
  private vehicle: ApiVehicle | null = null;
  private status: ConnectionStatus = 'connecting';
  /**
   * Messages that arrived while the initial snapshot was still loading.
   *
   * Subscribing first and fetching second is the only ordering that cannot lose
   * an update; the cost is a brief window where messages arrive before there is
   * anything to compare them against, and this is where they wait.
   */
  private buffered: VehicleState[] = [];
  private hydrated = false;

  constructor(
    private readonly vehicleId: string,
    private readonly callbacks: VehicleStreamCallbacks,
  ) {}

  async start(): Promise<void> {
    if (this.disposed) return;
    this.generation += 1;
    const generation = this.generation;

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    this.subscribe(generation);
    await this.hydrate(generation);
  }

  /**
   * Re-reads the authoritative snapshot and recent command outcomes.
   *
   * Called on start, on reconnect and on return to the foreground. It never
   * resends a command: an unlock that expired in someone's pocket must not fire
   * because the app came back on screen.
   */
  async reconcile(): Promise<void> {
    if (this.disposed) return;
    await this.hydrate(this.generation);
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.channel) {
      void supabase().removeChannel(this.channel);
      this.channel = null;
    }
  }

  getVehicle(): ApiVehicle | null {
    return this.vehicle;
  }

  // --- internals ------------------------------------------------------------

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatus(status);
  }

  private subscribe(generation: number): void {
    if (this.channel) {
      void supabase().removeChannel(this.channel);
      this.channel = null;
    }

    const channel = supabase().channel(`vehicle:${this.vehicleId}`, {
      config: { private: true },
    });

    channel
      .on('broadcast', { event: 'state' }, (message) => {
        if (generation !== this.generation || this.disposed) return;
        this.handleState(message as StateBroadcast);
      })
      .on('broadcast', { event: 'command' }, (message) => {
        if (generation !== this.generation || this.disposed) return;
        this.handleCommand(message as CommandBroadcast);
      })
      .subscribe((status) => {
        if (generation !== this.generation || this.disposed) return;

        if (status === 'SUBSCRIBED') {
          this.reconnectAttempts = 0;
          this.setStatus('live');
          // Anything published while the socket was down is gone, so the
          // snapshot is re-read rather than assumed to still be current.
          if (this.hydrated) void this.hydrate(generation);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setStatus('reconnecting');
          this.scheduleReconnect(generation);
        }
      });

    this.channel = channel;
  }

  private scheduleReconnect(generation: number): void {
    if (this.reconnectTimer || this.disposed || generation !== this.generation) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** (this.reconnectAttempts - 1),
    );

    logger.info('Vehicle channel reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed || generation !== this.generation) return;
      this.subscribe(generation);
    }, delay);
  }

  private handleState(message: StateBroadcast): void {
    const record = message.payload?.record;
    if (!record || record.vehicle_id !== this.vehicleId) return;

    const snapshot: ApiSnapshot = {
      ...(record.reported as unknown as ApiSnapshot),
      vehicleId: record.vehicle_id,
      revision: Number(record.revision),
      observedAt: record.observed_at,
      lastUpdatedAt: record.received_at,
      isCached: false,
    };

    const state = toVehicleState(snapshot, this.vehicle ? toVehicleVehicle(this.vehicle) : null);

    if (!this.hydrated) {
      this.buffered.push(state);
      return;
    }

    this.adopt(state);
  }

  /** Revision-based reconciliation: older news is not news. */
  private adopt(state: VehicleState): void {
    const revision = state.revision ?? 0;
    if (revision > 0 && revision <= this.lastRevision) return;
    if (revision > 0) this.lastRevision = revision;
    this.callbacks.onState(state);
  }

  private handleCommand(message: CommandBroadcast): void {
    const record = message.payload?.record;
    if (!record) return;

    this.callbacks.onCommand(
      toCommand({
        id: String(record.id),
        vehicleId: String(record.vehicle_id),
        type: String(record.type),
        payload: (record.payload ?? {}) as Record<string, number | string | boolean>,
        idempotencyKey: String(record.idempotency_key),
        correlationId: String(record.correlation_id),
        status: record.status as ApiCommand['status'],
        requestedAt: String(record.requested_at),
        expiresAt: String(record.expires_at),
        claimedAt: (record.claimed_at as string | null) ?? null,
        completedAt: (record.completed_at as string | null) ?? null,
        failureCode: (record.failure_code as string | null) ?? null,
        failureReason: (record.failure_reason as string | null) ?? null,
        result: (record.result as Record<string, unknown> | null) ?? null,
      }),
    );
  }

  private async hydrate(generation: number): Promise<void> {
    try {
      const body = await apiRequest<{
        vehicle: ApiVehicle;
        snapshot: ApiSnapshot | null;
        commands: ApiCommand[];
      }>(`/api/vehicles/${this.vehicleId}/state`);

      if (this.disposed || generation !== this.generation) return;

      this.vehicle = body.vehicle;

      if (body.snapshot) {
        const state = toVehicleState(body.snapshot, toVehicleVehicle(body.vehicle));
        // The fetched snapshot is authoritative regardless of what arrived in
        // the meantime, so the revision floor is set from it directly.
        this.lastRevision = Math.max(this.lastRevision, state.revision ?? 0);
        this.callbacks.onState(state);
      }

      this.hydrated = true;

      // Anything that arrived during the fetch is replayed through the same
      // revision check, so nothing is lost and nothing goes backwards.
      const buffered = this.buffered;
      this.buffered = [];
      buffered.forEach((state) => this.adopt(state));

      // Command outcomes are re-read rather than remembered: this is how an app
      // that was backgrounded learns what happened to a command it left behind.
      body.commands.forEach((command) => this.callbacks.onCommand(toCommand(command)));
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      logger.warn('Vehicle snapshot could not be reconciled', { error: String(error) });
      this.setStatus('offline');
      this.scheduleReconnect(generation);
    }
  }
}

/** Narrowing helper: the API vehicle already carries every domain field. */
const toVehicleVehicle = (api: ApiVehicle) => ({
  id: api.id,
  name: api.name,
  model: api.model,
  trim: api.trim,
  modelYear: api.modelYear,
  vinMasked: api.vinMasked,
  colorName: api.colorName,
  paintHex: api.paintHex,
  softwareVersion: api.softwareVersion,
  capabilities: api.capabilities,
  batteryCapacityKwh: api.batteryCapacityKwh,
  maxRangeKm: api.maxRangeKm,
  maxAcChargeKw: api.maxAcChargeKw,
  maxDcChargeKw: api.maxDcChargeKw,
});
