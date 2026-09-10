import {
  type AccessDuration,
  type DriverPermission,
  type DriverStatus,
  type SharedDriver,
} from '../entities/driver-access';

export const DRIVER_TRANSITIONS: Record<DriverStatus, readonly DriverStatus[]> = {
  invited: ['active', 'revoked', 'expired'],
  active: ['suspended', 'revoked', 'expired'],
  suspended: ['active', 'revoked'],
  revoked: [],
  expired: [],
};

export const canTransitionDriver = (from: DriverStatus, to: DriverStatus): boolean =>
  DRIVER_TRANSITIONS[from].includes(to);

export const isAccessExpired = (duration: AccessDuration, now: Date = new Date()): boolean => {
  switch (duration.kind) {
    case 'permanent':
      return false;
    case 'date_range':
      return now.getTime() > new Date(duration.endsAt).getTime();
    case 'one_time':
    case 'valet':
      return now.getTime() > new Date(duration.expiresAt).getTime();
  }
};

/**
 * The effective permission set for a driver at a point in time.
 * A revoked, suspended or expired driver has NO permissions — this is what makes
 * a revoked shared key stop working immediately in the UI.
 */
export const effectivePermissions = (
  driver: SharedDriver,
  now: Date = new Date(),
): DriverPermission[] => {
  if (driver.status !== 'active') return [];
  if (isAccessExpired(driver.duration, now)) return [];
  return driver.permissions;
};

export const describeDuration = (duration: AccessDuration): string => {
  switch (duration.kind) {
    case 'permanent':
      return 'Permanent access';
    case 'date_range':
      return `${formatDay(duration.startsAt)} → ${formatDay(duration.endsAt)}`;
    case 'one_time':
      return `One-time, until ${formatDay(duration.expiresAt)}`;
    case 'valet':
      return `Valet, until ${formatDay(duration.expiresAt)}`;
  }
};

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
