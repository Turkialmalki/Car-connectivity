/** Shared access and driver management. */

export type DriverPermission =
  'drive' | 'remote_lock' | 'climate' | 'location' | 'charging' | 'service_info';

export const PERMISSION_COPY: Record<DriverPermission, { label: string; detail: string }> = {
  drive: { label: 'Drive vehicle', detail: 'Start and drive using their Digital Key.' },
  remote_lock: {
    label: 'Remote lock & unlock',
    detail: 'Lock or unlock the vehicle from their phone.',
  },
  climate: { label: 'Climate control', detail: 'Precondition the cabin remotely.' },
  location: { label: 'View location', detail: 'See where the vehicle is parked.' },
  charging: { label: 'Charging controls', detail: 'Start, stop and schedule charging.' },
  service_info: {
    label: 'Service information',
    detail: 'View health, tyres and service reminders.',
  },
};

export type AccessDuration =
  | { kind: 'permanent' }
  | { kind: 'date_range'; startsAt: string; endsAt: string }
  | { kind: 'one_time'; expiresAt: string }
  | { kind: 'valet'; expiresAt: string };

export const DURATION_COPY: Record<AccessDuration['kind'], string> = {
  permanent: 'Permanent',
  date_range: 'Date range',
  one_time: 'One-time access',
  valet: 'Valet access',
};

export type DriverStatus = 'invited' | 'active' | 'suspended' | 'revoked' | 'expired';

export type SharedDriver = {
  id: string;
  name: string;
  contact: string;
  status: DriverStatus;
  permissions: DriverPermission[];
  duration: AccessDuration;
  invitedAt: string;
  acceptedAt: string | null;
  keyId: string | null;
  avatarInitials: string;
};

export type AccessAuditEventType =
  | 'driver_invited'
  | 'key_provisioned'
  | 'permission_changed'
  | 'key_suspended'
  | 'access_revoked'
  | 'invite_accepted';

export const AUDIT_COPY: Record<AccessAuditEventType, string> = {
  driver_invited: 'Driver invited',
  key_provisioned: 'Key provisioned',
  permission_changed: 'Permission changed',
  key_suspended: 'Key suspended',
  access_revoked: 'Access revoked',
  invite_accepted: 'Invite accepted',
};

export type AccessAuditEvent = {
  id: string;
  type: AccessAuditEventType;
  subjectName: string;
  actorName: string;
  detail: string;
  occurredAt: string;
};

/** Valet access is deliberately the most restrictive preset. */
export const VALET_PERMISSIONS: DriverPermission[] = ['drive'];
export const DEFAULT_SHARED_PERMISSIONS: DriverPermission[] = [
  'drive',
  'remote_lock',
  'climate',
  'location',
];
