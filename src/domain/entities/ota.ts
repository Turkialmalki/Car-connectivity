/** Over-the-air vehicle software update domain model. */

export type OtaStatus =
  | 'up_to_date'
  | 'available'
  | 'scheduled'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'failed';

export const OTA_STATUS_COPY: Record<OtaStatus, string> = {
  up_to_date: 'Up to date',
  available: 'Update available',
  scheduled: 'Installation scheduled',
  downloading: 'Downloading',
  verifying: 'Verifying',
  installing: 'Installing',
  completed: 'Update complete',
  failed: 'Update failed',
};

export type OtaPrerequisiteId =
  'parked' | 'battery' | 'not_charging_restricted' | 'closed_up' | 'duration_ack';

export type OtaPrerequisite = {
  id: OtaPrerequisiteId;
  label: string;
  detail: string;
  /** Automatically satisfied by vehicle state, or requires explicit user acknowledgement. */
  kind: 'system' | 'acknowledgement';
  satisfied: boolean;
};

export type OtaUpdate = {
  id: string;
  version: string;
  currentVersion: string;
  sizeMb: number;
  estimatedMinutes: number;
  releasedAt: string;
  status: OtaStatus;
  progressPercent: number;
  scheduledFor: string | null;
  failureReason?: string;
  highlights: { title: string; detail: string }[];
};
