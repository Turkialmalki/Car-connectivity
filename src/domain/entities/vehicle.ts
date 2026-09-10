import type { CommandType } from './command';

/**
 * Connectivity mode of the vehicle's TCU as reported by the connected cloud.
 * This is cloud-observed reachability, NOT the app's own network state.
 */
export type ConnectivityMode = 'online' | 'asleep' | 'poor_signal' | 'offline' | 'service_mode';

export const CONNECTIVITY_COPY: Record<ConnectivityMode, { label: string; detail: string }> = {
  online: { label: 'Online', detail: 'Vehicle is reachable and awake.' },
  asleep: { label: 'Asleep', detail: 'Vehicle is in low-power sleep and must be woken first.' },
  poor_signal: {
    label: 'Poor signal',
    detail: 'Weak cellular coverage. Commands may be slow or time out.',
  },
  offline: { label: 'Offline', detail: 'Vehicle cannot be reached. Showing last known state.' },
  service_mode: {
    label: 'Service mode',
    detail: 'Vehicle is with a technician. Remote control is restricted.',
  },
};

export type DoorState = 'open' | 'closed';
export type LockState = 'locked' | 'unlocked';
export type GearPosition = 'P' | 'R' | 'N' | 'D';

/** The four passenger doors, named as the vehicle reports them. */
export type DoorId = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export const DOOR_IDS: readonly DoorId[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

/**
 * Left-hand-drive market, so the driver's door is the front left one. Kept as a
 * named constant rather than inlined, because "driver door" is the label users
 * read and `frontLeft` is what the vehicle reports.
 */
export const DRIVER_DOOR: DoorId = 'frontLeft';

export const DOOR_COPY: Record<DoorId, string> = {
  frontLeft: 'Driver door',
  frontRight: 'Passenger door',
  rearLeft: 'Rear left door',
  rearRight: 'Rear right door',
};

/**
 * Power state of the vehicle's computers.
 *
 * Deliberately separate from `connectivity`: a vehicle can be reachable over
 * the network while its drive systems are still asleep, and "waking" is a real
 * state the user should see rather than a spinner.
 */
export type PowerState = 'asleep' | 'waking' | 'awake';

export const POWER_STATE_COPY: Record<PowerState, string> = {
  asleep: 'Asleep',
  waking: 'Waking vehicle…',
  awake: 'Awake',
};

/**
 * Exterior lighting, as reported by the vehicle.
 *
 * `flash` is NOT a light state — it is a bounded transient event, tracked in
 * `transientEvents` with its own id so that revisiting a screen cannot replay it.
 */
export type LightState = {
  headlights: boolean;
  taillights: boolean;
  /** Hazards / indicators, reported as a steady flag while they are cycling. */
  indicators: boolean;
  /** Daytime running lights, which this vehicle keeps on whenever it is awake. */
  daytimeRunning: boolean;
};

/**
 * Authorization to drive is a *permission*, granted by the connected-services
 * layer and time-boxed. It is not the same thing as the vehicle reporting that
 * it is physically ready to move, which is `driveReady` below.
 */
export type DriveAuthorization = {
  granted: boolean;
  /** ISO timestamp; the grant is void after this even if the app is offline. */
  expiresAt: string | null;
  grantedAt: string | null;
};

/**
 * A transient, non-persistent physical event the vehicle performed.
 *
 * Every event carries an id so the UI can record that it has already been
 * presented. Without that, navigating back to a screen would replay a horn.
 */
export type TransientEventKind = 'flash' | 'horn';

export type TransientEvent = {
  id: string;
  kind: TransientEventKind;
  /** When the vehicle reported performing it. */
  occurredAt: string;
  /** Bounded duration in milliseconds. Never open-ended. */
  durationMs: number;
};

/** Transient events older than this are dropped rather than replayed. */
export const TRANSIENT_EVENT_TTL_MS = 15_000;

export type VehicleCapabilities = {
  remoteLock: boolean;
  remoteClimate: boolean;
  remoteTrunk: boolean;
  /** Powered bonnet release. Many vehicles report the frunk but cannot open it. */
  remoteFrunk: boolean;
  /** Individually actuated doors. Rare in production; usually false. */
  remoteDoors: boolean;
  remoteChargePort: boolean;
  /** Remote drive authorization ("phone start"). */
  remoteDriveAuthorization: boolean;
  remoteHorn: boolean;
  remoteLights: boolean;
  chargeControl: boolean;
  chargeScheduling: boolean;
  digitalKey: 'none' | 'nfc' | 'ble_nfc' | 'uwb_ble_nfc';
  location: boolean;
  otaUpdates: boolean;
};

/** Maps each command to the capability flag that gates it. */
export const COMMAND_CAPABILITY: Record<CommandType, keyof VehicleCapabilities> = {
  lock: 'remoteLock',
  unlock: 'remoteLock',
  start_climate: 'remoteClimate',
  stop_climate: 'remoteClimate',
  set_temperature: 'remoteClimate',
  open_trunk: 'remoteTrunk',
  close_trunk: 'remoteTrunk',
  open_frunk: 'remoteFrunk',
  close_frunk: 'remoteFrunk',
  open_door: 'remoteDoors',
  close_door: 'remoteDoors',
  open_charge_port: 'remoteChargePort',
  close_charge_port: 'remoteChargePort',
  wake_vehicle: 'remoteLock',
  enable_driving: 'remoteDriveAuthorization',
  disable_driving: 'remoteDriveAuthorization',
  start_charging: 'chargeControl',
  stop_charging: 'chargeControl',
  flash_lights: 'remoteLights',
  sound_horn: 'remoteHorn',
};

export type Vehicle = {
  id: string;
  name: string;
  model: string;
  trim: string;
  modelYear: number;
  /** Stored redacted in the domain layer. Full VIN lives only behind SecureStorage. */
  vinMasked: string;
  colorName: string;
  /** Body accent used by the vector vehicle renderer. */
  paintHex: string;
  softwareVersion: string;
  capabilities: VehicleCapabilities;
  batteryCapacityKwh: number;
  maxRangeKm: number;
  maxAcChargeKw: number;
  maxDcChargeKw: number;
};

export type ClimateState = {
  active: boolean;
  interiorTempC: number;
  exteriorTempC: number;
  targetTempC: number;
  passengerTargetTempC: number;
  zonesSynced: boolean;
  fanLevel: number; // 0-5
  driverSeatHeat: number; // 0-3
  passengerSeatHeat: number; // 0-3
  seatVentilation: number; // 0-3
  steeringWheelHeat: boolean;
  frontDefrost: boolean;
  rearDefrost: boolean;
  /** Departure preconditioning, ISO time-of-day "HH:mm" or null. */
  departureTime: string | null;
  departureEnabled: boolean;
};

export type ChargingStatus =
  'not_plugged_in' | 'connected_not_charging' | 'charging' | 'complete' | 'fault' | 'scheduled';

export const CHARGING_STATUS_COPY: Record<ChargingStatus, string> = {
  not_plugged_in: 'Not plugged in',
  connected_not_charging: 'Connected — not charging',
  charging: 'Charging',
  complete: 'Charge complete',
  fault: 'Charging fault',
  scheduled: 'Scheduled charging',
};

export type ChargeState = {
  batteryPercent: number;
  estimatedRangeKm: number;
  status: ChargingStatus;
  chargeLimitPercent: number;
  powerKw: number;
  addedRangeKm: number;
  minutesRemaining: number | null;
  portOpen: boolean;
  locationLabel: string;
  scheduleEnabled: boolean;
  scheduleStart: string; // "HH:mm"
  scheduleEnd: string;
  faultReason?: string;
  batteryHealthPercent: number;
};

export type TirePressure = {
  position: 'FL' | 'FR' | 'RL' | 'RR';
  pressureKpa: number;
  recommendedKpa: number;
  temperatureC: number;
};

export type VehicleHealth = {
  overall: 'ok' | 'attention' | 'critical';
  tires: TirePressure[];
  batteryHealthPercent: number;
  softwareVersion: string;
  serviceDueDate: string;
  serviceDueKm: number;
  odometerKm: number;
  warnings: HealthWarning[];
  lastDiagnosticAt: string;
};

export type HealthWarning = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  /**
   * Normalized domain code. Raw CAN / DTC frames are deliberately NOT surfaced
   * to the consumer UI — the cloud normalizes them into these domain codes.
   */
  code: string;
  raisedAt: string;
};

export type VehicleLocation = {
  latitude: number;
  longitude: number;
  headingDegrees: number;
  /** Whether this fix came from a live vehicle report or a cached last-known value. */
  isLive: boolean;
  capturedAt: string;
  addressLabel: string;
  city: string;
};

/** The full authoritative snapshot returned by GET /vehicles/:id/state. */
export type VehicleState = {
  vehicleId: string;
  connectivity: ConnectivityMode;
  lock: LockState;
  gear: GearPosition;
  isMoving: boolean;
  speedKph: number;
  doors: Record<DoorId, DoorState>;
  trunk: DoorState;
  frunk: DoorState;
  windowsClosed: boolean;
  /** Computer/drive-system power, independent of network reachability. */
  power: PowerState;
  lights: LightState;
  /** Time-boxed permission to drive. Distinct from `driveReady`. */
  driveAuthorization: DriveAuthorization;
  /**
   * The vehicle's own report that it is ready to be driven. Only the vehicle
   * may set this; an authorization grant does not imply it.
   */
  driveReady: boolean;
  /** Bounded physical events, each with an id so they are presented once. */
  transientEvents: TransientEvent[];
  climate: ClimateState;
  charge: ChargeState;
  location: VehicleLocation;
  health: VehicleHealth;
  /** When the cloud last received fresh telemetry from the vehicle. */
  lastUpdatedAt: string;
  /** True when the app is showing cached data because the vehicle is unreachable. */
  isCached: boolean;
  /**
   * Monotonically increasing revision assigned by the server on every accepted
   * report.
   *
   * This is the reconciliation primitive: a realtime message is adopted only
   * when its revision exceeds the one already held, so an out-of-order delivery
   * cannot move the vehicle backwards. Absent in local-fixture mode, where
   * there is no server to assign one.
   */
  revision?: number;
};
