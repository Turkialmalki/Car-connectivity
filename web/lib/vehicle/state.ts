/**
 * The reported vehicle state contract.
 *
 * This is the single shape that the simulator produces, the API validates and
 * persists, and the mobile app consumes. It mirrors `VehicleState` in the React
 * Native domain layer, minus the three fields that are the SERVER's to decide:
 *
 *   vehicleId      — taken from the authenticated simulator session
 *   lastUpdatedAt  — the server's receipt time
 *   isCached       — derived from how old the snapshot is
 *
 * A simulator that could set those could claim to be a different vehicle, or
 * claim its stale data was fresh.
 */
import { z } from 'zod';

export const DOOR_IDS = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;
export type DoorId = (typeof DOOR_IDS)[number];

const doorState = z.enum(['open', 'closed']);
const isoDate = z.string().datetime({ offset: true });

/** Bounded so a report cannot carry an unbounded event backlog. */
export const transientEventSchema = z.object({
  id: z.string().min(4).max(64),
  kind: z.enum(['flash', 'horn']),
  occurredAt: isoDate,
  durationMs: z.number().int().min(100).max(10_000),
});

export const climateSchema = z.object({
  active: z.boolean(),
  interiorTempC: z.number().min(-40).max(80),
  exteriorTempC: z.number().min(-60).max(70),
  targetTempC: z.number().min(14).max(30),
  passengerTargetTempC: z.number().min(14).max(30),
  zonesSynced: z.boolean(),
  fanLevel: z.number().int().min(0).max(5),
  driverSeatHeat: z.number().int().min(0).max(3),
  passengerSeatHeat: z.number().int().min(0).max(3),
  seatVentilation: z.number().int().min(0).max(3),
  steeringWheelHeat: z.boolean(),
  frontDefrost: z.boolean(),
  rearDefrost: z.boolean(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  departureEnabled: z.boolean(),
});

export const chargeSchema = z.object({
  batteryPercent: z.number().min(0).max(100),
  estimatedRangeKm: z.number().min(0).max(2000),
  status: z.enum([
    'not_plugged_in',
    'connected_not_charging',
    'charging',
    'complete',
    'fault',
    'scheduled',
  ]),
  chargeLimitPercent: z.number().int().min(50).max(100),
  powerKw: z.number().min(0).max(400),
  addedRangeKm: z.number().min(0).max(2000),
  minutesRemaining: z.number().int().min(0).max(6000).nullable(),
  portOpen: z.boolean(),
  locationLabel: z.string().max(80),
  scheduleEnabled: z.boolean(),
  scheduleStart: z.string().regex(/^\d{2}:\d{2}$/),
  scheduleEnd: z.string().regex(/^\d{2}:\d{2}$/),
  faultReason: z.string().max(160).optional(),
  batteryHealthPercent: z.number().min(0).max(100),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  headingDegrees: z.number().min(0).max(359.999),
  isLive: z.boolean(),
  capturedAt: isoDate,
  addressLabel: z.string().max(120),
  city: z.string().max(80),
});

export const reportedStateSchema = z.object({
  connectivity: z.enum(['online', 'asleep', 'poor_signal', 'offline', 'service_mode']),
  lock: z.enum(['locked', 'unlocked']),
  gear: z.enum(['P', 'R', 'N', 'D']),
  isMoving: z.boolean(),
  speedKph: z.number().min(0).max(400),
  doors: z.object({
    frontLeft: doorState,
    frontRight: doorState,
    rearLeft: doorState,
    rearRight: doorState,
  }),
  trunk: doorState,
  frunk: doorState,
  windowsClosed: z.boolean(),
  power: z.enum(['asleep', 'waking', 'awake']),
  lights: z.object({
    headlights: z.boolean(),
    taillights: z.boolean(),
    indicators: z.boolean(),
    daytimeRunning: z.boolean(),
  }),
  driveAuthorization: z.object({
    granted: z.boolean(),
    expiresAt: isoDate.nullable(),
    grantedAt: isoDate.nullable(),
  }),
  driveReady: z.boolean(),
  transientEvents: z.array(transientEventSchema).max(8),
  climate: climateSchema,
  charge: chargeSchema,
  location: locationSchema,
});

export type ReportedVehicleState = z.infer<typeof reportedStateSchema>;
export type ClimateState = z.infer<typeof climateSchema>;
export type ChargeState = z.infer<typeof chargeSchema>;
export type VehicleLocation = z.infer<typeof locationSchema>;
export type TransientEvent = z.infer<typeof transientEventSchema>;

/** The snapshot as the API returns it: reported state plus the server's facts. */
export type VehicleSnapshot = ReportedVehicleState & {
  vehicleId: string;
  revision: number;
  observedAt: string;
  lastUpdatedAt: string;
  isCached: boolean;
};

/**
 * How old a snapshot may be before the app must present it as last-known.
 *
 * The simulator reports every 2 s, so three missed reports is already a signal
 * worth showing rather than smoothing over.
 */
export const SNAPSHOT_STALE_AFTER_MS = 15_000;

export const isSnapshotStale = (observedAt: string, now = Date.now()): boolean =>
  now - new Date(observedAt).getTime() > SNAPSHOT_STALE_AFTER_MS;

export const capabilitiesSchema = z.object({
  remoteLock: z.boolean(),
  remoteClimate: z.boolean(),
  remoteTrunk: z.boolean(),
  remoteFrunk: z.boolean(),
  remoteDoors: z.boolean(),
  remoteChargePort: z.boolean(),
  remoteDriveAuthorization: z.boolean(),
  remoteHorn: z.boolean(),
  remoteLights: z.boolean(),
  chargeControl: z.boolean(),
  chargeScheduling: z.boolean(),
  digitalKey: z.enum(['none', 'nfc', 'ble_nfc', 'uwb_ble_nfc']),
  location: z.boolean(),
  otaUpdates: z.boolean(),
});

export type VehicleCapabilities = z.infer<typeof capabilitiesSchema>;
