import {
  CLOSED_POSE,
  HINGES,
  HOTSPOT_ANCHOR,
  VEHICLE_PARTS,
  anyPartOpen,
  lightsFromState,
  poseFromState,
  projectAnchor,
  separateHotspots,
} from '@/components/vehicle-3d/articulation';
import { buildInitialState } from '@/infrastructure/mock-connected-cloud/fixtures';
import articulation from '../../assets/vehicle/vehicle.articulation.json';

const baseState = () => buildInitialState('nova_one_demo');

describe('vehicle articulation mapping', () => {
  it('maps every semantic part to a node that exists in the shipped asset', () => {
    const hinges = articulation.hinges as Record<string, { node: string }>;
    const nodeNames = new Set(Object.values(hinges).map((h) => h.node));
    VEHICLE_PARTS.forEach((part) => {
      expect(nodeNames.has(HINGES[part].node)).toBe(true);
    });
  });

  it('agrees with the asset on hinge axis and travel', () => {
    const hinges = articulation.hinges as Record<
      string,
      { node: string; axis: number[]; openDegrees: number }
    >;
    const byNode = new Map(Object.values(hinges).map((h) => [h.node, h]));
    VEHICLE_PARTS.forEach((part) => {
      const spec = HINGES[part];
      const asset = byNode.get(spec.node)!;
      const axisIndex = { x: 0, y: 1, z: 2 }[spec.axis];
      // A mapping that drifts from the asset would rotate a door about the
      // wrong axis, which is exactly the defect this guards.
      expect(asset.axis[axisIndex]).toBe(1);
      expect(asset.openDegrees).toBeCloseTo(spec.openDegrees, 3);
    });
  });

  it('exposes the light surfaces the app switches on', () => {
    const lights = articulation.lights as string[];
    ['headlightLeft', 'headlightRight', 'taillightLeft', 'taillightRight'].forEach((node) => {
      expect(lights).toContain(node);
    });
  });
});

describe('pose derived from reported state', () => {
  it('is fully closed when nothing is reported open', () => {
    expect(poseFromState(baseState())).toEqual(CLOSED_POSE);
    expect(anyPartOpen(poseFromState(baseState()))).toBe(false);
  });

  it('opens only the part the vehicle actually reports', () => {
    const state = { ...baseState(), trunk: 'open' as const };
    const pose = poseFromState(state);
    expect(pose.rearTrunk).toBe(1);
    expect(pose.frontTrunk).toBe(0);
    expect(pose.driverDoor).toBe(0);
  });

  it('unlocking does not open any door', () => {
    // The single most important behaviour in the whole visualisation: an
    // unlocked vehicle is not an open vehicle.
    const state = { ...baseState(), lock: 'unlocked' as const };
    expect(anyPartOpen(poseFromState(state))).toBe(false);
  });

  it('maps each door independently', () => {
    const state = baseState();
    state.doors = { ...state.doors, rearLeft: 'open' };
    const pose = poseFromState(state);
    expect(pose.rearLeftDoor).toBe(1);
    expect(pose.rearRightDoor).toBe(0);
    expect(pose.driverDoor).toBe(0);
  });

  it('follows the charge port flap', () => {
    const state = baseState();
    state.charge = { ...state.charge, portOpen: true };
    expect(poseFromState(state).chargePort).toBe(1);
  });

  it('treats a missing snapshot as closed rather than guessing', () => {
    expect(poseFromState(null)).toEqual(CLOSED_POSE);
  });

  it('never derives light state from a transient flash event', () => {
    const state = baseState();
    state.transientEvents = [
      { id: 'evt_1', kind: 'flash', occurredAt: new Date().toISOString(), durationMs: 2000 },
    ];
    // A flash is bounded and separate; it must not latch a light on.
    expect(lightsFromState(state).headlights).toBe(false);
  });
});

describe('hotspot projection', () => {
  it('places every anchor inside the frame for the exterior preset', () => {
    VEHICLE_PARTS.forEach((part) => {
      const point = projectAnchor(HOTSPOT_ANCHOR[part], 'exterior', 360, 420);
      expect(point).not.toBeNull();
      expect(point!.depth).toBeGreaterThan(0);
    });
  });

  it('reports anchors on the far side as facing away', () => {
    // The exterior camera sits on the +x side, so the driver's door (-x) is
    // occluded and its hotspot must not be drawn over the body.
    const near = projectAnchor(HOTSPOT_ANCHOR.passengerDoor, 'exterior', 360, 420)!;
    const far = projectAnchor(HOTSPOT_ANCHOR.driverDoor, 'exterior', 360, 420)!;
    expect(near.facing).toBeGreaterThan(far.facing);
    expect(far.facing).toBeLessThan(0.06);
  });

  it('returns null rather than a nonsense point for a zero-sized frame', () => {
    expect(projectAnchor(HOTSPOT_ANCHOR.rearTrunk, 'exterior', 0, 0)).toBeNull();
  });

  it('separates colliding labels', () => {
    const separated = separateHotspots(
      [
        { x: 100, y: 100 },
        { x: 104, y: 104 },
        { x: 108, y: 108 },
      ],
      46,
    );
    for (let i = 1; i < separated.length; i += 1) {
      const gap = Math.abs(separated[i]!.y - separated[i - 1]!.y);
      expect(gap).toBeGreaterThanOrEqual(46);
    }
  });
});
