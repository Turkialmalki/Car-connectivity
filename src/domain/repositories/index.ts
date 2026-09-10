import type {
  AppNotification,
  AccessAuditEvent,
  ChargeState,
  ClimateState,
  CommandType,
  DigitalKey,
  DigitalKeyCarrier,
  DriverPermission,
  AccessDuration,
  OtaUpdate,
  SharedDriver,
  Vehicle,
  VehicleCapabilities,
  VehicleCommand,
  VehicleState,
} from '../entities';

/**
 * Repository interfaces.
 *
 * Screens and use-cases depend ONLY on these interfaces. The mock connected
 * cloud in `src/infrastructure/mock-connected-cloud` implements them today; a
 * real OEM connected-services client can implement them tomorrow with zero
 * changes above this line.
 */

export interface VehicleRepository {
  /** GET /vehicles */
  listVehicles(): Promise<Vehicle[]>;
  /** GET /vehicles/:vehicleId */
  getVehicle(vehicleId: string): Promise<Vehicle>;
  /** GET /vehicles/:vehicleId/state */
  getVehicleState(vehicleId: string): Promise<VehicleState>;
  /** GET /vehicles/:vehicleId/capabilities */
  getCapabilities(vehicleId: string): Promise<VehicleCapabilities>;
  /** Simulated ownership validation during pairing. */
  pairVehicle(vin: string): Promise<{ vehicleId: string } | { error: string }>;
}

export type CommandRequest = {
  type: CommandType;
  idempotencyKey: string;
  requestedAt: string;
  expiresInSeconds: number;
  payload?: Record<string, number | string | boolean>;
};

export type CommandAccepted = {
  commandId: string;
  correlationId: string;
  status: VehicleCommand['status'];
  vehicleId: string;
};

export interface VehicleCommandRepository {
  /** POST /vehicles/:vehicleId/commands */
  submitCommand(vehicleId: string, request: CommandRequest): Promise<CommandAccepted>;
  /** GET /vehicles/:vehicleId/commands/:commandId */
  getCommand(vehicleId: string, commandId: string): Promise<VehicleCommand>;
  /** Subscribe to status changes; returns an unsubscribe function. */
  observeCommand(commandId: string, onChange: (command: VehicleCommand) => void): () => void;
  /** Local audit trail of every command this account issued. */
  listHistory(vehicleId: string): Promise<VehicleCommand[]>;
}

export interface TelemetryRepository {
  /** GET /vehicles/:vehicleId/telemetry */
  getTelemetry(vehicleId: string): Promise<VehicleState>;
  /** GET /vehicles/:vehicleId/charging */
  getCharging(vehicleId: string): Promise<ChargeState>;
  getClimate(vehicleId: string): Promise<ClimateState>;
  /** Push-style subscription mirroring an MQTT state topic. */
  observeState(vehicleId: string, onChange: (state: VehicleState) => void): () => void;
}

export interface DigitalKeyRepository {
  /** GET /vehicles/:vehicleId/digital-keys */
  listKeys(vehicleId: string): Promise<DigitalKey[]>;
  /** POST /vehicles/:vehicleId/digital-keys */
  provisionKey(
    vehicleId: string,
    input: { carrier: DigitalKeyCarrier; deviceLabel: string; holderName: string },
    onStep?: (stepId: string) => void,
  ): Promise<DigitalKey>;
  /** DELETE /vehicles/:vehicleId/digital-keys/:keyId */
  revokeKey(vehicleId: string, keyId: string): Promise<void>;
  suspendKey(vehicleId: string, keyId: string): Promise<DigitalKey>;
  resumeKey(vehicleId: string, keyId: string): Promise<DigitalKey>;
}

export interface DriverAccessRepository {
  listDrivers(vehicleId: string): Promise<SharedDriver[]>;
  inviteDriver(
    vehicleId: string,
    input: {
      name: string;
      contact: string;
      permissions: DriverPermission[];
      duration: AccessDuration;
    },
  ): Promise<SharedDriver>;
  updatePermissions(
    vehicleId: string,
    driverId: string,
    permissions: DriverPermission[],
  ): Promise<SharedDriver>;
  suspendDriver(vehicleId: string, driverId: string): Promise<SharedDriver>;
  revokeDriver(vehicleId: string, driverId: string): Promise<SharedDriver>;
  listAuditEvents(vehicleId: string): Promise<AccessAuditEvent[]>;
}

export interface NotificationRepository {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  push(notification: AppNotification): Promise<void>;
}

export interface OtaRepository {
  getUpdate(vehicleId: string): Promise<OtaUpdate>;
  scheduleInstall(vehicleId: string, whenIso: string): Promise<OtaUpdate>;
  startInstall(vehicleId: string, onProgress: (update: OtaUpdate) => void): Promise<OtaUpdate>;
}
