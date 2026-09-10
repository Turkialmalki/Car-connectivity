import type {
  AccessAuditEvent,
  ActiveSession,
  AppNotification,
  AppUser,
  DigitalKey,
  NotificationPreferences,
  OtaUpdate,
  SecurityActivity,
  SharedDriver,
  TrustedDevice,
  Vehicle,
  VehicleState,
} from '@/domain/entities';
import { isoIn, nowIso } from '@/utils/time';

/**
 * Demo fixtures.
 *
 * The demo vehicle is a generic mid-size electric crossover — the same vehicle
 * the bundled 3D model depicts, so what the app SAYS and what it SHOWS agree.
 * It is deliberately not badged as any manufacturer's product: no
 * permission-cleared articulated asset for a specific production vehicle was
 * available, and labelling generic geometry with a real model name would be a
 * misrepresentation. See docs/ASSETS.md.
 *
 * Three vehicles with deliberately different capability sets and software
 * versions. This exists to prove the UI is capability-driven: the same screens
 * must degrade gracefully from a fully-equipped Performance trim down to a base
 * trim with no UWB, no trunk actuator and no OTA.
 */

export const DEMO_USER: AppUser = {
  id: 'usr_demo_001',
  fullName: 'Turki Almalki',
  email: 'demo@example.com',
  phone: '+966 5• ••• ••42',
  initials: 'TA',
  memberSince: '2024-03-11T00:00:00.000Z',
  isDemoAccount: true,
};

export const VEHICLES: Vehicle[] = [
  {
    id: 'nova_one_demo',
    name: 'My vehicle',
    model: 'Electric crossover',
    trim: 'Long Range AWD',
    modelYear: 2025,
    vinMasked: '•••••••••••••4821',
    colorName: 'Pearl White',
    paintHex: '#E4E4DF',
    softwareVersion: '4.8.2',
    capabilities: {
      remoteLock: true,
      remoteClimate: true,
      remoteTrunk: true,
      remoteFrunk: true,
      remoteDoors: false,
      remoteChargePort: true,
      remoteDriveAuthorization: true,
      remoteHorn: true,
      remoteLights: true,
      chargeControl: true,
      chargeScheduling: true,
      digitalKey: 'uwb_ble_nfc',
      location: true,
      otaUpdates: true,
    },
    batteryCapacityKwh: 98,
    maxRangeKm: 528,
    maxAcChargeKw: 11,
    maxDcChargeKw: 250,
  },
  {
    id: 'nova_one_base',
    name: 'Second vehicle',
    model: 'Electric crossover',
    trim: 'Rear-Wheel Drive',
    modelYear: 2024,
    vinMasked: '•••••••••••••1907',
    colorName: 'Stealth Grey',
    paintHex: '#D2D4D3',
    softwareVersion: '3.2.9',
    capabilities: {
      // Older software: no powered trunk, no UWB, and OTA not yet enabled.
      remoteLock: true,
      remoteClimate: true,
      remoteTrunk: false,
      remoteFrunk: false,
      remoteDoors: false,
      remoteChargePort: true,
      remoteDriveAuthorization: true,
      remoteHorn: true,
      remoteLights: true,
      chargeControl: true,
      chargeScheduling: false,
      digitalKey: 'ble_nfc',
      location: true,
      otaUpdates: false,
    },
    batteryCapacityKwh: 74,
    maxRangeKm: 402,
    maxAcChargeKw: 11,
    maxDcChargeKw: 150,
  },
  {
    id: 'nova_lx_fleet',
    name: 'Fleet vehicle',
    model: 'Electric crossover',
    trim: 'Fleet',
    modelYear: 2023,
    vinMasked: '•••••••••••••6633',
    colorName: 'Graphite',
    paintHex: '#9EA3A7',
    softwareVersion: '2.7.4',
    capabilities: {
      // Fleet unit: location tracking on, comfort features and Digital Key off.
      remoteLock: true,
      remoteClimate: false,
      remoteTrunk: false,
      remoteFrunk: false,
      remoteDoors: false,
      remoteChargePort: false,
      remoteDriveAuthorization: false,
      remoteHorn: true,
      remoteLights: true,
      chargeControl: true,
      chargeScheduling: false,
      digitalKey: 'none',
      location: true,
      otaUpdates: false,
    },
    batteryCapacityKwh: 66,
    maxRangeKm: 340,
    maxAcChargeKw: 7,
    maxDcChargeKw: 90,
  },
];

export const PRIMARY_VEHICLE_ID = 'nova_one_demo';

/** Riyadh — King Abdullah Financial District. */
const RIYADH = { latitude: 24.7628, longitude: 46.6416 };

export const buildInitialState = (vehicleId: string): VehicleState => {
  const vehicle = VEHICLES.find((v) => v.id === vehicleId) ?? VEHICLES[0]!;
  const batteryPercent = vehicleId === PRIMARY_VEHICLE_ID ? 78 : 54;
  return {
    vehicleId,
    connectivity: 'online',
    lock: 'locked',
    gear: 'P',
    isMoving: false,
    speedKph: 0,
    doors: { frontLeft: 'closed', frontRight: 'closed', rearLeft: 'closed', rearRight: 'closed' },
    trunk: 'closed',
    frunk: 'closed',
    windowsClosed: true,
    // A parked vehicle that has not been touched for a while is asleep. Waking
    // it is a visible step, not something hidden behind a spinner.
    power: 'asleep',
    lights: {
      headlights: false,
      taillights: false,
      indicators: false,
      daytimeRunning: false,
    },
    driveAuthorization: { granted: false, expiresAt: null, grantedAt: null },
    driveReady: false,
    transientEvents: [],
    climate: {
      active: false,
      interiorTempC: 24,
      exteriorTempC: 39,
      targetTempC: 22,
      passengerTargetTempC: 22,
      zonesSynced: true,
      fanLevel: 3,
      driverSeatHeat: 0,
      passengerSeatHeat: 0,
      seatVentilation: 0,
      steeringWheelHeat: false,
      frontDefrost: false,
      rearDefrost: false,
      departureTime: '07:30',
      departureEnabled: false,
    },
    charge: {
      batteryPercent,
      estimatedRangeKm: Math.round((batteryPercent / 100) * vehicle.maxRangeKm),
      status: 'not_plugged_in',
      chargeLimitPercent: 80,
      powerKw: 0,
      addedRangeKm: 0,
      minutesRemaining: null,
      portOpen: false,
      locationLabel: 'Home — Al Nakheel',
      scheduleEnabled: true,
      scheduleStart: '23:00',
      scheduleEnd: '06:00',
      batteryHealthPercent: 97,
    },
    location: {
      ...RIYADH,
      headingDegrees: 118,
      isLive: true,
      capturedAt: nowIso(),
      addressLabel: 'Al Nakheel District, Level B2',
      city: 'Riyadh',
    },
    health: {
      overall: 'attention',
      tires: [
        { position: 'FL', pressureKpa: 248, recommendedKpa: 250, temperatureC: 41 },
        { position: 'FR', pressureKpa: 251, recommendedKpa: 250, temperatureC: 42 },
        { position: 'RL', pressureKpa: 226, recommendedKpa: 250, temperatureC: 44 },
        { position: 'RR', pressureKpa: 249, recommendedKpa: 250, temperatureC: 43 },
      ],
      batteryHealthPercent: 97,
      softwareVersion: vehicle.softwareVersion,
      serviceDueDate: isoIn(60 * 60 * 24 * 47),
      serviceDueKm: 4200,
      odometerKm: 18342,
      warnings: [
        {
          id: 'warn_tpms_rl',
          severity: 'warning',
          title: 'Rear left tyre pressure low',
          detail:
            'Measured 2.26 bar against a recommended 2.50 bar. Inflate before your next long journey.',
          code: 'TPMS_PRESSURE_LOW_RL',
          raisedAt: isoIn(-60 * 60 * 6),
        },
      ],
      lastDiagnosticAt: isoIn(-60 * 60 * 3),
    },
    lastUpdatedAt: nowIso(),
    isCached: false,
  };
};

export const buildOtaUpdate = (vehicleId: string): OtaUpdate => {
  const vehicle = VEHICLES.find((v) => v.id === vehicleId) ?? VEHICLES[0]!;
  return {
    id: 'ota_4_9_0',
    version: '4.9.0',
    currentVersion: vehicle.softwareVersion,
    sizeMb: 1840,
    estimatedMinutes: 42,
    releasedAt: isoIn(-60 * 60 * 30),
    status: vehicle.capabilities.otaUpdates ? 'available' : 'up_to_date',
    progressPercent: 0,
    scheduledFor: null,
    highlights: [
      {
        title: 'Improved thermal preconditioning',
        detail:
          'Cabin cool-down in high ambient temperatures is up to 18% faster, tuned for Gulf summer conditions.',
      },
      {
        title: 'Charging curve refinement',
        detail: 'Reduced taper above 60% state of charge on 150 kW and higher DC chargers.',
      },
      {
        title: 'Digital Key ranging stability',
        detail: 'More reliable UWB handoff when approaching the vehicle from the rear.',
      },
    ],
  };
};

export const buildDigitalKeys = (vehicleId: string): DigitalKey[] => [
  {
    id: 'key_owner_phone',
    vehicleId,
    carrier: 'phone',
    state: 'active',
    deviceLabel: 'iPhone 16 Pro',
    holderName: DEMO_USER.fullName,
    holderId: DEMO_USER.id,
    supportedTech: ['ble', 'uwb', 'nfc'],
    createdAt: isoIn(-60 * 60 * 24 * 120),
    lastUsedAt: isoIn(-60 * 40),
    expiresAt: null,
    credentialRef: 'ck_ref_owner_primary',
    isOwnerKey: true,
  },
  {
    id: 'key_owner_watch',
    vehicleId,
    carrier: 'watch',
    state: 'active',
    deviceLabel: 'Apple Watch Series 10',
    holderName: DEMO_USER.fullName,
    holderId: DEMO_USER.id,
    supportedTech: ['ble', 'nfc'],
    createdAt: isoIn(-60 * 60 * 24 * 90),
    lastUsedAt: isoIn(-60 * 60 * 26),
    expiresAt: null,
    credentialRef: 'ck_ref_owner_watch',
    isOwnerKey: true,
  },
  {
    id: 'key_card',
    vehicleId,
    carrier: 'key_card',
    state: 'active',
    deviceLabel: 'Key card',
    holderName: DEMO_USER.fullName,
    holderId: DEMO_USER.id,
    supportedTech: ['nfc'],
    createdAt: isoIn(-60 * 60 * 24 * 300),
    lastUsedAt: isoIn(-60 * 60 * 24 * 14),
    expiresAt: null,
    credentialRef: 'ck_ref_card_backup',
    isOwnerKey: true,
  },
  {
    id: 'key_shared_layla',
    vehicleId,
    carrier: 'shared_phone',
    state: 'active',
    deviceLabel: 'Pixel 9 Pro',
    holderName: 'Layla Al-Harbi',
    holderId: 'usr_shared_002',
    supportedTech: ['ble', 'nfc'],
    createdAt: isoIn(-60 * 60 * 24 * 12),
    lastUsedAt: isoIn(-60 * 60 * 20),
    expiresAt: isoIn(60 * 60 * 24 * 18),
    credentialRef: 'ck_ref_shared_layla',
    isOwnerKey: false,
  },
];

export const buildDrivers = (): SharedDriver[] => [
  {
    id: 'drv_layla',
    name: 'Layla Al-Harbi',
    contact: 'layla@•••••.com',
    status: 'active',
    permissions: ['drive', 'remote_lock', 'climate', 'location'],
    duration: {
      kind: 'date_range',
      startsAt: isoIn(-60 * 60 * 24 * 12),
      endsAt: isoIn(60 * 60 * 24 * 18),
    },
    invitedAt: isoIn(-60 * 60 * 24 * 13),
    acceptedAt: isoIn(-60 * 60 * 24 * 12),
    keyId: 'key_shared_layla',
    avatarInitials: 'LA',
  },
  {
    id: 'drv_omar',
    name: 'Omar Nasser',
    contact: '+966 5• ••• ••18',
    status: 'invited',
    permissions: ['drive', 'remote_lock'],
    duration: { kind: 'one_time', expiresAt: isoIn(60 * 60 * 48) },
    invitedAt: isoIn(-60 * 60 * 5),
    acceptedAt: null,
    keyId: null,
    avatarInitials: 'ON',
  },
  {
    id: 'drv_valet',
    name: 'Four Seasons Valet',
    contact: 'Valet stand — Kingdom Centre',
    status: 'revoked',
    permissions: ['drive'],
    duration: { kind: 'valet', expiresAt: isoIn(-60 * 60 * 20) },
    invitedAt: isoIn(-60 * 60 * 26),
    acceptedAt: isoIn(-60 * 60 * 25),
    keyId: null,
    avatarInitials: 'FS',
  },
];

export const buildAuditEvents = (): AccessAuditEvent[] => [
  {
    id: 'aud_1',
    type: 'access_revoked',
    subjectName: 'Four Seasons Valet',
    actorName: DEMO_USER.fullName,
    detail: 'Valet access ended automatically after the 4-hour window.',
    occurredAt: isoIn(-60 * 60 * 20),
  },
  {
    id: 'aud_2',
    type: 'key_provisioned',
    subjectName: 'Layla Al-Harbi',
    actorName: 'Key service',
    detail: 'Digital Key provisioned to Pixel 9 Pro with BLE and NFC.',
    occurredAt: isoIn(-60 * 60 * 24 * 12),
  },
  {
    id: 'aud_3',
    type: 'invite_accepted',
    subjectName: 'Layla Al-Harbi',
    actorName: 'Layla Al-Harbi',
    detail: 'Invitation accepted and identity verified.',
    occurredAt: isoIn(-60 * 60 * 24 * 12 - 600),
  },
  {
    id: 'aud_4',
    type: 'driver_invited',
    subjectName: 'Layla Al-Harbi',
    actorName: DEMO_USER.fullName,
    detail: 'Invited with drive, lock, climate and location permissions.',
    occurredAt: isoIn(-60 * 60 * 24 * 13),
  },
];

export const buildNotifications = (): AppNotification[] => [
  {
    id: 'ntf_1',
    category: 'health',
    title: 'Rear left tyre pressure low',
    body: '2.26 bar measured against a 2.50 bar target. Inflate before your next long journey.',
    createdAt: isoIn(-60 * 60 * 6),
    read: false,
    severity: 'warning',
  },
  {
    id: 'ntf_2',
    category: 'charging',
    title: 'Charging complete',
    body: 'Model Y reached its 80% charge limit at Home — Al Nakheel. 312 km added.',
    createdAt: isoIn(-60 * 60 * 9),
    read: false,
    severity: 'success',
  },
  {
    id: 'ntf_3',
    category: 'software',
    title: 'Software 4.9.0 is available',
    body: 'Faster cabin cool-down and a refined charging curve. Takes about 42 minutes to install.',
    createdAt: isoIn(-60 * 60 * 30),
    read: true,
    severity: 'info',
  },
  {
    id: 'ntf_4',
    category: 'digital_key',
    title: 'Digital Key shared',
    body: 'Layla Al-Harbi accepted your key invitation. Access ends in 18 days.',
    createdAt: isoIn(-60 * 60 * 24 * 12),
    read: true,
    severity: 'info',
  },
  {
    id: 'ntf_5',
    category: 'security',
    title: 'Vehicle left unlocked',
    body: 'Model Y was unlocked for 12 minutes at Kingdom Centre. It has since been locked.',
    createdAt: isoIn(-60 * 60 * 24 * 2),
    read: true,
    severity: 'warning',
  },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  charging: true,
  security: true,
  climate: true,
  digital_key: true,
  software: true,
  health: true,
  commands: true,
  geofence: false,
  service: true,
};

export const TRUSTED_DEVICES: TrustedDevice[] = [
  {
    id: 'dev_current',
    label: 'iPhone 16 Pro',
    platform: 'ios',
    lastActiveAt: nowIso(),
    isCurrentDevice: true,
    attestationVerified: true,
  },
  {
    id: 'dev_ipad',
    label: 'iPad Pro 11"',
    platform: 'ios',
    lastActiveAt: isoIn(-60 * 60 * 24 * 4),
    isCurrentDevice: false,
    attestationVerified: true,
  },
  {
    id: 'dev_web',
    label: 'Chrome — macOS',
    platform: 'web',
    lastActiveAt: isoIn(-60 * 60 * 24 * 11),
    isCurrentDevice: false,
    attestationVerified: false,
  },
];

export const SECURITY_ACTIVITY: SecurityActivity[] = [
  {
    id: 'sec_1',
    title: 'Remote unlock authorised',
    detail: 'Face ID confirmed on iPhone 16 Pro. Command corr_9fj20dk3 completed.',
    occurredAt: isoIn(-60 * 45),
    severity: 'info',
  },
  {
    id: 'sec_2',
    title: 'New device signed in',
    detail: 'Chrome on macOS. Device attestation was not available for this browser session.',
    occurredAt: isoIn(-60 * 60 * 24 * 11),
    severity: 'warning',
  },
  {
    id: 'sec_3',
    title: 'Digital Key revoked',
    detail: 'Valet key for Four Seasons was revoked and the vehicle was notified.',
    occurredAt: isoIn(-60 * 60 * 20),
    severity: 'info',
  },
];

export const ACTIVE_SESSIONS: ActiveSession[] = [
  {
    id: 'ses_1',
    deviceLabel: 'iPhone 16 Pro',
    approxLocation: 'Riyadh, SA',
    startedAt: isoIn(-60 * 60 * 3),
    isCurrent: true,
  },
  {
    id: 'ses_2',
    deviceLabel: 'iPad Pro 11"',
    approxLocation: 'Riyadh, SA',
    startedAt: isoIn(-60 * 60 * 24 * 4),
    isCurrent: false,
  },
];

/**
 * Completed charging sessions.
 *
 * `durationMinutes` is the real elapsed time of the session, so the history
 * screen can show both ends of the window and the duration without inventing
 * any of them. Cost is in SAR, at Saudi residential and public tariffs.
 */
export const CHARGING_SESSIONS = [
  {
    id: 'chg_1',
    locationLabel: 'Home — Al Nakheel',
    startedAt: isoIn(-60 * 60 * 20),
    durationMinutes: 797,
    energyKwh: 41.2,
    addedRangeKm: 221,
    peakKw: 10.8,
    costSar: 12.4,
    type: 'ac' as const,
  },
  {
    id: 'chg_2',
    locationLabel: 'Riyadh Park',
    startedAt: isoIn(-60 * 60 * 24 * 4),
    durationMinutes: 54,
    energyKwh: 52.9,
    addedRangeKm: 284,
    peakKw: 213,
    costSar: 63.5,
    type: 'dc' as const,
  },
  {
    id: 'chg_3',
    locationLabel: 'Home — Al Nakheel',
    startedAt: isoIn(-60 * 60 * 24 * 7),
    durationMinutes: 219,
    energyKwh: 33.1,
    addedRangeKm: 178,
    peakKw: 10.9,
    costSar: 9.9,
    type: 'ac' as const,
  },
  {
    id: 'chg_4',
    locationLabel: 'King Abdullah Rd',
    startedAt: isoIn(-60 * 60 * 24 * 11),
    durationMinutes: 38,
    energyKwh: 44.6,
    addedRangeKm: 240,
    peakKw: 188,
    costSar: 53.5,
    type: 'dc' as const,
  },
  {
    id: 'chg_5',
    locationLabel: 'Home — Al Nakheel',
    startedAt: isoIn(-60 * 60 * 24 * 14),
    durationMinutes: 462,
    energyKwh: 28.4,
    addedRangeKm: 153,
    peakKw: 7.2,
    costSar: 8.5,
    type: 'ac' as const,
  },
];

export type ChargingSession = (typeof CHARGING_SESSIONS)[number];
