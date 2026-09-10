import type {
  CommandStatus,
  FailureReason,
  Vehicle,
  VehicleCapabilities,
  VehicleCommand,
  VehicleHealth,
  VehicleState,
} from '@/domain/entities';

/**
 * Translation between the API's wire shapes and the app's domain entities.
 *
 * The two are deliberately not the same type. The API speaks a backend command
 * lifecycle; the app speaks the pipeline vocabulary its screens were built
 * around. Mapping in one place means neither side has to compromise, and a
 * change to either is a change to this file.
 */

export type ApiVehicle = {
  id: string;
  name: string;
  model: string;
  trim: string;
  modelYear: number;
  vinMasked: string;
  colorName: string;
  paintHex: string;
  softwareVersion: string;
  capabilities: VehicleCapabilities;
  batteryCapacityKwh: number;
  maxRangeKm: number;
  maxAcChargeKw: number;
  maxDcChargeKw: number;
  isSimulated: boolean;
  access?: { role: string; canCommand: boolean; canSimulate: boolean };
};

export type ApiSnapshot = Omit<VehicleState, 'vehicleId' | 'lastUpdatedAt' | 'isCached' | 'health' | 'revision'> & {
  vehicleId: string;
  revision: number;
  observedAt: string;
  lastUpdatedAt: string;
  isCached: boolean;
};

export type ApiCommand = {
  id: string;
  vehicleId: string;
  type: string;
  payload: Record<string, number | string | boolean>;
  idempotencyKey: string;
  correlationId: string;
  status: 'queued' | 'executing' | 'succeeded' | 'failed' | 'expired' | 'rejected';
  requestedAt: string;
  expiresAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureReason: string | null;
  result: Record<string, unknown> | null;
};

export const toVehicle = (api: ApiVehicle): Vehicle => ({
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

/**
 * Vehicle health is not part of what the simulator reports.
 *
 * Rather than fabricate tyre pressures and pass them off as telemetry, the
 * health screen is fed a derived summary built from what the vehicle DOES
 * report — battery health, software version and charge — with no warnings and
 * no diagnostic history. This is stated in the README rather than dressed up.
 */
const deriveHealth = (snapshot: ApiSnapshot, vehicle: Vehicle | null): VehicleHealth => ({
  overall: 'ok',
  tires: [],
  batteryHealthPercent: snapshot.charge.batteryHealthPercent,
  softwareVersion: vehicle?.softwareVersion ?? '—',
  serviceDueDate: '',
  serviceDueKm: 0,
  odometerKm: 0,
  warnings: [],
  lastDiagnosticAt: snapshot.observedAt,
});

export const toVehicleState = (snapshot: ApiSnapshot, vehicle: Vehicle | null): VehicleState => ({
  vehicleId: snapshot.vehicleId,
  connectivity: snapshot.connectivity,
  lock: snapshot.lock,
  gear: snapshot.gear,
  isMoving: snapshot.isMoving,
  speedKph: snapshot.speedKph,
  doors: snapshot.doors,
  trunk: snapshot.trunk,
  frunk: snapshot.frunk,
  windowsClosed: snapshot.windowsClosed,
  power: snapshot.power,
  lights: snapshot.lights,
  driveAuthorization: snapshot.driveAuthorization,
  driveReady: snapshot.driveReady,
  transientEvents: snapshot.transientEvents,
  climate: snapshot.climate,
  charge: snapshot.charge,
  location: snapshot.location,
  health: deriveHealth(snapshot, vehicle),
  lastUpdatedAt: snapshot.lastUpdatedAt,
  isCached: snapshot.isCached,
  revision: snapshot.revision,
});

/**
 * Backend lifecycle → the pipeline status the screens speak.
 *
 * `succeeded` becomes `confirmed`, and nothing else does. That single mapping
 * is what keeps the rule "only a vehicle acknowledgement is shown as success"
 * true after the backend was swapped in.
 */
const STATUS_MAP: Record<ApiCommand['status'], CommandStatus> = {
  queued: 'queued',
  executing: 'executing',
  succeeded: 'confirmed',
  failed: 'failed',
  expired: 'expired',
  rejected: 'rejected',
};

const FAILURE_CODES: readonly FailureReason[] = [
  'vehicle_offline',
  'command_expired',
  'vehicle_moving',
  'service_mode',
  'permission_revoked',
  'secure_session_failed',
  'no_acknowledgment',
  'capability_unsupported',
  'precondition_failed',
];

const toFailureCode = (code: string | null): FailureReason | undefined =>
  code && (FAILURE_CODES as readonly string[]).includes(code) ? (code as FailureReason) : undefined;

export const toCommand = (api: ApiCommand): VehicleCommand => ({
  id: api.id,
  idempotencyKey: api.idempotencyKey,
  correlationId: api.correlationId,
  vehicleId: api.vehicleId,
  type: api.type as VehicleCommand['type'],
  requestedAt: api.requestedAt,
  expiresAt: api.expiresAt,
  status: STATUS_MAP[api.status],
  failureCode: toFailureCode(api.failureCode),
  failureReason: api.failureReason ?? undefined,
  payload: api.payload,
  completedAt: api.completedAt ?? undefined,
});
