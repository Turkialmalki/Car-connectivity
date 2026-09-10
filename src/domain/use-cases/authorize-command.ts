import { type CommandType, type FailureReason, isHighRisk } from '../entities/command';
import {
  COMMAND_CAPABILITY,
  type ConnectivityMode,
  type VehicleCapabilities,
  type VehicleState,
} from '../entities/vehicle';
import type { DriverPermission } from '../entities/driver-access';

/**
 * Pre-flight authorization performed before a command is ever sent.
 *
 * This is a *client-side courtesy check* only. The real decision is made by the
 * connected-services API, per (user × vehicle × command). The client check
 * exists so the user gets an instant, honest explanation instead of a spinner
 * that ends in a server rejection.
 */
export type AuthorizationResult =
  | { allowed: true; requiresBiometric: boolean }
  | { allowed: false; reason: FailureReason; message: string };

/** Which permission a shared driver needs for each command. */
export const COMMAND_PERMISSION: Record<CommandType, DriverPermission> = {
  lock: 'remote_lock',
  unlock: 'remote_lock',
  start_climate: 'climate',
  stop_climate: 'climate',
  set_temperature: 'climate',
  open_trunk: 'remote_lock',
  close_trunk: 'remote_lock',
  start_charging: 'charging',
  stop_charging: 'charging',
  flash_lights: 'location',
  sound_horn: 'location',
  open_frunk: 'remote_lock',
  close_frunk: 'remote_lock',
  open_door: 'remote_lock',
  close_door: 'remote_lock',
  open_charge_port: 'charging',
  close_charge_port: 'charging',
  wake_vehicle: 'remote_lock',
  enable_driving: 'drive',
  disable_driving: 'drive',
};

/** Commands a technician-held vehicle refuses outright. */
const SERVICE_MODE_BLOCKED: readonly CommandType[] = [
  'unlock',
  'lock',
  'open_trunk',
  'close_trunk',
  'start_charging',
  'stop_charging',
  'start_climate',
  'open_frunk',
  'open_door',
  'enable_driving',
];

/** Commands that are unsafe or meaningless while the vehicle is in motion. */
const MOVING_BLOCKED: readonly CommandType[] = [
  'unlock',
  'lock',
  'open_trunk',
  'start_charging',
  'stop_charging',
  'open_frunk',
  'open_door',
  'close_door',
  'open_charge_port',
];

export type AuthorizeInput = {
  type: CommandType;
  capabilities: VehicleCapabilities;
  connectivity: ConnectivityMode;
  isMoving: boolean;
  /** Undefined for the owner; a permission list for a shared driver. */
  grantedPermissions?: DriverPermission[];
  /** User setting: require Face ID / fingerprint for remote unlock. */
  requireBiometricForUnlock: boolean;
};

export const authorizeCommand = (input: AuthorizeInput): AuthorizationResult => {
  const capabilityKey = COMMAND_CAPABILITY[input.type];
  const capabilityValue = input.capabilities[capabilityKey];

  // Capability gate: never offer, and never send, what the vehicle cannot do.
  if (typeof capabilityValue === 'boolean' && !capabilityValue) {
    return {
      allowed: false,
      reason: 'capability_unsupported',
      message: 'This vehicle configuration does not support that function.',
    };
  }

  // Delegated-permission gate for shared drivers.
  if (input.grantedPermissions) {
    const required = COMMAND_PERMISSION[input.type];
    if (!input.grantedPermissions.includes(required)) {
      return {
        allowed: false,
        reason: 'permission_revoked',
        message: 'Your access to this control was removed by the vehicle owner.',
      };
    }
  }

  if (input.connectivity === 'service_mode' && SERVICE_MODE_BLOCKED.includes(input.type)) {
    return {
      allowed: false,
      reason: 'service_mode',
      message: 'The vehicle is with a service technician. Remote control is restricted.',
    };
  }

  if (input.isMoving && MOVING_BLOCKED.includes(input.type)) {
    return {
      allowed: false,
      reason: 'vehicle_moving',
      message: 'This command is unavailable while the vehicle is in motion.',
    };
  }

  const requiresBiometric = isHighRisk(input.type) && input.requireBiometricForUnlock;
  return { allowed: true, requiresBiometric };
};

/** Offline vehicles accept nothing — the app must not queue a false promise. */
export const canReachVehicle = (connectivity: ConnectivityMode): boolean =>
  connectivity !== 'offline';

/** Convenience wrapper used by screens to grey out a control with a reason. */
export const explainUnavailable = (
  type: CommandType,
  state: Pick<VehicleState, 'connectivity' | 'isMoving'>,
  capabilities: VehicleCapabilities,
): string | null => {
  const result = authorizeCommand({
    type,
    capabilities,
    connectivity: state.connectivity,
    isMoving: state.isMoving,
    requireBiometricForUnlock: false,
  });
  return result.allowed ? null : result.message;
};
