import type {
  DigitalKeyRepository,
  DriverAccessRepository,
  NotificationRepository,
  OtaRepository,
  TelemetryRepository,
  VehicleCommandRepository,
  VehicleRepository,
} from '@/domain/repositories';
import type { VehicleCapabilities } from '@/domain/entities';
import { connectedCloud } from '../mock-connected-cloud';
import { connectedBackend, isConnectedMode, localModeReason } from '../connected-backend';

export * from './metrics';

/**
 * Composition root for data access.
 *
 * Everything above this file talks to interfaces, which is what makes this the
 * only file that changes when the data source changes.
 *
 * Two implementations exist:
 *
 *   connectedBackend — Supabase Auth, the Next.js API and a separate vehicle
 *                      simulator, joined by a private realtime channel. Used
 *                      whenever the three EXPO_PUBLIC_ variables are set.
 *   connectedCloud   — the original in-process simulation. Used when they are
 *                      not, so the app still runs with no credentials at all.
 *
 * Vehicle identity, live state and commands come from whichever is selected.
 * Digital Key, driver sharing, notifications and OTA are not part of the
 * backend and stay on local fixtures in both modes; the README says so plainly
 * rather than implying the whole app is server-backed.
 */
export const connected = isConnectedMode();

export const vehicleRepository: VehicleRepository = connected ? connectedBackend : connectedCloud;
export const commandRepository: VehicleCommandRepository = connected
  ? connectedBackend
  : connectedCloud;
export const telemetryRepository: TelemetryRepository = connected
  ? connectedBackend
  : connectedCloud;

export const digitalKeyRepository: DigitalKeyRepository = connectedCloud;
export const driverAccessRepository: DriverAccessRepository = connectedCloud;
export const notificationRepository: NotificationRepository = connectedCloud;
export const otaRepository: OtaRepository = connectedCloud;

/**
 * Capabilities, synchronously, for the pre-flight authorization check that runs
 * on a control tap.
 *
 * In connected mode this reads a cache filled when the vehicle was loaded. A
 * miss returns a permissive profile and lets the SERVER decide — which it does
 * regardless, since the client check has always been a courtesy.
 */
const PERMISSIVE: VehicleCapabilities = {
  remoteLock: true,
  remoteClimate: true,
  remoteTrunk: true,
  remoteFrunk: true,
  remoteDoors: true,
  remoteChargePort: true,
  remoteDriveAuthorization: true,
  remoteHorn: true,
  remoteLights: true,
  chargeControl: true,
  chargeScheduling: true,
  digitalKey: 'uwb_ble_nfc',
  location: true,
  otaUpdates: true,
};

export const capabilitiesFor = (vehicleId: string): VehicleCapabilities =>
  connected
    ? (connectedBackend.getCachedCapabilities(vehicleId) ?? PERMISSIVE)
    : connectedCloud.getCapabilitiesForVehicle(vehicleId);

export { localModeReason, connectedBackend };

/** Escape hatch used only by the developer simulation panel and demo mode. */
export const simulationControl = connectedCloud;

/**
 * Documented HTTP contract the mock layer mirrors.
 * Kept here so the API surface is reviewable in one place.
 */
export const API_CONTRACT = [
  { method: 'GET', path: '/vehicles', description: 'Vehicles the signed-in account may access.' },
  { method: 'GET', path: '/vehicles/:vehicleId', description: 'Static vehicle identity and trim.' },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/state',
    description: 'Authoritative live state snapshot.',
  },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/capabilities',
    description: 'Feature gating for this VIN and software version.',
  },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/telemetry',
    description: 'Normalized telemetry signals.',
  },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/charging',
    description: 'Charging session and schedule state.',
  },
  {
    method: 'POST',
    path: '/vehicles/:vehicleId/commands',
    description: 'Submit a command. Returns 202 Accepted.',
  },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/commands/:commandId',
    description: 'Poll a command as it moves through the pipeline.',
  },
  {
    method: 'GET',
    path: '/vehicles/:vehicleId/digital-keys',
    description: 'Key metadata only. Never key material.',
  },
  {
    method: 'POST',
    path: '/vehicles/:vehicleId/digital-keys',
    description: 'Begin a provisioning ceremony.',
  },
  {
    method: 'DELETE',
    path: '/vehicles/:vehicleId/digital-keys/:keyId',
    description: 'Revoke a credential at the vehicle.',
  },
] as const;

/** Example request/response shapes, rendered in the developer screen. */
export const EXAMPLE_COMMAND_REQUEST = {
  type: 'unlock',
  idempotencyKey: 'idem_ly7f2k_a91cd3e0',
  requestedAt: '2026-09-09T18:41:02.334Z',
  expiresInSeconds: 30,
};

export const EXAMPLE_COMMAND_RESPONSE = {
  commandId: 'cmd_123',
  correlationId: 'corr_456',
  status: 'validating',
  vehicleId: 'nova_one_demo',
};
