import type { BackendCommandStatus } from '@/lib/vehicle/commands';
import { isSnapshotStale, type ReportedVehicleState, type VehicleSnapshot } from '@/lib/vehicle/state';

/** Database rows, named as Postgres returns them. */
export type VehicleRow = {
  id: string;
  name: string;
  model: string;
  trim: string;
  model_year: number;
  vin: string;
  color_name: string;
  paint_hex: string;
  software_version: string;
  capabilities: Record<string, unknown>;
  battery_capacity_kwh: number | string;
  max_range_km: number;
  max_ac_charge_kw: number | string;
  max_dc_charge_kw: number | string;
  is_simulated: boolean;
};

export type VehicleStateRow = {
  vehicle_id: string;
  revision: number | string;
  reported: ReportedVehicleState;
  observed_at: string;
  received_at: string;
};

export type CommandRow = {
  id: string;
  vehicle_id: string;
  requested_by: string;
  type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  correlation_id: string;
  status: BackendCommandStatus;
  requested_at: string;
  expires_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  result: Record<string, unknown> | null;
};

/** The VIN is never returned in full; four characters is what a UI may show. */
export const maskVin = (vin: string): string =>
  `${'•'.repeat(Math.max(vin.length - 4, 0))}${vin.slice(-4)}`;

export const toVehicleDto = (row: VehicleRow) => ({
  id: row.id,
  name: row.name,
  model: row.model,
  trim: row.trim,
  modelYear: row.model_year,
  vinMasked: maskVin(row.vin),
  colorName: row.color_name,
  paintHex: row.paint_hex,
  softwareVersion: row.software_version,
  capabilities: row.capabilities,
  batteryCapacityKwh: Number(row.battery_capacity_kwh),
  maxRangeKm: row.max_range_km,
  maxAcChargeKw: Number(row.max_ac_charge_kw),
  maxDcChargeKw: Number(row.max_dc_charge_kw),
  isSimulated: row.is_simulated,
});

/**
 * Turns a stored row into the snapshot clients consume.
 *
 * `isCached` is computed here, from the observation time, rather than trusted
 * from the report: a vehicle that has gone quiet cannot tell you it went quiet.
 */
export const toSnapshot = (row: VehicleStateRow, now = Date.now()): VehicleSnapshot => ({
  ...row.reported,
  vehicleId: row.vehicle_id,
  revision: Number(row.revision),
  observedAt: row.observed_at,
  lastUpdatedAt: row.received_at,
  isCached: isSnapshotStale(row.observed_at, now),
});

export const toCommandDto = (row: CommandRow) => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  type: row.type,
  payload: row.payload,
  idempotencyKey: row.idempotency_key,
  correlationId: row.correlation_id,
  status: row.status,
  requestedAt: row.requested_at,
  expiresAt: row.expires_at,
  claimedAt: row.claimed_at,
  completedAt: row.completed_at,
  failureCode: row.failure_code,
  failureReason: row.failure_reason,
  result: row.result,
});

export type CommandDto = ReturnType<typeof toCommandDto>;
export type VehicleDto = ReturnType<typeof toVehicleDto>;
