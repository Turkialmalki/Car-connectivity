import { describe, expect, it } from 'vitest';
import {
  VehicleSimulation,
  bearingDegrees,
  buildInitialState,
  buildRoute,
  distanceMetres,
} from '../lib/simulator/engine';
import { reportedStateSchema } from '../lib/vehicle/state';

const parked = () => new VehicleSimulation(buildInitialState());

describe('route', () => {
  it('produces a dense path around Riyadh', () => {
    const route = buildRoute();
    expect(route.length).toBeGreaterThan(50);
    for (const point of route) {
      expect(point.latitude).toBeGreaterThan(24.6);
      expect(point.latitude).toBeLessThan(24.8);
      expect(point.longitude).toBeGreaterThan(46.6);
      expect(point.longitude).toBeLessThan(46.8);
    }
  });

  it('derives heading from movement rather than inventing it', () => {
    const north = bearingDegrees({ latitude: 24.7, longitude: 46.7 }, { latitude: 24.8, longitude: 46.7 });
    const east = bearingDegrees({ latitude: 24.7, longitude: 46.7 }, { latitude: 24.7, longitude: 46.8 });
    expect(north).toBeCloseTo(0, 0);
    expect(east).toBeCloseTo(90, 0);
  });
});

describe('reported state', () => {
  it('always satisfies the schema the API validates against', () => {
    const simulation = parked();
    simulation.execute('enable_driving');
    simulation.setJourneyRunning(true);
    for (let i = 0; i < 30; i += 1) simulation.tick(2000);
    expect(reportedStateSchema.safeParse(simulation.snapshot()).success).toBe(true);
  });
});

describe('movement', () => {
  it('does not move a parked vehicle', () => {
    const simulation = parked();
    const before = simulation.snapshot().location;
    simulation.tick(10_000);
    const after = simulation.snapshot().location;
    expect(distanceMetres(before, after)).toBeLessThan(1);
    expect(after.headingDegrees).toBe(before.headingDegrees);
  });

  it('refuses to start a journey until the vehicle is ready to drive', () => {
    const simulation = parked();
    expect(simulation.setJourneyRunning(true).ok).toBe(false);
    simulation.execute('enable_driving');
    expect(simulation.setJourneyRunning(true).ok).toBe(true);
  });

  it('advances along the route with a speed consistent with the distance covered', () => {
    const simulation = parked();
    simulation.execute('enable_driving');
    simulation.setJourneyRunning(true);

    const start = simulation.snapshot().location;
    simulation.tick(2000);
    const next = simulation.snapshot();

    const metres = distanceMetres(start, next.location);
    expect(metres).toBeGreaterThan(10);
    // speed reported must match the ground actually covered
    expect(next.speedKph).toBeCloseTo((metres / 2) * 3.6, 0);
    expect(next.isMoving).toBe(true);
    expect(next.gear).toBe('D');
  });

  it('drains the battery while driving', () => {
    const simulation = parked();
    simulation.execute('enable_driving');
    simulation.setJourneyRunning(true);
    const before = simulation.snapshot().charge.batteryPercent;
    for (let i = 0; i < 60; i += 1) simulation.tick(2000);
    expect(simulation.snapshot().charge.batteryPercent).toBeLessThan(before);
  });
});

describe('physical distinctions the app depends on', () => {
  it('unlocking does not open a door', () => {
    const simulation = parked();
    expect(simulation.execute('unlock').status).toBe('succeeded');
    const state = simulation.snapshot();
    expect(state.lock).toBe('unlocked');
    expect(state.doors.frontLeft).toBe('closed');
  });

  it('opens a named door only once the vehicle is unlocked', () => {
    const simulation = parked();
    const locked = simulation.execute('open_door', { door: 'frontLeft' });
    expect(locked.status).toBe('failed');
    expect(locked.failureCode).toBe('precondition_failed');

    simulation.execute('unlock');
    expect(simulation.execute('open_door', { door: 'frontLeft' }).status).toBe('succeeded');
    const state = simulation.snapshot();
    expect(state.doors.frontLeft).toBe('open');
    expect(state.doors.frontRight).toBe('closed');
  });

  it('enabling drive power leaves the vehicle parked', () => {
    const simulation = parked();
    simulation.execute('enable_driving');
    const state = simulation.snapshot();
    expect(state.driveReady).toBe(true);
    expect(state.driveAuthorization.granted).toBe(true);
    expect(state.isMoving).toBe(false);
    expect(state.speedKph).toBe(0);
    expect(state.gear).toBe('P');
  });

  it('gives every flash a distinct event id and no lasting light state', () => {
    const simulation = parked();
    const first = simulation.execute('flash_lights', {}, 1_000);
    const second = simulation.execute('flash_lights', {}, 2_000);

    expect(first.eventId).toBeDefined();
    expect(second.eventId).toBeDefined();
    expect(first.eventId).not.toEqual(second.eventId);

    const state = simulation.snapshot();
    expect(state.lights.headlights).toBe(false);
    expect(state.transientEvents).toHaveLength(2);
  });

  it('drops transient events once they are too old to present', () => {
    const simulation = parked();
    simulation.execute('flash_lights', {}, 1_000);
    simulation.tick(1000, 1_000 + 20_000);
    expect(simulation.snapshot().transientEvents).toHaveLength(0);
  });

  it('will not open a door while the vehicle is moving', () => {
    const simulation = parked();
    simulation.execute('enable_driving');
    simulation.execute('unlock');
    simulation.setJourneyRunning(true);
    simulation.tick(2000);

    const outcome = simulation.execute('open_door', { door: 'rearLeft' });
    expect(outcome.status).toBe('failed');
    expect(outcome.failureCode).toBe('vehicle_moving');
  });
});

describe('climate and charging', () => {
  it('moves the cabin temperature toward the target gradually, not instantly', () => {
    const simulation = parked();
    simulation.execute('start_climate', { targetTempC: 21 });

    const start = simulation.snapshot().climate.interiorTempC;
    simulation.tick(2000);
    const afterOneTick = simulation.snapshot().climate.interiorTempC;

    expect(afterOneTick).toBeLessThan(start);
    expect(afterOneTick).toBeGreaterThan(21);

    for (let i = 0; i < 60; i += 1) simulation.tick(2000);
    expect(simulation.snapshot().climate.interiorTempC).toBeCloseTo(21, 0);
  });

  it('refuses to charge when nothing is plugged in', () => {
    const simulation = parked();
    const outcome = simulation.execute('start_charging');
    expect(outcome.status).toBe('failed');
    expect(outcome.failureCode).toBe('precondition_failed');
  });

  it('charges to the limit and then reports complete', () => {
    const simulation = new VehicleSimulation({
      ...buildInitialState(),
      charge: {
        ...buildInitialState().charge,
        status: 'connected_not_charging',
        batteryPercent: 79,
        chargeLimitPercent: 80,
      },
    });

    expect(simulation.execute('start_charging').status).toBe('succeeded');
    for (let i = 0; i < 120; i += 1) simulation.tick(2000);

    const charge = simulation.snapshot().charge;
    expect(charge.status).toBe('complete');
    expect(charge.batteryPercent).toBe(80);
    expect(charge.powerKw).toBe(0);
  });

  it('reports offline and refuses commands when connectivity is lost', () => {
    const simulation = parked();
    simulation.configure({ connectivityLost: true });
    expect(simulation.snapshot().connectivity).toBe('offline');

    const outcome = simulation.execute('lock');
    expect(outcome.status).toBe('failed');
    expect(outcome.failureCode).toBe('vehicle_offline');
  });

  it('refuses every command when configured to do so', () => {
    const simulation = parked();
    simulation.configure({ rejectCommands: true });
    expect(simulation.execute('lock').failureCode).toBe('precondition_failed');
  });
});

describe('hydration', () => {
  it('adopts the backend snapshot over whatever it was holding', () => {
    const simulation = parked();
    simulation.execute('unlock');
    simulation.execute('open_trunk');

    simulation.hydrate(buildInitialState());
    const state = simulation.snapshot();
    expect(state.lock).toBe('locked');
    expect(state.trunk).toBe('closed');
  });
});
