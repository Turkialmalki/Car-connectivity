import {
  canTransitionDriver,
  describeDuration,
  effectivePermissions,
  isAccessExpired,
} from '@/domain/use-cases';
import type { SharedDriver } from '@/domain/entities';

const driver = (overrides: Partial<SharedDriver> = {}): SharedDriver => ({
  id: 'drv_1',
  name: 'Layla Al-Harbi',
  contact: 'layla@example.com',
  status: 'active',
  permissions: ['drive', 'remote_lock', 'climate'],
  duration: { kind: 'permanent' },
  invitedAt: '2026-01-01T00:00:00.000Z',
  acceptedAt: '2026-01-01T00:10:00.000Z',
  keyId: 'key_shared',
  avatarInitials: 'LA',
  ...overrides,
});

describe('revoked shared access', () => {
  it('leaves a revoked driver with no effective permissions', () => {
    expect(effectivePermissions(driver({ status: 'revoked' }))).toEqual([]);
  });

  it('leaves a suspended driver with no effective permissions', () => {
    expect(effectivePermissions(driver({ status: 'suspended' }))).toEqual([]);
  });

  it('keeps permissions for an active driver', () => {
    expect(effectivePermissions(driver())).toHaveLength(3);
  });

  it('drops permissions once a time-boxed grant has passed', () => {
    const expired = driver({
      duration: { kind: 'valet', expiresAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(effectivePermissions(expired)).toEqual([]);
  });

  it('never allows a revoked driver to be reinstated directly', () => {
    expect(canTransitionDriver('revoked', 'active')).toBe(false);
    expect(canTransitionDriver('suspended', 'active')).toBe(true);
  });
});

describe('access duration', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('never expires permanent access', () => {
    expect(isAccessExpired({ kind: 'permanent' }, now)).toBe(false);
  });

  it('expires a date range after its end', () => {
    expect(
      isAccessExpired(
        {
          kind: 'date_range',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2026-05-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('keeps a date range live inside its window', () => {
    expect(
      isAccessExpired(
        {
          kind: 'date_range',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2026-12-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('describes each duration kind for display', () => {
    expect(describeDuration({ kind: 'permanent' })).toBe('Permanent access');
    expect(describeDuration({ kind: 'valet', expiresAt: '2026-06-01T16:00:00.000Z' })).toContain(
      'Valet',
    );
  });
});
