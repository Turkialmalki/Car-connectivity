import React, { useState } from 'react';
import { View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  Row,
  Screen,
  SectionHeader,
  SegmentedControl,
  Sheet,
  StatusPill,
  Surface,
  Text,
  TextField,
  Toggle,
  Pressable,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import {
  AUDIT_COPY,
  DEFAULT_SHARED_PERMISSIONS,
  PERMISSION_COPY,
  VALET_PERMISSIONS,
  type AccessDuration,
  type DriverPermission,
  type SharedDriver,
} from '@/domain/entities';
import { describeDuration, effectivePermissions } from '@/domain/use-cases';
import { useDrivers } from '@/hooks';
import { useUiStore } from '@/stores';
import { isoIn, relativeTime } from '@/utils/time';

const inviteSchema = z.object({
  name: z.string().min(2, 'Enter the driver’s name.'),
  contact: z
    .string()
    .min(3, 'Enter an email address or mobile number.')
    .refine(
      (v) => v.includes('@') || /^\+?[\d\s-]{8,}$/.test(v),
      'Enter a valid email address or mobile number.',
    ),
});

type InviteValues = z.infer<typeof inviteSchema>;

type DurationKind = AccessDuration['kind'];

/**
 * Drivers and key sharing.
 *
 * Sharing a car is a permission-granting act, so the flow is built around two
 * explicit choices — what they can do, and for how long — and every change
 * produces an audit event. The valet preset deliberately grants the least.
 */
export default function DriversScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { drivers, audit, invite, updatePermissions, suspend, revoke } = useDrivers();
  const showBanner = useUiStore((s) => s.showBanner);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<SharedDriver | null>(null);
  const [permissions, setPermissions] = useState<DriverPermission[]>(DEFAULT_SHARED_PERMISSIONS);
  const [durationKind, setDurationKind] = useState<DurationKind>('date_range');

  const { control, handleSubmit, reset, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', contact: '' },
  });

  const buildDuration = (): AccessDuration => {
    switch (durationKind) {
      case 'permanent':
        return { kind: 'permanent' };
      case 'one_time':
        return { kind: 'one_time', expiresAt: isoIn(60 * 60 * 24) };
      case 'valet':
        return { kind: 'valet', expiresAt: isoIn(60 * 60 * 4) };
      default:
        return {
          kind: 'date_range',
          startsAt: isoIn(0),
          endsAt: isoIn(60 * 60 * 24 * 14),
        };
    }
  };

  const onInvite = handleSubmit(async (values) => {
    await invite.mutateAsync({
      name: values.name,
      contact: values.contact,
      // Valet access is forced to the minimal set regardless of what was ticked.
      permissions: durationKind === 'valet' ? VALET_PERMISSIONS : permissions,
      duration: buildDuration(),
    });
    setInviteOpen(false);
    reset();
    showBanner(t('drivers.inviteSent'), 'success');
  });

  const togglePermission = (permission: DriverPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission],
    );
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('drivers.title')}
        subtitle="Who can reach your vehicle, and for how long"
      />

      <Button label={t('drivers.invite')} icon="plus" onPress={() => setInviteOpen(true)} />

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Drivers" />
        {drivers.isLoading ? (
          <EmptyState icon="user" title={t('common.loading')} />
        ) : (drivers.data ?? []).length === 0 ? (
          <EmptyState
            icon="user"
            title="No shared drivers"
            body="Invite someone and choose exactly what they can do."
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {(drivers.data ?? []).map((driver) => {
              const effective = effectivePermissions(driver);
              return (
                <Pressable
                  key={driver.id}
                  onPress={() => setSelected(driver)}
                  haptic="light"
                  scaleTo={0.985}
                  accessibilityLabel={`${driver.name}, ${driver.status}`}
                >
                  <Surface>
                    <Row gap={theme.spacing.md} align="flex-start">
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          backgroundColor:
                            driver.status === 'active'
                              ? theme.colors.electricDim
                              : theme.colors.soft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          variant="caption"
                          color={
                            driver.status === 'active'
                              ? theme.colors.electric
                              : theme.colors.textTertiary
                          }
                        >
                          {driver.avatarInitials}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Row justify="space-between">
                          <Text variant="bodyStrong">{driver.name}</Text>
                          <StatusPill
                            label={driver.status}
                            tone={
                              driver.status === 'active'
                                ? 'success'
                                : driver.status === 'invited'
                                  ? 'desert'
                                  : driver.status === 'suspended'
                                    ? 'warning'
                                    : 'critical'
                            }
                            compact
                          />
                        </Row>
                        <Text
                          variant="caption"
                          color={theme.colors.textSecondary}
                          style={{ marginTop: 2 }}
                        >
                          {driver.contact} · {describeDuration(driver.duration)}
                        </Text>
                        <Text
                          variant="micro"
                          color={theme.colors.textTertiary}
                          style={{ marginTop: 6 }}
                        >
                          {effective.length === 0
                            ? 'No effective permissions — access is not active.'
                            : effective.map((p) => PERMISSION_COPY[p].label).join(' · ')}
                        </Text>
                      </View>
                    </Row>
                  </Surface>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Audit */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader
          title={t('drivers.auditTrail')}
          subtitle="Every access change is recorded. This log is append-only."
        />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            {(audit.data ?? []).map((event, index, all) => (
              <View key={event.id}>
                <Row
                  gap={theme.spacing.md}
                  align="flex-start"
                  style={{ paddingVertical: theme.spacing.md }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor:
                        event.type === 'access_revoked' || event.type === 'key_suspended'
                          ? theme.colors.criticalDim
                          : theme.colors.soft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name={
                        event.type === 'access_revoked'
                          ? 'close'
                          : event.type === 'key_provisioned'
                            ? 'key'
                            : event.type === 'permission_changed'
                              ? 'settings'
                              : 'user'
                      }
                      size={14}
                      color={
                        event.type === 'access_revoked' || event.type === 'key_suspended'
                          ? theme.colors.critical
                          : theme.colors.textSecondary
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Row justify="space-between">
                      <Text variant="bodyStrong">{AUDIT_COPY[event.type]}</Text>
                      <Text variant="micro" color={theme.colors.textTertiary}>
                        {relativeTime(event.occurredAt)}
                      </Text>
                    </Row>
                    <Text
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={{ marginTop: 2 }}
                    >
                      {event.subjectName} — {event.detail}
                    </Text>
                  </View>
                </Row>
                {index < all.length - 1 && (
                  <View style={{ height: 1, backgroundColor: theme.colors.line }} />
                )}
              </View>
            ))}
          </View>
        </Surface>
      </View>

      {/* Invite sheet */}
      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title={t('drivers.invite')}>
        <View style={{ gap: theme.spacing.base }}>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Layla Al-Harbi"
                error={formState.errors.name?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="contact"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Email or mobile"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                placeholder="layla@example.com"
                error={formState.errors.contact?.message}
              />
            )}
          />

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">{t('drivers.duration')}</Text>
            <SegmentedControl<DurationKind>
              label={t('drivers.duration')}
              value={durationKind}
              onChange={setDurationKind}
              options={[
                { value: 'date_range', label: '2 weeks' },
                { value: 'permanent', label: 'Permanent' },
                { value: 'one_time', label: 'One-time' },
                { value: 'valet', label: 'Valet' },
              ]}
            />
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="bodyStrong">{t('drivers.permissions')}</Text>
            {durationKind === 'valet' ? (
              <Surface tone="soft">
                <Text variant="caption" color={theme.colors.textSecondary}>
                  Valet access is fixed to driving only, for four hours. Location, charging and
                  service data stay private, and the key expires on its own.
                </Text>
              </Surface>
            ) : (
              (Object.keys(PERMISSION_COPY) as DriverPermission[]).map((permission) => (
                <Toggle
                  key={permission}
                  label={PERMISSION_COPY[permission].label}
                  description={PERMISSION_COPY[permission].detail}
                  value={permissions.includes(permission)}
                  onChange={() => togglePermission(permission)}
                />
              ))
            )}
          </View>

          <Button
            label={t('drivers.invite')}
            onPress={() => void onInvite()}
            loading={invite.isPending}
          />
        </View>
      </Sheet>

      {/* Driver detail */}
      <Sheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
      >
        {selected && (
          <View style={{ gap: theme.spacing.base }}>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Access
              </Text>
              <Text variant="bodyStrong">{describeDuration(selected.duration)}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Invited
              </Text>
              <Text variant="bodyStrong">{relativeTime(selected.invitedAt)}</Text>
            </Row>

            <Text variant="bodyStrong" style={{ marginTop: theme.spacing.sm }}>
              {t('drivers.permissions')}
            </Text>
            {(Object.keys(PERMISSION_COPY) as DriverPermission[]).map((permission) => (
              <Toggle
                key={permission}
                label={PERMISSION_COPY[permission].label}
                value={selected.permissions.includes(permission)}
                disabled={selected.status === 'revoked'}
                disabledReason="Access has been revoked for this driver."
                onChange={(value) => {
                  const next = value
                    ? [...selected.permissions, permission]
                    : selected.permissions.filter((p) => p !== permission);
                  updatePermissions.mutate({ driverId: selected.id, permissions: next });
                  setSelected({ ...selected, permissions: next });
                }}
              />
            ))}

            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
              {selected.status === 'active' && (
                <Button
                  label="Suspend access"
                  variant="secondary"
                  icon="pause"
                  onPress={() => {
                    suspend.mutate(selected.id);
                    setSelected(null);
                  }}
                />
              )}
              {selected.status !== 'revoked' && (
                <Button
                  label="Revoke access"
                  variant="destructive"
                  icon="trash"
                  onPress={() => {
                    revoke.mutate(selected.id);
                    setSelected(null);
                    showBanner(
                      'Access revoked. Any Digital Key issued to this driver was invalidated at the vehicle.',
                      'warning',
                    );
                  }}
                />
              )}
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
