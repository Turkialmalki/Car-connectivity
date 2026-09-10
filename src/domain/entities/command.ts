/**
 * Vehicle command domain model.
 *
 * A command is a *request* that travels:
 *   Mobile App -> Connected Services API -> Command Service -> IoT Broker
 *   -> Vehicle TCU -> Secure Gateway -> Vehicle ECU
 *
 * The mobile app never executes anything. It requests, then observes.
 * The vehicle is the only authority for physical execution, which is why
 * `confirmed` is the ONLY status that may be presented to a user as success.
 */

export type CommandStatus =
  | 'requested'
  | 'validating'
  | 'queued'
  | 'delivered'
  | 'executing'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'failed';

export type CommandType =
  | 'lock'
  | 'unlock'
  | 'start_climate'
  | 'stop_climate'
  | 'set_temperature'
  | 'open_trunk'
  | 'close_trunk'
  | 'start_charging'
  | 'stop_charging'
  | 'flash_lights'
  | 'sound_horn'
  | 'open_frunk'
  | 'close_frunk'
  | 'open_door'
  | 'close_door'
  | 'open_charge_port'
  | 'close_charge_port'
  | 'wake_vehicle'
  | 'enable_driving'
  | 'disable_driving';

export type VehicleCommand = {
  id: string;
  idempotencyKey: string;
  correlationId: string;
  vehicleId: string;
  type: CommandType;
  requestedAt: string;
  expiresAt: string;
  status: CommandStatus;
  /**
   * Human-readable fallback. Prefer `failureCode` for anything user-facing:
   * prose cannot be localised, a code can.
   */
  failureReason?: string;
  failureCode?: FailureReason;
  /** Free-form typed payload, e.g. { temperatureC: 22 } for set_temperature. */
  payload?: Record<string, number | string | boolean>;
  /** Populated once the pipeline finishes; used by the E2E trace screen. */
  trace?: CommandTraceStage[];
  completedAt?: string;
  /** True when this command was a retry that reused an existing idempotency key. */
  wasRetry?: boolean;
};

/** Canonical, user-presentable failure reasons. */
export type FailureReason =
  | 'vehicle_offline'
  | 'command_expired'
  | 'vehicle_moving'
  | 'service_mode'
  | 'permission_revoked'
  | 'secure_session_failed'
  | 'no_acknowledgment'
  | 'capability_unsupported'
  | 'precondition_failed';

export const FAILURE_REASON_COPY: Record<FailureReason, string> = {
  vehicle_offline: 'Vehicle is offline',
  command_expired: 'Command expired',
  vehicle_moving: 'Vehicle is moving',
  service_mode: 'Vehicle is in service mode',
  permission_revoked: 'Permission was revoked',
  secure_session_failed: 'Secure session could not be established',
  no_acknowledgment: 'Vehicle did not acknowledge the request',
  capability_unsupported: 'This vehicle does not support that function',
  precondition_failed: 'Vehicle conditions prevented this command',
};

/** One hop of the end-to-end pipeline, used for observability. */
export type TraceStageName =
  | 'mobile_request_created'
  | 'api_gateway_received'
  | 'authorization_passed'
  | 'command_service_published'
  | 'iot_broker_delivered'
  | 'vehicle_tcu_acknowledged'
  | 'vehicle_function_executed'
  | 'state_returned'
  | 'push_delivered';

export type CommandTraceStage = {
  stage: TraceStageName;
  startedAt: string;
  elapsedMs: number;
  ok: boolean;
  detail?: string;
};

export const TRACE_STAGE_COPY: Record<TraceStageName, { label: string; layer: string }> = {
  mobile_request_created: { label: 'Mobile request created', layer: 'React Native app' },
  api_gateway_received: { label: 'API gateway received', layer: 'Connected Services API' },
  authorization_passed: {
    label: 'Authorization passed',
    layer: 'AuthZ (user × vehicle × command)',
  },
  command_service_published: { label: 'Command service published', layer: 'Command Service' },
  iot_broker_delivered: { label: 'IoT broker delivered', layer: 'IoT Broker (MQTT)' },
  vehicle_tcu_acknowledged: { label: 'Vehicle TCU acknowledged', layer: 'Vehicle TCU' },
  vehicle_function_executed: { label: 'Vehicle function executed', layer: 'Secure Gateway → ECU' },
  state_returned: { label: 'Updated state returned', layer: 'Telemetry pipeline' },
  push_delivered: { label: 'Push notification delivered', layer: 'Push service' },
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly CommandStatus[] = [
  'confirmed',
  'rejected',
  'expired',
  'failed',
];

/** Statuses that are safe to describe to the user as "still in progress". */
export const IN_FLIGHT_STATUSES: readonly CommandStatus[] = [
  'requested',
  'validating',
  'queued',
  'delivered',
  'executing',
];

export const isTerminal = (status: CommandStatus): boolean => TERMINAL_STATUSES.includes(status);

export const isInFlight = (status: CommandStatus): boolean => IN_FLIGHT_STATUSES.includes(status);

/** Only `confirmed` means the vehicle actually did the thing. */
export const isSuccess = (status: CommandStatus): boolean => status === 'confirmed';

/**
 * High-risk commands require biometric step-up and must EXPIRE rather than
 * queue indefinitely, so an unlock can never fire hours later unexpectedly.
 */
export const HIGH_RISK_COMMANDS: readonly CommandType[] = [
  'unlock',
  'open_trunk',
  'open_frunk',
  'open_door',
  'enable_driving',
];

export const isHighRisk = (type: CommandType): boolean => HIGH_RISK_COMMANDS.includes(type);

/** Default expiry windows in seconds, per risk class. */
export const DEFAULT_EXPIRY_SECONDS: Record<CommandType, number> = {
  unlock: 30,
  open_trunk: 30,
  lock: 60,
  close_trunk: 60,
  start_climate: 90,
  stop_climate: 60,
  set_temperature: 60,
  start_charging: 90,
  stop_charging: 60,
  flash_lights: 30,
  sound_horn: 30,
  open_frunk: 30,
  close_frunk: 60,
  open_door: 30,
  close_door: 60,
  open_charge_port: 45,
  close_charge_port: 45,
  wake_vehicle: 120,
  enable_driving: 30,
  disable_driving: 30,
};

/**
 * How long a granted drive authorization remains valid.
 *
 * It expires on its own. An expired grant is never re-sent automatically —
 * re-authorising is always a fresh, deliberate user action.
 */
export const DRIVE_AUTHORIZATION_SECONDS = 180;

/**
 * Commands whose effect is a bounded physical event rather than a state change.
 * These must be presented exactly once, keyed by the event id the vehicle
 * reports, never replayed when a screen remounts.
 */
export const TRANSIENT_COMMANDS: readonly CommandType[] = ['flash_lights', 'sound_horn'];

export const isTransient = (type: CommandType): boolean => TRANSIENT_COMMANDS.includes(type);

/**
 * Commands that physically move a panel. Two requests that move the SAME panel
 * conflict; anything else may run concurrently (climate can run with the boot
 * open, for instance).
 */
export const PANEL_FOR_COMMAND: Partial<Record<CommandType, string>> = {
  open_trunk: 'trunk',
  close_trunk: 'trunk',
  open_frunk: 'frunk',
  close_frunk: 'frunk',
  open_charge_port: 'chargePort',
  close_charge_port: 'chargePort',
  lock: 'lock',
  unlock: 'lock',
  start_climate: 'climate',
  stop_climate: 'climate',
  start_charging: 'charging',
  stop_charging: 'charging',
  enable_driving: 'drive',
  disable_driving: 'drive',
};

/**
 * The conflict key for a command, including its payload where the payload is
 * what identifies the moving part (which door, for example).
 */
export const conflictKey = (
  type: CommandType,
  payload?: Record<string, number | string | boolean>,
): string => {
  if (type === 'open_door' || type === 'close_door') return `door:${String(payload?.door ?? '')}`;
  const panel = PANEL_FOR_COMMAND[type];
  return panel ? `panel:${panel}` : `type:${type}`;
};

/** Shown alongside a trace to reinforce where authority actually sits. */
export const PIPELINE_LAYER_NOTE =
  'The mobile app owns only the first hop. Authorization is decided by the connected-services API, delivery is at-least-once through the broker, and physical execution is decided by the vehicle — which is why only a TCU acknowledgement counts as success.';

export const COMMAND_COPY: Record<CommandType, string> = {
  lock: 'Lock vehicle',
  unlock: 'Unlock vehicle',
  start_climate: 'Start climate',
  stop_climate: 'Stop climate',
  set_temperature: 'Set temperature',
  open_trunk: 'Open trunk',
  close_trunk: 'Close trunk',
  start_charging: 'Start charging',
  stop_charging: 'Stop charging',
  flash_lights: 'Flash lights',
  sound_horn: 'Sound horn',
  open_frunk: 'Open front boot',
  close_frunk: 'Close front boot',
  open_door: 'Open door',
  close_door: 'Close door',
  open_charge_port: 'Open charge port',
  close_charge_port: 'Close charge port',
  wake_vehicle: 'Wake vehicle',
  enable_driving: 'Enable driving',
  disable_driving: 'Disable driving',
};

/**
 * Present-tense copy shown while a command is in flight.
 *
 * Named for what is actually happening: unlocking is not opening, and
 * authorising driving is not the vehicle being ready.
 */
export const COMMAND_PROGRESS_COPY: Record<CommandType, string> = {
  lock: 'Locking\u2026',
  unlock: 'Unlocking\u2026',
  start_climate: 'Starting climate\u2026',
  stop_climate: 'Stopping climate\u2026',
  set_temperature: 'Setting temperature\u2026',
  open_trunk: 'Opening boot\u2026',
  close_trunk: 'Closing boot\u2026',
  start_charging: 'Starting charge\u2026',
  stop_charging: 'Stopping charge\u2026',
  flash_lights: 'Flashing lights\u2026',
  sound_horn: 'Sounding horn\u2026',
  open_frunk: 'Opening front boot\u2026',
  close_frunk: 'Closing front boot\u2026',
  open_door: 'Opening door\u2026',
  close_door: 'Closing door\u2026',
  open_charge_port: 'Opening charge port\u2026',
  close_charge_port: 'Closing charge port\u2026',
  wake_vehicle: 'Waking vehicle\u2026',
  enable_driving: 'Authorising\u2026',
  disable_driving: 'Revoking authorisation\u2026',
};
