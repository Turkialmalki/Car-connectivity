export type NotificationCategory =
  | 'charging'
  | 'security'
  | 'climate'
  | 'digital_key'
  | 'software'
  | 'health'
  | 'commands'
  | 'geofence'
  | 'service';

export const CATEGORY_COPY: Record<NotificationCategory, { label: string; detail: string }> = {
  charging: { label: 'Charging', detail: 'Session started, completed or interrupted.' },
  security: { label: 'Security', detail: 'Vehicle left unlocked, or unexpected access.' },
  climate: { label: 'Climate', detail: 'Cabin reached its target temperature.' },
  digital_key: { label: 'Digital Key', detail: 'Keys shared, provisioned, suspended or revoked.' },
  software: {
    label: 'Software updates',
    detail: 'New vehicle software is available or installed.',
  },
  health: { label: 'Vehicle health', detail: 'Tyre pressure and diagnostic warnings.' },
  commands: { label: 'Remote commands', detail: 'When a remote command fails or expires.' },
  geofence: { label: 'Geofence', detail: 'Vehicle entered or left a saved area.' },
  service: { label: 'Service', detail: 'Upcoming maintenance reminders.' },
};

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  severity: 'info' | 'success' | 'warning' | 'critical';
  /** Correlates a notification back to the command that produced it. */
  correlationId?: string;
};

export type NotificationPreferences = Record<NotificationCategory, boolean>;
