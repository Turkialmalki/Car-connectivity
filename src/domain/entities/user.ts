export type AppUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  initials: string;
  memberSince: string;
  isDemoAccount: boolean;
};

export type TrustedDevice = {
  id: string;
  label: string;
  platform: 'ios' | 'android' | 'web';
  lastActiveAt: string;
  isCurrentDevice: boolean;
  attestationVerified: boolean;
};

export type SecurityActivity = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  severity: 'info' | 'warning' | 'critical';
};

export type ActiveSession = {
  id: string;
  deviceLabel: string;
  /** Redacted for display. Full addresses are never rendered in the UI. */
  approxLocation: string;
  startedAt: string;
  isCurrent: boolean;
};
