import type { OtaPrerequisite, OtaUpdate } from '../entities/ota';
import type { VehicleState } from '../entities/vehicle';

export const MIN_BATTERY_PERCENT_FOR_OTA = 30;

/**
 * Safety prerequisites for an OTA install.
 *
 * System prerequisites are derived from live vehicle state and cannot be
 * overridden by the user. Acknowledgement prerequisites are things only a human
 * can confirm — chiefly that they accept the vehicle will be unusable.
 */
export const buildPrerequisites = (
  state: VehicleState,
  update: OtaUpdate,
  acknowledgements: Record<string, boolean>,
): OtaPrerequisite[] => [
  {
    id: 'parked',
    label: 'Vehicle parked',
    detail: 'The vehicle must be in P and stationary for the whole installation.',
    kind: 'system',
    satisfied: state.gear === 'P' && !state.isMoving,
  },
  {
    id: 'battery',
    label: `Battery above ${MIN_BATTERY_PERCENT_FOR_OTA}%`,
    detail: `Currently ${state.charge.batteryPercent}%. Installation draws power from the high-voltage battery.`,
    kind: 'system',
    satisfied: state.charge.batteryPercent >= MIN_BATTERY_PERCENT_FOR_OTA,
  },
  {
    id: 'not_charging_restricted',
    label: 'Not DC fast charging',
    detail: 'High-power charging must stop before gateway modules are flashed.',
    kind: 'system',
    satisfied: !(state.charge.status === 'charging' && state.charge.powerKw > 22),
  },
  {
    id: 'closed_up',
    label: 'Doors and windows closed',
    detail: 'Body control modules are reflashed and must not be interrupted.',
    kind: 'system',
    satisfied:
      state.windowsClosed &&
      state.trunk === 'closed' &&
      Object.values(state.doors).every((d) => d === 'closed'),
  },
  {
    id: 'duration_ack',
    label: `Vehicle unavailable for ~${update.estimatedMinutes} minutes`,
    detail: 'You will not be able to drive or use remote commands during installation.',
    kind: 'acknowledgement',
    satisfied: acknowledgements.duration_ack === true,
  },
];

export const canInstall = (prerequisites: OtaPrerequisite[]): boolean =>
  prerequisites.every((p) => p.satisfied);

export const unmetPrerequisites = (prerequisites: OtaPrerequisite[]): OtaPrerequisite[] =>
  prerequisites.filter((p) => !p.satisfied);
