/**
 * The command contract.
 *
 * Mirrors the CommandType union in the React Native domain layer. Anything not
 * in this list is refused at the edge, so a typo in a client cannot reach the
 * simulator as an unrecognised action.
 */
import { z } from 'zod';
import type { VehicleCapabilities } from './state';

export const COMMAND_TYPES = [
  'lock',
  'unlock',
  'start_climate',
  'stop_climate',
  'set_temperature',
  'open_trunk',
  'close_trunk',
  'open_frunk',
  'close_frunk',
  'open_door',
  'close_door',
  'open_charge_port',
  'close_charge_port',
  'start_charging',
  'stop_charging',
  'set_charge_limit',
  'flash_lights',
  'sound_horn',
  'wake_vehicle',
  'enable_driving',
  'disable_driving',
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export type BackendCommandStatus =
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'rejected';

export const TERMINAL_STATUSES: readonly BackendCommandStatus[] = [
  'succeeded',
  'failed',
  'expired',
  'rejected',
];

/** Which capability flag gates each command. */
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
  start_charging: 'chargeControl',
  stop_charging: 'chargeControl',
  set_charge_limit: 'chargeControl',
  flash_lights: 'remoteLights',
  sound_horn: 'remoteHorn',
  wake_vehicle: 'remoteLock',
  enable_driving: 'remoteDriveAuthorization',
  disable_driving: 'remoteDriveAuthorization',
};

/**
 * Expiry windows, in seconds. High-risk actions get a short window so an
 * unlock cannot sit in a queue and fire long after the user forgot about it.
 */
export const DEFAULT_EXPIRY_SECONDS: Record<CommandType, number> = {
  unlock: 30,
  open_trunk: 30,
  open_frunk: 30,
  open_door: 30,
  enable_driving: 30,
  lock: 60,
  close_trunk: 60,
  close_frunk: 60,
  close_door: 60,
  disable_driving: 30,
  start_climate: 90,
  stop_climate: 60,
  set_temperature: 60,
  start_charging: 90,
  stop_charging: 60,
  set_charge_limit: 60,
  open_charge_port: 45,
  close_charge_port: 45,
  flash_lights: 30,
  sound_horn: 30,
  wake_vehicle: 120,
};

export const MAX_EXPIRY_SECONDS = 300;

/**
 * Per-command payload rules.
 *
 * Every command is listed, including the ones that take nothing, so adding a
 * command without deciding what it accepts is a type error rather than an
 * accidentally unvalidated body.
 */
const empty = z.object({}).strict();
const doorId = z.enum(['frontLeft', 'frontRight', 'rearLeft', 'rearRight']);

export const COMMAND_PAYLOAD_SCHEMA: Record<CommandType, z.ZodTypeAny> = {
  lock: empty,
  unlock: empty,
  start_climate: z.object({ targetTempC: z.number().min(14).max(30).optional() }).strict(),
  stop_climate: empty,
  set_temperature: z
    .object({
      targetTempC: z.number().min(14).max(30),
      zone: z.enum(['driver', 'passenger', 'both']).optional(),
    })
    .strict(),
  open_trunk: empty,
  close_trunk: empty,
  open_frunk: empty,
  close_frunk: empty,
  open_door: z.object({ door: doorId }).strict(),
  close_door: z.object({ door: doorId }).strict(),
  open_charge_port: empty,
  close_charge_port: empty,
  start_charging: empty,
  stop_charging: empty,
  set_charge_limit: z.object({ chargeLimitPercent: z.number().int().min(50).max(100) }).strict(),
  flash_lights: empty,
  sound_horn: empty,
  wake_vehicle: empty,
  enable_driving: empty,
  disable_driving: empty,
};

export const commandRequestSchema = z
  .object({
    type: z.enum(COMMAND_TYPES),
    payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    idempotencyKey: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/),
    expiresInSeconds: z.number().int().min(5).max(MAX_EXPIRY_SECONDS).optional(),
  })
  .strict();

export type CommandRequest = z.infer<typeof commandRequestSchema>;

export const FAILURE_CODES = [
  'vehicle_offline',
  'command_expired',
  'vehicle_moving',
  'service_mode',
  'permission_revoked',
  'secure_session_failed',
  'no_acknowledgment',
  'capability_unsupported',
  'precondition_failed',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];
