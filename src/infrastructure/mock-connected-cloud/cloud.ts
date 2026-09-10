import type {
  AccessAuditEvent,
  AccessDuration,
  AppNotification,
  ChargeState,
  ClimateState,
  ConnectivityMode,
  DigitalKey,
  DigitalKeyCarrier,
  DriverPermission,
  OtaUpdate,
  SharedDriver,
  Vehicle,
  VehicleCapabilities,
  VehicleCommand,
  VehicleState,
} from '@/domain/entities';
import { PROVISIONING_STEPS } from '@/domain/entities';
import type {
  CommandAccepted,
  CommandRequest,
  DigitalKeyRepository,
  DriverAccessRepository,
  NotificationRepository,
  OtaRepository,
  TelemetryRepository,
  VehicleCommandRepository,
  VehicleRepository,
} from '@/domain/repositories';
import { transitionKey } from '@/domain/use-cases';
import { CommandSimulator } from '../command-simulator';
import { applyCommandEffect, driftTelemetry } from '../telemetry-simulator';
import { entityId } from '@/utils/id';
import { logger } from '@/utils/logger';
import { isoIn, nowIso, sleep } from '@/utils/time';
import {
  buildAuditEvents,
  buildDigitalKeys,
  buildDrivers,
  buildInitialState,
  buildNotifications,
  buildOtaUpdate,
  DEMO_USER,
  PRIMARY_VEHICLE_ID,
  VEHICLES,
} from './fixtures';

const TELEMETRY_TICK_SECONDS = 3;

/**
 * The mock connected cloud.
 *
 * This single object stands in for the whole server side of the architecture.
 * It owns authoritative vehicle state, runs the command simulator, drifts
 * telemetry on a timer, and exposes exactly the repository interfaces the app
 * depends on. Replacing it with a real OEM client means implementing those same
 * interfaces — no screen, store or use-case changes.
 *
 * Endpoint equivalence is documented on each method.
 */
export class MockConnectedCloud
  implements
    VehicleRepository,
    VehicleCommandRepository,
    TelemetryRepository,
    DigitalKeyRepository,
    DriverAccessRepository,
    NotificationRepository,
    OtaRepository
{
  private states = new Map<string, VehicleState>();
  private keys = new Map<string, DigitalKey[]>();
  private drivers: SharedDriver[] = buildDrivers();
  private audit: AccessAuditEvent[] = buildAuditEvents();
  private notifications: AppNotification[] = buildNotifications();
  private otaUpdates = new Map<string, OtaUpdate>();
  private stateListeners = new Map<string, Set<(s: VehicleState) => void>>();
  private notificationListeners = new Set<(n: AppNotification[]) => void>();

  /** Overridden by the developer simulation panel during a demo. */
  private connectivityOverride: ConnectivityMode = 'online';
  private activeVehicleId = PRIMARY_VEHICLE_ID;
  private waking = false;
  private ticker: ReturnType<typeof setInterval> | null = null;

  readonly simulator: CommandSimulator;

  constructor() {
    VEHICLES.forEach((v) => {
      this.states.set(v.id, buildInitialState(v.id));
      this.keys.set(v.id, v.id === PRIMARY_VEHICLE_ID ? buildDigitalKeys(v.id) : []);
      this.otaUpdates.set(v.id, buildOtaUpdate(v.id));
    });

    this.simulator = new CommandSimulator({
      getConnectivity: () => this.connectivityOverride,
      getState: () => this.stateOf(this.activeVehicleId),
      applyEffect: (command) => this.applyEffect(command),
      onWakeStart: () => {
        this.waking = true;
        this.publish(this.activeVehicleId);
      },
      onWakeEnd: () => {
        this.waking = false;
        this.publish(this.activeVehicleId);
      },
    });
    this.simulator.capabilitiesProvider = () => this.vehicleOf(this.activeVehicleId).capabilities;
    this.simulator.observeAll((command) => this.onCommandChange(command));
    this.startTelemetry();
  }

  // ---------------------------------------------------------------- helpers

  private vehicleOf(vehicleId: string): Vehicle {
    return VEHICLES.find((v) => v.id === vehicleId) ?? VEHICLES[0]!;
  }

  private stateOf(vehicleId: string): VehicleState {
    return this.states.get(vehicleId) ?? buildInitialState(vehicleId);
  }

  /**
   * Decorates the stored state for consumption.
   * When the vehicle is unreachable the snapshot is explicitly marked cached and
   * its location downgraded to "last known" — the UI reads these flags rather
   * than guessing whether data is live.
   */
  private decorate(vehicleId: string): VehicleState {
    const raw = this.stateOf(vehicleId);
    const connectivity = this.connectivityOverride;
    const stale = connectivity === 'offline' || connectivity === 'asleep';
    return {
      ...raw,
      connectivity: this.waking ? 'asleep' : connectivity,
      isCached: stale,
      location: { ...raw.location, isLive: !stale },
    };
  }

  private publish(vehicleId: string) {
    const snapshot = this.decorate(vehicleId);
    this.stateListeners.get(vehicleId)?.forEach((l) => l(snapshot));
  }

  private applyEffect(command: VehicleCommand) {
    const vehicle = this.vehicleOf(command.vehicleId);
    const updated = applyCommandEffect(
      this.stateOf(command.vehicleId),
      command,
      vehicle.maxRangeKm,
    );
    this.states.set(command.vehicleId, updated);
    this.publish(command.vehicleId);
  }

  private startTelemetry() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      // An offline vehicle sends nothing — its snapshot must visibly go stale.
      if (this.connectivityOverride === 'offline') return;
      this.states.forEach((state, vehicleId) => {
        const vehicle = this.vehicleOf(vehicleId);
        const next = driftTelemetry(
          state,
          vehicle.maxRangeKm,
          vehicle.batteryCapacityKwh,
          TELEMETRY_TICK_SECONDS,
        );
        this.states.set(vehicleId, next);
        this.publish(vehicleId);
      });
    }, TELEMETRY_TICK_SECONDS * 1000);
  }

  stopTelemetry() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Turns terminal command outcomes into notifications, as a push service would. */
  private onCommandChange(command: VehicleCommand) {
    if (command.status === 'confirmed' && command.type === 'start_charging') {
      this.emitNotification({
        category: 'charging',
        title: 'Charging started',
        body: `${this.vehicleOf(command.vehicleId).name} is charging at ${this.stateOf(command.vehicleId).charge.powerKw} kW.`,
        severity: 'success',
        correlationId: command.correlationId,
      });
    }
    if (['failed', 'expired', 'rejected'].includes(command.status)) {
      this.emitNotification({
        category: 'commands',
        title: 'Remote command failed',
        body: `${command.type.replace(/_/g, ' ')} — ${command.failureReason ?? 'unknown reason'}.`,
        severity: 'warning',
        correlationId: command.correlationId,
      });
    }
  }

  private emitNotification(input: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) {
    const notification: AppNotification = {
      ...input,
      id: entityId('ntf'),
      createdAt: nowIso(),
      read: false,
    };
    this.notifications = [notification, ...this.notifications];
    this.notificationListeners.forEach((l) => l(this.notifications));
  }

  // ------------------------------------------------- developer simulation

  setConnectivity(mode: ConnectivityMode) {
    this.connectivityOverride = mode;
    logger.info('Simulated connectivity changed', { mode });
    this.states.forEach((_, id) => this.publish(id));
  }

  getConnectivity(): ConnectivityMode {
    return this.waking ? 'asleep' : this.connectivityOverride;
  }

  /** Synchronous capability read, used by the client-side pre-flight check. */
  getCapabilitiesForVehicle(vehicleId: string): VehicleCapabilities {
    return this.vehicleOf(vehicleId).capabilities;
  }

  setActiveVehicle(vehicleId: string) {
    this.activeVehicleId = vehicleId;
  }

  /** Directly forces charge state, used by the developer panel and demo script. */
  setChargingScenario(vehicleId: string, status: ChargeState['status']) {
    const state = this.stateOf(vehicleId);
    const vehicle = this.vehicleOf(vehicleId);
    const charge: ChargeState = { ...state.charge, status };
    switch (status) {
      case 'not_plugged_in':
        charge.powerKw = 0;
        charge.portOpen = false;
        charge.minutesRemaining = null;
        charge.faultReason = undefined;
        break;
      case 'connected_not_charging':
        charge.powerKw = 0;
        charge.portOpen = true;
        charge.minutesRemaining = null;
        charge.faultReason = undefined;
        break;
      case 'charging':
        charge.portOpen = true;
        charge.powerKw = charge.locationLabel.startsWith('Home')
          ? 10.8
          : Math.min(148, vehicle.maxDcChargeKw);
        charge.minutesRemaining = 165;
        charge.faultReason = undefined;
        break;
      case 'complete':
        charge.powerKw = 0;
        charge.portOpen = true;
        charge.batteryPercent = charge.chargeLimitPercent;
        charge.minutesRemaining = null;
        break;
      case 'fault':
        charge.powerKw = 0;
        charge.portOpen = true;
        charge.faultReason = 'The charger reported a ground fault and stopped the session.';
        break;
      case 'scheduled':
        charge.powerKw = 0;
        charge.portOpen = true;
        charge.scheduleEnabled = true;
        charge.minutesRemaining = null;
        break;
    }
    this.states.set(vehicleId, { ...state, charge, lastUpdatedAt: nowIso() });
    this.publish(vehicleId);
  }

  setMoving(vehicleId: string, moving: boolean) {
    const state = this.stateOf(vehicleId);
    this.states.set(vehicleId, {
      ...state,
      isMoving: moving,
      gear: moving ? 'D' : 'P',
      speedKph: moving ? 68 : 0,
      lastUpdatedAt: nowIso(),
    });
    this.publish(vehicleId);
  }

  reset() {
    VEHICLES.forEach((v) => this.states.set(v.id, buildInitialState(v.id)));
    this.keys.set(PRIMARY_VEHICLE_ID, buildDigitalKeys(PRIMARY_VEHICLE_ID));
    this.drivers = buildDrivers();
    this.audit = buildAuditEvents();
    this.notifications = buildNotifications();
    this.connectivityOverride = 'online';
    this.simulator.reset();
    this.states.forEach((_, id) => this.publish(id));
  }

  // ------------------------------------------------- VehicleRepository

  /** GET /vehicles */
  async listVehicles(): Promise<Vehicle[]> {
    await sleep(120);
    return VEHICLES;
  }

  /** GET /vehicles/:vehicleId */
  async getVehicle(vehicleId: string): Promise<Vehicle> {
    await sleep(90);
    return this.vehicleOf(vehicleId);
  }

  /** GET /vehicles/:vehicleId/state */
  async getVehicleState(vehicleId: string): Promise<VehicleState> {
    await sleep(140);
    return this.decorate(vehicleId);
  }

  /** GET /vehicles/:vehicleId/capabilities */
  async getCapabilities(vehicleId: string): Promise<VehicleCapabilities> {
    await sleep(80);
    return this.vehicleOf(vehicleId).capabilities;
  }

  /** Simulated ownership validation against the OEM vehicle registry. */
  async pairVehicle(vin: string): Promise<{ vehicleId: string } | { error: string }> {
    await sleep(1400);
    const normalized = vin.trim().toUpperCase();
    if (normalized.length !== 17) {
      return { error: 'A VIN must be exactly 17 characters.' };
    }
    if (!/^[A-HJ-NPR-Z0-9]+$/.test(normalized)) {
      return { error: 'A VIN cannot contain the letters I, O or Q.' };
    }
    // The registry check is server-side in production: it verifies the signed-in
    // account actually owns this VIN before any capability is granted.
    return { vehicleId: PRIMARY_VEHICLE_ID };
  }

  // ------------------------------------------- VehicleCommandRepository

  /** POST /vehicles/:vehicleId/commands  →  202 Accepted */
  async submitCommand(vehicleId: string, request: CommandRequest): Promise<CommandAccepted> {
    this.activeVehicleId = vehicleId;
    await sleep(60);
    const command = this.simulator.submit(vehicleId, request);
    return {
      commandId: command.id,
      correlationId: command.correlationId,
      status: command.status,
      vehicleId,
    };
  }

  /** GET /vehicles/:vehicleId/commands/:commandId */
  async getCommand(_vehicleId: string, commandId: string): Promise<VehicleCommand> {
    const command = this.simulator.getCommand(commandId);
    if (!command) throw new Error(`Unknown command ${commandId}`);
    return command;
  }

  observeCommand(commandId: string, onChange: (command: VehicleCommand) => void): () => void {
    return this.simulator.observe(commandId, onChange);
  }

  async listHistory(vehicleId: string): Promise<VehicleCommand[]> {
    return this.simulator.getHistory().filter((c) => c.vehicleId === vehicleId);
  }

  // ------------------------------------------------ TelemetryRepository

  /** GET /vehicles/:vehicleId/telemetry */
  async getTelemetry(vehicleId: string): Promise<VehicleState> {
    await sleep(110);
    return this.decorate(vehicleId);
  }

  /** GET /vehicles/:vehicleId/charging */
  async getCharging(vehicleId: string): Promise<ChargeState> {
    await sleep(90);
    return this.decorate(vehicleId).charge;
  }

  async getClimate(vehicleId: string): Promise<ClimateState> {
    await sleep(90);
    return this.decorate(vehicleId).climate;
  }

  observeState(vehicleId: string, onChange: (state: VehicleState) => void): () => void {
    const set = this.stateListeners.get(vehicleId) ?? new Set<(s: VehicleState) => void>();
    set.add(onChange);
    this.stateListeners.set(vehicleId, set);
    onChange(this.decorate(vehicleId));
    return () => set.delete(onChange);
  }

  /**
   * Local-only climate preference write.
   * Toggles like seat heating are stored preferences that ride along with the
   * next climate command, so they do not each need their own round trip.
   */
  patchClimate(vehicleId: string, patch: Partial<ClimateState>) {
    const state = this.stateOf(vehicleId);
    this.states.set(vehicleId, {
      ...state,
      climate: { ...state.climate, ...patch },
      lastUpdatedAt: nowIso(),
    });
    this.publish(vehicleId);
  }

  patchCharge(vehicleId: string, patch: Partial<ChargeState>) {
    const state = this.stateOf(vehicleId);
    this.states.set(vehicleId, {
      ...state,
      charge: { ...state.charge, ...patch },
      lastUpdatedAt: nowIso(),
    });
    this.publish(vehicleId);
  }

  // ----------------------------------------------- DigitalKeyRepository

  /** GET /vehicles/:vehicleId/digital-keys */
  async listKeys(vehicleId: string): Promise<DigitalKey[]> {
    await sleep(120);
    return this.keys.get(vehicleId) ?? [];
  }

  /**
   * POST /vehicles/:vehicleId/digital-keys
   *
   * In production this call does NOT create key material. It asks the OEM key
   * server to start a CCC Digital Key provisioning ceremony; the actual
   * credential is generated inside the device Secure Element and attested back.
   */
  async provisionKey(
    vehicleId: string,
    input: { carrier: DigitalKeyCarrier; deviceLabel: string; holderName: string },
    onStep?: (stepId: string) => void,
  ): Promise<DigitalKey> {
    for (const step of PROVISIONING_STEPS) {
      onStep?.(step.id);
      await sleep(step.id === 'pairing' ? 1500 : 800);
    }
    const vehicle = this.vehicleOf(vehicleId);
    const tech: DigitalKey['supportedTech'] =
      vehicle.capabilities.digitalKey === 'uwb_ble_nfc'
        ? ['ble', 'uwb', 'nfc']
        : vehicle.capabilities.digitalKey === 'ble_nfc'
          ? ['ble', 'nfc']
          : ['nfc'];
    const key: DigitalKey = {
      id: entityId('key'),
      vehicleId,
      carrier: input.carrier,
      state: 'active',
      deviceLabel: input.deviceLabel,
      holderName: input.holderName,
      holderId: DEMO_USER.id,
      supportedTech: tech,
      createdAt: nowIso(),
      lastUsedAt: null,
      expiresAt: input.carrier === 'shared_phone' ? isoIn(60 * 60 * 24 * 14) : null,
      // A public reference only. The credential never leaves the Secure Element.
      credentialRef: `ck_ref_${entityId('x')}`,
      isOwnerKey: input.carrier !== 'shared_phone',
    };
    this.keys.set(vehicleId, [...(this.keys.get(vehicleId) ?? []), key]);
    this.audit = [
      {
        id: entityId('aud'),
        type: 'key_provisioned',
        subjectName: input.holderName,
        actorName: 'Key service',
        detail: `Digital Key provisioned to ${input.deviceLabel}.`,
        occurredAt: nowIso(),
      },
      ...this.audit,
    ];
    this.emitNotification({
      category: 'digital_key',
      title: 'Digital Key activated',
      body: `${input.deviceLabel} can now unlock and drive ${vehicle.name}.`,
      severity: 'success',
    });
    return key;
  }

  /** DELETE /vehicles/:vehicleId/digital-keys/:keyId */
  async revokeKey(vehicleId: string, keyId: string): Promise<void> {
    await sleep(700);
    this.mutateKey(vehicleId, keyId, 'revoked');
    this.audit = [
      {
        id: entityId('aud'),
        type: 'access_revoked',
        subjectName: this.findKey(vehicleId, keyId)?.holderName ?? 'Unknown',
        actorName: DEMO_USER.fullName,
        detail: 'Key revoked. The vehicle was notified to distrust this credential.',
        occurredAt: nowIso(),
      },
      ...this.audit,
    ];
  }

  async suspendKey(vehicleId: string, keyId: string): Promise<DigitalKey> {
    await sleep(500);
    return this.mutateKey(vehicleId, keyId, 'suspended');
  }

  async resumeKey(vehicleId: string, keyId: string): Promise<DigitalKey> {
    await sleep(500);
    return this.mutateKey(vehicleId, keyId, 'active');
  }

  private findKey(vehicleId: string, keyId: string): DigitalKey | undefined {
    return (this.keys.get(vehicleId) ?? []).find((k) => k.id === keyId);
  }

  private mutateKey(vehicleId: string, keyId: string, to: DigitalKey['state']): DigitalKey {
    const list = this.keys.get(vehicleId) ?? [];
    const current = list.find((k) => k.id === keyId);
    if (!current) throw new Error('Key not found');
    const result = transitionKey(current, to);
    if (!result.ok) throw new Error(result.reason);
    this.keys.set(
      vehicleId,
      list.map((k) => (k.id === keyId ? result.key : k)),
    );
    return result.key;
  }

  // --------------------------------------------- DriverAccessRepository

  async listDrivers(): Promise<SharedDriver[]> {
    await sleep(120);
    return this.drivers;
  }

  async inviteDriver(
    _vehicleId: string,
    input: {
      name: string;
      contact: string;
      permissions: DriverPermission[];
      duration: AccessDuration;
    },
  ): Promise<SharedDriver> {
    await sleep(900);
    const driver: SharedDriver = {
      id: entityId('drv'),
      name: input.name,
      contact: input.contact,
      status: 'invited',
      permissions: input.permissions,
      duration: input.duration,
      invitedAt: nowIso(),
      acceptedAt: null,
      keyId: null,
      avatarInitials: input.name
        .split(' ')
        .map((p) => p[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    };
    this.drivers = [driver, ...this.drivers];
    this.audit = [
      {
        id: entityId('aud'),
        type: 'driver_invited',
        subjectName: driver.name,
        actorName: DEMO_USER.fullName,
        detail: `Invited with ${input.permissions.length} permission${input.permissions.length === 1 ? '' : 's'}.`,
        occurredAt: nowIso(),
      },
      ...this.audit,
    ];
    this.emitNotification({
      category: 'digital_key',
      title: 'Driver invited',
      body: `${driver.name} was invited to drive ${this.vehicleOf(this.activeVehicleId).name}.`,
      severity: 'info',
    });
    return driver;
  }

  async updatePermissions(
    _vehicleId: string,
    driverId: string,
    permissions: DriverPermission[],
  ): Promise<SharedDriver> {
    await sleep(450);
    const driver = this.drivers.find((d) => d.id === driverId);
    if (!driver) throw new Error('Driver not found');
    const updated = { ...driver, permissions };
    this.drivers = this.drivers.map((d) => (d.id === driverId ? updated : d));
    this.audit = [
      {
        id: entityId('aud'),
        type: 'permission_changed',
        subjectName: driver.name,
        actorName: DEMO_USER.fullName,
        detail: `Permissions updated to: ${permissions.join(', ') || 'none'}.`,
        occurredAt: nowIso(),
      },
      ...this.audit,
    ];
    return updated;
  }

  async suspendDriver(_vehicleId: string, driverId: string): Promise<SharedDriver> {
    await sleep(450);
    return this.setDriverStatus(driverId, 'suspended', 'key_suspended', 'Key suspended by owner.');
  }

  async revokeDriver(_vehicleId: string, driverId: string): Promise<SharedDriver> {
    await sleep(450);
    return this.setDriverStatus(
      driverId,
      'revoked',
      'access_revoked',
      'Access revoked. Any provisioned key was invalidated at the vehicle.',
    );
  }

  private setDriverStatus(
    driverId: string,
    status: SharedDriver['status'],
    auditType: AccessAuditEvent['type'],
    detail: string,
  ): SharedDriver {
    const driver = this.drivers.find((d) => d.id === driverId);
    if (!driver) throw new Error('Driver not found');
    const updated = { ...driver, status };
    this.drivers = this.drivers.map((d) => (d.id === driverId ? updated : d));
    // Revoking a driver must also kill their key — access and credential are
    // two halves of the same decision.
    if (status === 'revoked' && driver.keyId) {
      const list = this.keys.get(this.activeVehicleId) ?? [];
      this.keys.set(
        this.activeVehicleId,
        list.map((k) => (k.id === driver.keyId ? { ...k, state: 'revoked' as const } : k)),
      );
    }
    this.audit = [
      {
        id: entityId('aud'),
        type: auditType,
        subjectName: driver.name,
        actorName: DEMO_USER.fullName,
        detail,
        occurredAt: nowIso(),
      },
      ...this.audit,
    ];
    return updated;
  }

  async listAuditEvents(): Promise<AccessAuditEvent[]> {
    await sleep(120);
    return this.audit;
  }

  // --------------------------------------------- NotificationRepository

  async list(): Promise<AppNotification[]> {
    await sleep(100);
    return this.notifications;
  }

  async markRead(id: string): Promise<void> {
    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.notificationListeners.forEach((l) => l(this.notifications));
  }

  async markAllRead(): Promise<void> {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.notificationListeners.forEach((l) => l(this.notifications));
  }

  async push(notification: AppNotification): Promise<void> {
    this.notifications = [notification, ...this.notifications];
    this.notificationListeners.forEach((l) => l(this.notifications));
  }

  observeNotifications(onChange: (n: AppNotification[]) => void): () => void {
    this.notificationListeners.add(onChange);
    onChange(this.notifications);
    return () => this.notificationListeners.delete(onChange);
  }

  // ------------------------------------------------------ OtaRepository

  async getUpdate(vehicleId: string): Promise<OtaUpdate> {
    await sleep(120);
    return this.otaUpdates.get(vehicleId) ?? buildOtaUpdate(vehicleId);
  }

  async scheduleInstall(vehicleId: string, whenIso: string): Promise<OtaUpdate> {
    await sleep(600);
    const update = {
      ...(await this.getUpdate(vehicleId)),
      status: 'scheduled' as const,
      scheduledFor: whenIso,
    };
    this.otaUpdates.set(vehicleId, update);
    return update;
  }

  /**
   * Simulated install. Real OTA is orchestrated entirely by the vehicle: the app
   * requests and observes, and the vehicle can abandon the install at any point
   * if safety conditions change.
   */
  async startInstall(
    vehicleId: string,
    onProgress: (update: OtaUpdate) => void,
  ): Promise<OtaUpdate> {
    let update = await this.getUpdate(vehicleId);
    const phases: { status: OtaUpdate['status']; to: number; stepMs: number }[] = [
      { status: 'downloading', to: 45, stepMs: 180 },
      { status: 'verifying', to: 60, stepMs: 260 },
      { status: 'installing', to: 100, stepMs: 220 },
    ];
    for (const phase of phases) {
      update = { ...update, status: phase.status };
      while (update.progressPercent < phase.to) {
        await sleep(phase.stepMs);
        update = {
          ...update,
          progressPercent: Math.min(
            phase.to,
            update.progressPercent + (phase.status === 'verifying' ? 3 : 5),
          ),
        };
        this.otaUpdates.set(vehicleId, update);
        onProgress(update);
      }
    }
    const vehicle = this.vehicleOf(vehicleId);
    update = {
      ...update,
      status: 'completed',
      progressPercent: 100,
      currentVersion: update.version,
    };
    this.otaUpdates.set(vehicleId, update);
    onProgress(update);
    const state = this.stateOf(vehicleId);
    this.states.set(vehicleId, {
      ...state,
      health: { ...state.health, softwareVersion: update.version },
    });
    this.publish(vehicleId);
    this.emitNotification({
      category: 'software',
      title: `${vehicle.name} updated to ${update.version}`,
      body: 'Installation completed successfully. Your vehicle is ready to drive.',
      severity: 'success',
    });
    return update;
  }
}

/** Single shared instance — the app's stand-in connected cloud. */
export const connectedCloud = new MockConnectedCloud();
