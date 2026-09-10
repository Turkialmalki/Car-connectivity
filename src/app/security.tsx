import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  ListRow,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Surface,
  Text,
  Toggle,
} from '@/components/design-system';
import { StackHeader } from '@/features/shared/StackHeader';
import {
  ACTIVE_SESSIONS,
  SECURITY_ACTIVITY,
  TRUSTED_DEVICES,
} from '@/infrastructure/mock-connected-cloud';
import { useAppStore, useUiStore } from '@/stores';
import { relativeTime } from '@/utils/time';

/** Security settings: step-up policy, device trust, sessions and recent activity. */
export default function SecurityScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const requireBiometric = useAppStore((s) => s.requireBiometricForUnlock);
  const setRequireBiometric = useAppStore((s) => s.setRequireBiometric);
  const permissions = useAppStore((s) => s.permissions);
  const grantPermission = useAppStore((s) => s.grantPermission);
  const showBanner = useUiStore((s) => s.showBanner);

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('profile.security')}
        subtitle="How this account and device are protected"
      />

      <SectionHeader title="Authentication" />
      <Surface>
        <View style={{ gap: theme.spacing.lg }}>
          <Toggle
            label={t('profile.biometrics')}
            description="Use Face ID or your fingerprint to sign in to this app."
            value={permissions.biometrics}
            onChange={(value) => grantPermission('biometrics', value)}
          />
          <Toggle
            label={t('profile.requireBiometric')}
            description="Ask for biometric confirmation before a remote unlock or boot release. Recommended — a stolen unlocked phone should not be a stolen car."
            value={requireBiometric}
            onChange={(value) => {
              setRequireBiometric(value);
              if (!value) {
                showBanner(
                  'Biometric step-up disabled. Remote unlock will now be sent without confirming who is holding the phone.',
                  'warning',
                );
              }
            }}
          />
        </View>
      </Surface>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('profile.trustedDevices')} />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            {TRUSTED_DEVICES.map((device) => (
              <ListRow
                key={device.id}
                icon="device"
                title={device.label}
                subtitle={
                  device.isCurrentDevice
                    ? 'This device · active now'
                    : `Last active ${relativeTime(device.lastActiveAt)}`
                }
                showChevron={false}
                right={
                  <StatusPill
                    label={device.attestationVerified ? 'Attested' : 'Unverified'}
                    tone={device.attestationVerified ? 'success' : 'warning'}
                    compact
                  />
                }
              />
            ))}
          </View>
        </Surface>
        <Surface tone="soft" style={{ marginTop: theme.spacing.md }}>
          <Row gap={theme.spacing.md} align="flex-start">
            <Icon name="shield" size={19} color={theme.colors.electric} />
            <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              &quot;Attested&quot; means the device proved it is running a genuine, unmodified build
              on genuine hardware, using App Attest on iOS or Play Integrity on Android. The backend
              verifies that proof — the app cannot vouch for itself. Browsers cannot be attested,
              which is why the web session shows as unverified.
            </Text>
          </Row>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('profile.activeSessions')} />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            {ACTIVE_SESSIONS.map((session) => (
              <ListRow
                key={session.id}
                icon="globe"
                title={session.deviceLabel}
                subtitle={`${session.approxLocation} · started ${relativeTime(session.startedAt)}`}
                value={session.isCurrent ? 'This session' : undefined}
                showChevron={false}
              />
            ))}
            <ListRow
              icon="close"
              title={t('profile.revokeDevice')}
              subtitle="Signs this device out and invalidates its refresh token"
              destructive
              showChevron={false}
              onPress={() =>
                showBanner(
                  'In production this revokes the refresh token server-side immediately.',
                  'info',
                )
              }
            />
          </View>
        </Surface>
        <Text
          variant="micro"
          color={theme.colors.textTertiary}
          style={{ marginTop: theme.spacing.sm }}
        >
          Session locations are shown at city level only. Precise coordinates are never stored
          against a session or written to a log.
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('profile.securityActivity')} />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            {SECURITY_ACTIVITY.map((activity, index) => (
              <View key={activity.id}>
                <Row
                  gap={theme.spacing.md}
                  align="flex-start"
                  style={{ paddingVertical: theme.spacing.md }}
                >
                  <Icon
                    name={activity.severity === 'warning' ? 'alert' : 'shield'}
                    size={18}
                    color={
                      activity.severity === 'warning'
                        ? theme.colors.warning
                        : theme.colors.textSecondary
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Row justify="space-between">
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {activity.title}
                      </Text>
                      <Text variant="micro" color={theme.colors.textTertiary}>
                        {relativeTime(activity.occurredAt)}
                      </Text>
                    </Row>
                    <Text
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={{ marginTop: 2 }}
                    >
                      {activity.detail}
                    </Text>
                  </View>
                </Row>
                {index < SECURITY_ACTIVITY.length - 1 && (
                  <View style={{ height: 1, backgroundColor: theme.colors.line }} />
                )}
              </View>
            ))}
          </View>
        </Surface>
      </View>
    </Screen>
  );
}
