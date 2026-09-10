import type {
  ChargeState,
  ClimateState,
  Vehicle,
  VehicleCapabilities,
  VehicleCommand,
  VehicleState,
} from '@/domain/entities';
import type {
  CommandAccepted,
  CommandRequest,
  TelemetryRepository,
  VehicleCommandRepository,
  VehicleRepository,
} from '@/domain/repositories';
import { logger } from '@/utils/logger';
import { apiRequest, ApiError } from './api-client';
import {
  toCommand,
  toVehicle,
  toVehicleState,
  type ApiCommand,
  type ApiSnapshot,
  type ApiVehicle,
} from './mappers';
import { VehicleStream, type ConnectionStatus } from './realtime';

/**
 * The connected-services client.
 *
 * Implements the same repository interfaces the mock cloud does, so every
 * screen, store, hook and domain rule above it is unchanged — which was the
 * point of putting those interfaces there in the first place.
 *
 * It owns exactly one live vehicle stream at a time. Switching vehicles tears
 * the old one down before building the new one, so two channels can never be
 * open at once and a stale channel cannot keep writing state for a car the user
 * has navigated away from.
 */
class ConnectedBackend implements VehicleRepository, VehicleCommandRepository, TelemetryRepository {
  private stream: VehicleStream | null = null;
  private streamVehicleId: string | null = null;

  private vehicles = new Map<string, Vehicle>();
  private snapshots = new Map<string, VehicleState>();
  private commands = new Map<string, VehicleCommand>();

  private stateListeners = new Map<string, Set<(state: VehicleState) => void>>();
  private commandListeners = new Set<(command: VehicleCommand) => void>();
  private perCommandListeners = new Map<string, Set<(command: VehicleCommand) => void>>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private connectionStatus: ConnectionStatus = 'connecting';

  // --- VehicleRepository ----------------------------------------------------

  async listVehicles(): Promise<Vehicle[]> {
    const body = await apiRequest<{ vehicles: ApiVehicle[] }>('/api/vehicles');
    const vehicles = body.vehicles.map(toVehicle);
    vehicles.forEach((vehicle) => this.vehicles.set(vehicle.id, vehicle));
    return vehicles;
  }

  async getVehicle(vehicleId: string): Promise<Vehicle> {
    const cached = this.vehicles.get(vehicleId);
    if (cached) return cached;

    const body = await apiRequest<{ vehicle: ApiVehicle }>(`/api/vehicles/${vehicleId}/state`);
    const vehicle = toVehicle(body.vehicle);
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async getVehicleState(vehicleId: string): Promise<VehicleState> {
    return this.getTelemetry(vehicleId);
  }

  async getCapabilities(vehicleId: string): Promise<VehicleCapabilities> {
    const vehicle = await this.getVehicle(vehicleId);
    return vehicle.capabilities;
  }

  /**
   * Capabilities without awaiting.
   *
   * Command authorization runs on a tap and cannot wait for a round trip. The
   * cache is populated the moment a vehicle is loaded; a miss returns null and
   * the caller falls back to the server's own capability check, which is the
   * authority in any case.
   */
  getCachedCapabilities(vehicleId: string): VehicleCapabilities | null {
    return this.vehicles.get(vehicleId)?.capabilities ?? null;
  }

  async pairVehicle(): Promise<{ vehicleId: string } | { error: string }> {
    // Pairing a VIN to an account is an ownership-proof ceremony with a
    // manufacturer, not something this backend can perform. The demo account is
    // provisioned a vehicle on first sign-in instead.
    return {
      error:
        'Pairing by VIN needs a manufacturer ownership check. This account is provisioned a simulated vehicle automatically.',
    };
  }

  // --- TelemetryRepository --------------------------------------------------

  async getTelemetry(vehicleId: string): Promise<VehicleState> {
    const body = await apiRequest<{
      vehicle: ApiVehicle;
      snapshot: ApiSnapshot | null;
      commands: ApiCommand[];
    }>(`/api/vehicles/${vehicleId}/state`);

    const vehicle = toVehicle(body.vehicle);
    this.vehicles.set(vehicle.id, vehicle);

    if (!body.snapshot) {
      throw new Error('The vehicle has not reported any state yet. Start the simulator.');
    }

    const state = toVehicleState(body.snapshot, vehicle);
    this.snapshots.set(vehicleId, state);
    return state;
  }

  async getCharging(vehicleId: string): Promise<ChargeState> {
    const cached = this.snapshots.get(vehicleId);
    return (cached ?? (await this.getTelemetry(vehicleId))).charge;
  }

  async getClimate(vehicleId: string): Promise<ClimateState> {
    const cached = this.snapshots.get(vehicleId);
    return (cached ?? (await this.getTelemetry(vehicleId))).climate;
  }

  /**
   * Subscribes to confirmed state for a vehicle.
   *
   * Returns an unsubscribe function. When the last listener for a vehicle goes
   * away the underlying channel is closed, so navigating between screens does
   * not leave sockets open behind them.
   */
  observeState(vehicleId: string, onChange: (state: VehicleState) => void): () => void {
    const listeners = this.stateListeners.get(vehicleId) ?? new Set();
    listeners.add(onChange);
    this.stateListeners.set(vehicleId, listeners);

    const cached = this.snapshots.get(vehicleId);
    if (cached) onChange(cached);

    this.ensureStream(vehicleId);

    return () => {
      const set = this.stateListeners.get(vehicleId);
      set?.delete(onChange);
      if (set && set.size === 0) {
        this.stateListeners.delete(vehicleId);
        if (this.streamVehicleId === vehicleId) this.teardownStream();
      }
    };
  }

  // --- VehicleCommandRepository ---------------------------------------------

  async submitCommand(vehicleId: string, request: CommandRequest): Promise<CommandAccepted> {
    const body = await apiRequest<{ command: ApiCommand; replayed: boolean }>(
      `/api/vehicles/${vehicleId}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: request.type,
          payload: request.payload,
          idempotencyKey: request.idempotencyKey,
          expiresInSeconds: request.expiresInSeconds,
        }),
      },
    );

    const command = toCommand(body.command);
    this.cacheCommand(command);

    if (body.replayed) {
      logger.info('Command request was a replay; returning the original', {
        commandId: command.id,
      });
    }

    return {
      commandId: command.id,
      correlationId: command.correlationId,
      status: command.status,
      vehicleId: command.vehicleId,
    };
  }

  async getCommand(vehicleId: string, commandId: string): Promise<VehicleCommand> {
    const cached = this.commands.get(commandId);
    if (cached) return cached;

    const body = await apiRequest<{ commands: ApiCommand[] }>(`/api/vehicles/${vehicleId}/state`);
    const match = body.commands.find((command) => command.id === commandId);
    if (!match) throw new Error('No such command.');

    const command = toCommand(match);
    this.cacheCommand(command);
    return command;
  }

  observeCommand(commandId: string, onChange: (command: VehicleCommand) => void): () => void {
    const listeners = this.perCommandListeners.get(commandId) ?? new Set();
    listeners.add(onChange);
    this.perCommandListeners.set(commandId, listeners);

    const cached = this.commands.get(commandId);
    if (cached) onChange(cached);

    return () => {
      const set = this.perCommandListeners.get(commandId);
      set?.delete(onChange);
      if (set && set.size === 0) this.perCommandListeners.delete(commandId);
    };
  }

  /** Every command update for the active vehicle, for the history list. */
  observeAllCommands(onChange: (command: VehicleCommand) => void): () => void {
    this.commandListeners.add(onChange);
    this.commands.forEach((command) => onChange(command));
    return () => {
      this.commandListeners.delete(onChange);
    };
  }

  async listHistory(vehicleId: string): Promise<VehicleCommand[]> {
    const body = await apiRequest<{ commands: ApiCommand[] }>(`/api/vehicles/${vehicleId}/state`);
    const commands = body.commands.map(toCommand);
    commands.forEach((command) => this.cacheCommand(command));
    return commands;
  }

  // --- Connection -----------------------------------------------------------

  observeConnection(onChange: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(onChange);
    onChange(this.connectionStatus);
    return () => {
      this.statusListeners.delete(onChange);
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /** Re-reads state and command outcomes. Never resends anything. */
  async reconcile(): Promise<void> {
    await this.stream?.reconcile();
  }

  /** Drops every subscription and cache. Called on sign-out. */
  reset(): void {
    this.teardownStream();
    this.vehicles.clear();
    this.snapshots.clear();
    this.commands.clear();
    this.stateListeners.clear();
    this.commandListeners.clear();
    this.perCommandListeners.clear();
  }

  // --- internals ------------------------------------------------------------

  private ensureStream(vehicleId: string): void {
    if (this.streamVehicleId === vehicleId && this.stream) return;

    this.teardownStream();
    this.streamVehicleId = vehicleId;
    this.stream = new VehicleStream(vehicleId, {
      onState: (state) => this.publishState(state),
      onCommand: (command) => this.cacheCommand(command),
      onStatus: (status) => {
        this.connectionStatus = status;
        this.statusListeners.forEach((listener) => listener(status));
      },
    });

    void this.stream.start().catch((error: unknown) => {
      logger.warn('Vehicle stream failed to start', { error: String(error) });
    });
  }

  private teardownStream(): void {
    this.stream?.dispose();
    this.stream = null;
    this.streamVehicleId = null;
  }

  private publishState(state: VehicleState): void {
    this.snapshots.set(state.vehicleId, state);
    this.stateListeners.get(state.vehicleId)?.forEach((listener) => listener(state));
  }

  private cacheCommand(command: VehicleCommand): void {
    this.commands.set(command.id, command);
    this.perCommandListeners.get(command.id)?.forEach((listener) => listener(command));
    this.commandListeners.forEach((listener) => listener(command));
  }
}

export const connectedBackend = new ConnectedBackend();
export { ApiError };
export type { ConnectionStatus };
