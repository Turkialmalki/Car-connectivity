import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminClient } from '@/lib/supabase/admin';

/**
 * Authorization for every handler in this API.
 *
 * Two entirely separate identities exist:
 *
 *   A USER  — a Supabase Auth access token. Reads state, requests commands.
 *   A SIMULATOR — a bearer secret bound to one vehicle for a short window.
 *                 Reports state and executes commands. Never acts as a user.
 *
 * Both paths end by re-checking permissions against the database. The handlers
 * use the privileged client, which bypasses RLS, so this file is the only thing
 * standing between a request and someone else's car.
 */

export type VehicleAccess = {
  userId: string;
  vehicleId: string;
  role: 'owner' | 'driver' | 'viewer';
  canCommand: boolean;
  canSimulate: boolean;
};

const bearer = (request: Request): string | null => {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
};

/** Verifies a Supabase access token and returns the user id, or null. */
export const authenticateUser = async (request: Request): Promise<{ id: string } | null> => {
  const token = bearer(request);
  if (!token) return null;

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
};

/**
 * Looks up what this user may do with this vehicle.
 *
 * Returns null when the user is not a member — which is the same answer as
 * "no such vehicle", deliberately: a stranger probing vehicle ids learns
 * nothing about which ones exist.
 */
export const vehicleAccessFor = async (
  userId: string,
  vehicleId: string,
): Promise<VehicleAccess | null> => {
  if (!isUuid(vehicleId)) return null;

  const { data, error } = await adminClient()
    .from('vehicle_members')
    .select('role, can_command, can_simulate')
    .eq('user_id', userId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    userId,
    vehicleId,
    role: data.role as VehicleAccess['role'],
    canCommand: Boolean(data.can_command),
    canSimulate: Boolean(data.can_simulate),
  };
};

export type SimulatorSession = {
  id: string;
  vehicleId: string;
  userId: string;
  expiresAt: string;
};

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Issues a session secret.
 *
 * Prefixed so a leaked string is recognisable in a log, and 32 random bytes so
 * guessing is not a strategy.
 */
export const mintSessionToken = (): string => `sim_${randomBytes(32).toString('hex')}`;

/**
 * Resolves a simulator bearer token to its live session.
 *
 * The session carries the vehicle id. Handlers use THAT, never a vehicle id
 * from the request body — a simulator authorized for one car cannot report
 * telemetry for another by asking nicely.
 */
export const authenticateSimulator = async (
  request: Request,
): Promise<SimulatorSession | null> => {
  const token = bearer(request);
  if (!token || !token.startsWith('sim_')) return null;

  const { data, error } = await adminClient()
    .rpc('authenticate_simulator', { p_token_hash: hashToken(token) })
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    vehicle_id: string;
    user_id: string;
    expires_at: string;
  };

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
  };
};

/** Constant-time comparison, for anywhere a secret is compared in process. */
export const secretsMatch = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);
