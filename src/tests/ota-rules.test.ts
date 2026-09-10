import { buildPrerequisites, canInstall, unmetPrerequisites } from '@/domain/use-cases';
import { buildInitialState, buildOtaUpdate } from '@/infrastructure/mock-connected-cloud/fixtures';

const update = buildOtaUpdate('nova_one_demo');

describe('OTA safety prerequisites', () => {
  it('blocks installation until the duration is acknowledged', () => {
    const state = buildInitialState('nova_one_demo');
    const prerequisites = buildPrerequisites(state, update, {});
    expect(canInstall(prerequisites)).toBe(false);
    expect(unmetPrerequisites(prerequisites).map((p) => p.id)).toEqual(['duration_ack']);
  });

  it('allows installation once every condition is satisfied', () => {
    const state = buildInitialState('nova_one_demo');
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(canInstall(prerequisites)).toBe(true);
  });

  it('blocks installation while the vehicle is moving', () => {
    const state = { ...buildInitialState('nova_one_demo'), isMoving: true, gear: 'D' as const };
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(canInstall(prerequisites)).toBe(false);
    expect(unmetPrerequisites(prerequisites).map((p) => p.id)).toContain('parked');
  });

  it('blocks installation on a low battery', () => {
    const base = buildInitialState('nova_one_demo');
    const state = { ...base, charge: { ...base.charge, batteryPercent: 12 } };
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(unmetPrerequisites(prerequisites).map((p) => p.id)).toContain('battery');
  });

  it('blocks installation during high-power DC charging', () => {
    const base = buildInitialState('nova_one_demo');
    const state = {
      ...base,
      charge: { ...base.charge, status: 'charging' as const, powerKw: 150 },
    };
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(unmetPrerequisites(prerequisites).map((p) => p.id)).toContain('not_charging_restricted');
  });

  it('permits installation while charging slowly on AC', () => {
    const base = buildInitialState('nova_one_demo');
    const state = {
      ...base,
      charge: { ...base.charge, status: 'charging' as const, powerKw: 10.8 },
    };
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(canInstall(prerequisites)).toBe(true);
  });

  it('blocks installation with a door or the boot open', () => {
    const base = buildInitialState('nova_one_demo');
    const state = { ...base, trunk: 'open' as const };
    const prerequisites = buildPrerequisites(state, update, { duration_ack: true });
    expect(unmetPrerequisites(prerequisites).map((p) => p.id)).toContain('closed_up');
  });
});
