/**
 * The simulated vehicle.
 *
 * Pure TypeScript with no I/O and no browser APIs, so the same module runs in
 * the simulator console, in the Node entry point, and in tests. It owns the
 * simulated vehicle's behaviour: the backend validates and persists what this
 * produces, but never invents state of its own.
 *
 * Everything here is deterministic given a starting state, a tick duration and
 * a command sequence — which is what makes the behaviour testable rather than
 * merely plausible-looking.
 */
import type { CommandType } from '../vehicle/commands';
import type { FailureCode } from '../vehicle/commands';
import type { ReportedVehicleState, TransientEvent } from '../vehicle/state';

// --- Geometry ---------------------------------------------------------------

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export const distanceMetres = (a: LatLng, b: LatLng): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** True bearing a→b in degrees, 0 = north. Heading is derived, never invented. */
export const bearingDegrees = (a: LatLng, b: LatLng): number => {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const interpolate = (a: LatLng, b: LatLng, t: number): LatLng => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

// --- The route --------------------------------------------------------------

/**
 * A synthetic loop through Riyadh.
 *
 * These are plausible coordinates on the city's road grid, not a traced route
 * from a mapping provider: the point is a believable path for a simulated car,
 * and inventing one avoids attributing a real route to a vehicle that does not
 * exist.
 */
export const RIYADH_CENTRE: LatLng = { latitude: 24.7136, longitude: 46.6753 };

const ROUTE_WAYPOINTS: LatLng[] = [
  { latitude: 24.7136, longitude: 46.6753 }, // King Fahd Road
  { latitude: 24.7245, longitude: 46.6712 },
  { latitude: 24.7361, longitude: 46.6698 }, // north along the ring
  { latitude: 24.7442, longitude: 46.6805 },
  { latitude: 24.7398, longitude: 46.6944 }, // east
  { latitude: 24.7261, longitude: 46.7021 },
  { latitude: 24.7108, longitude: 46.6987 }, // south
  { latitude: 24.6996, longitude: 46.6871 },
  { latitude: 24.7021, longitude: 46.6742 }, // west, closing the loop
  { latitude: 24.7136, longitude: 46.6753 },
];

export type RoutePoint = LatLng & { addressLabel: string };

const STREET_NAMES = [
  'King Fahd Road',
  'Olaya Street',
  'King Abdullah Road',
  'Prince Turki Street',
  'Takhassusi Street',
  'Northern Ring Road',
  'King Abdulaziz Road',
  'Al Urubah Road',
];

/**
 * Densifies the waypoints into a path with roughly one point every 60 m, so a
 * vehicle at city speed passes several points per tick and the heading changes
 * smoothly instead of snapping at corners.
 */
export const buildRoute = (waypoints: LatLng[] = ROUTE_WAYPOINTS): RoutePoint[] => {
  const points: RoutePoint[] = [];

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const segments = Math.max(1, Math.round(distanceMetres(from, to) / 60));
    const label = STREET_NAMES[i % STREET_NAMES.length]!;

    for (let step = 0; step < segments; step += 1) {
      points.push({ ...interpolate(from, to, step / segments), addressLabel: label });
    }
  }

  points.push({ ...waypoints[waypoints.length - 1]!, addressLabel: STREET_NAMES[0]! });
  return points;
};

// --- Configuration ----------------------------------------------------------

export type SimulatorConfig = {
  /** Ambient temperature the cabin drifts toward when climate is off. */
  exteriorTempC: number;
  /** Artificial delay before a claimed command is executed, in ms. */
  commandDelayMs: number;
  /** When true, every claimed command is refused with `precondition_failed`. */
  rejectCommands: boolean;
  /** When true, the vehicle stops reporting: the app must show stale data. */
  connectivityLost: boolean;
  /** Cruising speed on the simulated route. */
  targetSpeedKph: number;
};

export const DEFAULT_CONFIG: SimulatorConfig = {
  exteriorTempC: 41,
  commandDelayMs: 900,
  rejectCommands: false,
  connectivityLost: false,
  targetSpeedKph: 52,
};

export type CommandOutcome = {
  status: 'succeeded' | 'failed' | 'rejected';
  failureCode?: FailureCode;
  failureReason?: string;
  /** Set for flash/horn, so the app can present the event exactly once. */
  eventId?: string;
};

// --- The vehicle ------------------------------------------------------------

/**
 * How long a transient event stays in the reported state.
 *
 * Long enough for a client that was mid-reconnect to still see it, short enough
 * that a client reconnecting a minute later does not replay a flash that
 * already happened.
 */
const TRANSIENT_EVENT_TTL_MS = 15_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, places = 2) => Number(value.toFixed(places));

export class VehicleSimulation {
  private state: ReportedVehicleState;
  private config: SimulatorConfig;
  private route: RoutePoint[];
  private routeIndex = 0;
  private journeyRunning = false;
  private eventCounter = 0;
  /**
   * Battery charge at full precision.
   *
   * A single 2 s tick moves the pack by a few thousandths of a percent. The
   * reported value is rounded to one decimal, the way a vehicle reports it, so
   * the accumulator has to live outside the reported state — rounding on every
   * tick would quantise each increment to zero and the battery would never move.
   */
  private batteryExact: number;

  constructor(initial: ReportedVehicleState, config: Partial<SimulatorConfig> = {}) {
    this.state = structuredClone(initial);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.route = buildRoute();
    this.routeIndex = this.nearestRouteIndex(initial.location);
    this.batteryExact = this.state.charge.batteryPercent;
  }

  /**
   * Adopts a snapshot from the backend.
   *
   * Called on startup and after a reconnect: the backend's stored state wins
   * over anything this process was holding, because the backend is what every
   * client has already been shown.
   */
  hydrate(state: ReportedVehicleState): void {
    this.state = structuredClone(state);
    this.routeIndex = this.nearestRouteIndex(state.location);
    this.journeyRunning = state.isMoving;
    this.batteryExact = state.charge.batteryPercent;
  }

  snapshot(): ReportedVehicleState {
    return structuredClone(this.state);
  }

  getConfig(): SimulatorConfig {
    return { ...this.config };
  }

  configure(patch: Partial<SimulatorConfig>): void {
    this.config = { ...this.config, ...patch };
    if (patch.exteriorTempC !== undefined) {
      this.state.climate.exteriorTempC = patch.exteriorTempC;
    }
    // Connectivity is part of what the vehicle reports, so the last frame before
    // it goes quiet already says the link is gone.
    if (patch.connectivityLost !== undefined) {
      this.state.connectivity = patch.connectivityLost ? 'offline' : 'online';
    }
  }

  /** Directly sets the battery level, for demonstrating low-charge behaviour. */
  setBatteryPercent(percent: number): void {
    this.batteryExact = clamp(percent, 1, 100);
    this.publishBattery();
  }

  /** Rounds the accumulator into the reported state and derives range from it. */
  private publishBattery(): void {
    this.state.charge.batteryPercent = round(this.batteryExact, 1);
    this.state.charge.estimatedRangeKm = Math.round((this.batteryExact / 100) * 512);
  }

  isJourneyRunning(): boolean {
    return this.journeyRunning;
  }

  /**
   * Starts or pauses movement along the route.
   *
   * A journey requires the vehicle to be ready to drive. That is deliberately
   * the same precondition a real car has: authorising driving from the phone
   * does not move the car, and moving the car requires having authorised it.
   */
  setJourneyRunning(running: boolean): { ok: boolean; reason?: string } {
    if (running && !this.state.driveReady) {
      return {
        ok: false,
        reason: 'The vehicle is not ready to drive. Enable EV power from the app first.',
      };
    }
    this.journeyRunning = running;
    if (!running) {
      this.state.isMoving = false;
      this.state.speedKph = 0;
      this.state.gear = 'P';
    }
    return { ok: true };
  }

  /**
   * Advances the simulation by `deltaMs`.
   *
   * Movement, battery, cabin temperature and charging all derive from elapsed
   * time rather than from tick count, so a slow tick and a fast tick produce
   * the same physics.
   */
  tick(deltaMs: number, now = Date.now()): ReportedVehicleState {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return this.snapshot();

    this.advanceMovement(seconds, now);
    this.advanceClimate(seconds);
    this.advanceCharging(seconds);
    this.pruneTransientEvents(now);

    this.state.location.capturedAt = new Date(now).toISOString();
    this.state.location.isLive = !this.config.connectivityLost;

    return this.snapshot();
  }

  // --- Commands -------------------------------------------------------------

  /**
   * Executes a command against the simulated vehicle.
   *
   * This is where the physical distinctions the app depends on actually live:
   * unlocking does not open a door, authorising driving does not start moving,
   * and a flash produces an event id rather than a light that stays on.
   */
  execute(
    type: CommandType,
    payload: Record<string, unknown> = {},
    now = Date.now(),
  ): CommandOutcome {
    if (this.config.rejectCommands) {
      return {
        status: 'failed',
        failureCode: 'precondition_failed',
        failureReason: 'The simulated vehicle is configured to refuse commands.',
      };
    }

    if (this.config.connectivityLost) {
      return {
        status: 'failed',
        failureCode: 'vehicle_offline',
        failureReason: 'The simulated vehicle has no connectivity.',
      };
    }

    // A moving car does not open its doors or its boot.
    const movementSensitive: CommandType[] = [
      'unlock',
      'open_door',
      'open_trunk',
      'open_frunk',
      'open_charge_port',
    ];
    if (this.state.isMoving && movementSensitive.includes(type)) {
      return {
        status: 'failed',
        failureCode: 'vehicle_moving',
        failureReason: 'The vehicle is moving.',
      };
    }

    switch (type) {
      case 'lock':
        this.state.lock = 'locked';
        return { status: 'succeeded' };

      case 'unlock':
        // Unlocking releases the latches. It does not move a door: door
        // positions are only changed by open_door / close_door.
        this.state.lock = 'unlocked';
        return { status: 'succeeded' };

      case 'open_door':
      case 'close_door': {
        const door = payload.door as keyof ReportedVehicleState['doors'] | undefined;
        if (!door || !(door in this.state.doors)) {
          return {
            status: 'rejected',
            failureCode: 'precondition_failed',
            failureReason: 'No such door.',
          };
        }
        if (type === 'open_door' && this.state.lock === 'locked') {
          return {
            status: 'failed',
            failureCode: 'precondition_failed',
            failureReason: 'The vehicle is locked. Unlock it before opening a door.',
          };
        }
        this.state.doors[door] = type === 'open_door' ? 'open' : 'closed';
        return { status: 'succeeded' };
      }

      case 'open_trunk':
      case 'close_trunk':
        this.state.trunk = type === 'open_trunk' ? 'open' : 'closed';
        return { status: 'succeeded' };

      case 'open_frunk':
      case 'close_frunk':
        this.state.frunk = type === 'open_frunk' ? 'open' : 'closed';
        return { status: 'succeeded' };

      case 'open_charge_port':
      case 'close_charge_port':
        this.state.charge.portOpen = type === 'open_charge_port';
        return { status: 'succeeded' };

      case 'wake_vehicle':
        this.state.power = 'awake';
        return { status: 'succeeded' };

      case 'enable_driving': {
        if (this.state.charge.status === 'charging') {
          return {
            status: 'failed',
            failureCode: 'precondition_failed',
            failureReason: 'Stop charging before enabling drive power.',
          };
        }
        // Ready, and still parked. Moving is a separate act.
        this.state.power = 'awake';
        this.state.driveReady = true;
        this.state.driveAuthorization = {
          granted: true,
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 180_000).toISOString(),
        };
        this.state.lights.daytimeRunning = true;
        return { status: 'succeeded' };
      }

      case 'disable_driving':
        this.state.driveReady = false;
        this.state.driveAuthorization = { granted: false, grantedAt: null, expiresAt: null };
        this.state.lights.daytimeRunning = false;
        this.journeyRunning = false;
        this.state.isMoving = false;
        this.state.speedKph = 0;
        this.state.gear = 'P';
        this.state.power = 'asleep';
        return { status: 'succeeded' };

      case 'start_climate': {
        const target = payload.targetTempC as number | undefined;
        this.state.climate.active = true;
        if (typeof target === 'number') {
          this.state.climate.targetTempC = target;
          if (this.state.climate.zonesSynced) this.state.climate.passengerTargetTempC = target;
        }
        this.state.climate.fanLevel = Math.max(this.state.climate.fanLevel, 3);
        this.state.power = 'awake';
        return { status: 'succeeded' };
      }

      case 'stop_climate':
        this.state.climate.active = false;
        this.state.climate.fanLevel = 0;
        return { status: 'succeeded' };

      case 'set_temperature': {
        const target = payload.targetTempC as number;
        const zone = (payload.zone as string | undefined) ?? 'both';
        if (zone === 'driver' || zone === 'both') this.state.climate.targetTempC = target;
        if (zone === 'passenger' || zone === 'both') {
          this.state.climate.passengerTargetTempC = target;
        }
        this.state.climate.zonesSynced =
          this.state.climate.targetTempC === this.state.climate.passengerTargetTempC;
        return { status: 'succeeded' };
      }

      case 'start_charging': {
        if (this.state.charge.status === 'not_plugged_in') {
          return {
            status: 'failed',
            failureCode: 'precondition_failed',
            failureReason: 'The vehicle is not plugged in.',
          };
        }
        if (this.batteryExact >= this.state.charge.chargeLimitPercent) {
          return {
            status: 'failed',
            failureCode: 'precondition_failed',
            failureReason: 'The battery is already at its charge limit.',
          };
        }
        this.state.charge.status = 'charging';
        this.state.charge.powerKw = 48;
        this.state.charge.addedRangeKm = 0;
        return { status: 'succeeded' };
      }

      case 'stop_charging':
        this.state.charge.status =
          this.state.charge.status === 'not_plugged_in'
            ? 'not_plugged_in'
            : 'connected_not_charging';
        this.state.charge.powerKw = 0;
        this.state.charge.minutesRemaining = null;
        return { status: 'succeeded' };

      case 'set_charge_limit': {
        const limit = payload.chargeLimitPercent as number;
        this.state.charge.chargeLimitPercent = limit;
        if (this.state.charge.status === 'charging' && this.batteryExact >= limit) {
          this.state.charge.status = 'complete';
          this.state.charge.powerKw = 0;
        }
        return { status: 'succeeded' };
      }

      case 'flash_lights':
      case 'sound_horn': {
        // Bounded event with an id. Nothing about the vehicle's steady state
        // changes, so a client that reconnects later has nothing to replay.
        const event = this.pushTransientEvent(
          type === 'flash_lights' ? 'flash' : 'horn',
          type === 'flash_lights' ? 2400 : 1200,
          now,
        );
        return { status: 'succeeded', eventId: event.id };
      }

      default: {
        const exhaustive: never = type;
        return {
          status: 'rejected',
          failureCode: 'capability_unsupported',
          failureReason: `Unsupported command: ${String(exhaustive)}`,
        };
      }
    }
  }

  // --- Internals ------------------------------------------------------------

  private pushTransientEvent(
    kind: TransientEvent['kind'],
    durationMs: number,
    now: number,
  ): TransientEvent {
    this.eventCounter += 1;
    const event: TransientEvent = {
      id: `evt_${now.toString(36)}_${this.eventCounter.toString(36)}`,
      kind,
      occurredAt: new Date(now).toISOString(),
      durationMs,
    };
    this.state.transientEvents = [...this.state.transientEvents, event].slice(-8);
    return event;
  }

  private pruneTransientEvents(now: number): void {
    this.state.transientEvents = this.state.transientEvents.filter(
      (event) => now - new Date(event.occurredAt).getTime() < TRANSIENT_EVENT_TTL_MS,
    );
  }

  private nearestRouteIndex(location: { latitude: number; longitude: number }): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.route.forEach((point, index) => {
      const d = distanceMetres(point, location);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }

  private advanceMovement(seconds: number, now: number): void {
    if (!this.journeyRunning) {
      this.state.isMoving = false;
      this.state.speedKph = 0;
      return;
    }

    // Speed varies a little around the target so the trace does not look like a
    // metronome, then heading and distance are derived from where the car
    // actually ended up.
    const wobble = Math.sin(now / 7000) * 6;
    const speedKph = clamp(this.config.targetSpeedKph + wobble, 8, 140);
    const metres = (speedKph * 1000 * seconds) / 3600;

    const from: LatLng = { ...this.state.location };
    let remaining = metres;
    let index = this.routeIndex;

    while (remaining > 0) {
      const next = this.route[(index + 1) % this.route.length]!;
      const current: LatLng = {
        latitude: this.state.location.latitude,
        longitude: this.state.location.longitude,
      };
      const legMetres = distanceMetres(current, next);

      if (legMetres <= 0.01) {
        index = (index + 1) % this.route.length;
        continue;
      }

      if (remaining < legMetres) {
        const moved = interpolate(current, next, remaining / legMetres);
        this.state.location.latitude = moved.latitude;
        this.state.location.longitude = moved.longitude;
        remaining = 0;
      } else {
        this.state.location.latitude = next.latitude;
        this.state.location.longitude = next.longitude;
        this.state.location.addressLabel = next.addressLabel;
        remaining -= legMetres;
        index = (index + 1) % this.route.length;
      }
    }

    this.routeIndex = index;

    const to: LatLng = {
      latitude: this.state.location.latitude,
      longitude: this.state.location.longitude,
    };
    const travelled = distanceMetres(from, to);
    if (travelled > 0.5) {
      this.state.location.headingDegrees = round(bearingDegrees(from, to), 1);
    }

    this.state.isMoving = true;
    this.state.gear = 'D';
    this.state.speedKph = round((travelled / seconds) * 3.6, 1);
    this.state.lock = 'locked';
    this.state.lights.daytimeRunning = true;

    // Roughly 17 kWh/100 km on an 82 kWh pack.
    const consumedKwh = (travelled / 1000) * 0.17;
    this.drainBattery((consumedKwh / 82) * 100);
  }

  private advanceClimate(seconds: number): void {
    const climate = this.state.climate;
    climate.exteriorTempC = this.config.exteriorTempC;

    const target = climate.active ? climate.targetTempC : climate.exteriorTempC;
    // A cabin does not snap to its target: roughly 0.35 °C per second toward it
    // while conditioning, and a slow drift back once it stops.
    const rate = climate.active ? 0.35 : 0.05;
    const delta = target - climate.interiorTempC;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * seconds);
    climate.interiorTempC = round(climate.interiorTempC + step, 1);

    if (climate.active) {
      // ~3.5 kW draw while conditioning.
      this.drainBattery(((3.5 * (seconds / 3600)) / 82) * 100);
      this.state.power = 'awake';
    }
  }

  private advanceCharging(seconds: number): void {
    const charge = this.state.charge;
    if (charge.status !== 'charging') return;

    const addedKwh = (charge.powerKw * seconds) / 3600;
    const addedPercent = (addedKwh / 82) * 100;
    this.batteryExact = Math.min(charge.chargeLimitPercent, this.batteryExact + addedPercent);
    this.publishBattery();
    charge.addedRangeKm = round(charge.addedRangeKm + (addedPercent / 100) * 512, 1);

    const remainingPercent = charge.chargeLimitPercent - this.batteryExact;
    charge.minutesRemaining =
      charge.powerKw > 0
        ? Math.max(0, Math.round((((remainingPercent / 100) * 82) / charge.powerKw) * 60))
        : null;

    if (this.batteryExact >= charge.chargeLimitPercent) {
      charge.status = 'complete';
      charge.powerKw = 0;
      charge.minutesRemaining = null;
    }
  }

  private drainBattery(percent: number): void {
    this.batteryExact = Math.max(0, this.batteryExact - percent);
    this.publishBattery();

    // An empty battery stops the car. Reporting a moving vehicle at 0 % would
    // be a nicer demo and a worse simulation.
    if (this.batteryExact <= 0.5 && this.journeyRunning) {
      this.journeyRunning = false;
      this.state.isMoving = false;
      this.state.speedKph = 0;
      this.state.gear = 'P';
      this.state.driveReady = false;
    }
  }
}

/** A parked, locked, plausible starting state, used when a vehicle has none. */
export const buildInitialState = (now = Date.now()): ReportedVehicleState => ({
  connectivity: 'online',
  lock: 'locked',
  gear: 'P',
  isMoving: false,
  speedKph: 0,
  doors: { frontLeft: 'closed', frontRight: 'closed', rearLeft: 'closed', rearRight: 'closed' },
  trunk: 'closed',
  frunk: 'closed',
  windowsClosed: true,
  power: 'asleep',
  lights: { headlights: false, taillights: false, indicators: false, daytimeRunning: false },
  driveAuthorization: { granted: false, expiresAt: null, grantedAt: null },
  driveReady: false,
  transientEvents: [],
  climate: {
    active: false,
    interiorTempC: 38.5,
    exteriorTempC: 41,
    targetTempC: 22,
    passengerTargetTempC: 22,
    zonesSynced: true,
    fanLevel: 0,
    driverSeatHeat: 0,
    passengerSeatHeat: 0,
    seatVentilation: 0,
    steeringWheelHeat: false,
    frontDefrost: false,
    rearDefrost: false,
    departureTime: null,
    departureEnabled: false,
  },
  charge: {
    batteryPercent: 72,
    estimatedRangeKm: 368,
    status: 'not_plugged_in',
    chargeLimitPercent: 80,
    powerKw: 0,
    addedRangeKm: 0,
    minutesRemaining: null,
    portOpen: false,
    locationLabel: 'Home',
    scheduleEnabled: false,
    scheduleStart: '23:00',
    scheduleEnd: '06:00',
    batteryHealthPercent: 98,
  },
  location: {
    latitude: RIYADH_CENTRE.latitude,
    longitude: RIYADH_CENTRE.longitude,
    headingDegrees: 45,
    isLive: true,
    capturedAt: new Date(now).toISOString(),
    addressLabel: 'King Fahd Road',
    city: 'Riyadh',
  },
});
