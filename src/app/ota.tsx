import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Surface,
  Text,
  Toggle,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import { OTA_STATUS_COPY, type OtaPrerequisite } from '@/domain/entities';
import { buildPrerequisites, canInstall } from '@/domain/use-cases';
import { useOta, useVehicle, useVehicleState } from '@/hooks';
import { useUiStore } from '@/stores';
import { formatDuration, isoIn, dayMonth } from '@/utils/time';

/**
 * OTA update.
 *
 * Installing vehicle software is a safety-relevant operation, so the flow is
 * built around prerequisites rather than around a download button. System
 * prerequisites come from live vehicle state and cannot be overridden; the
 * duration acknowledgement is the one thing only a human can decide.
 */
export default function OtaScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const { update, install, schedule } = useOta();
  const showBanner = useUiStore((s) => s.showBanner);
  const [acknowledgements, setAcknowledgements] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);

  if (!state || !vehicle || !update) {
    return (
      <Screen>
        <EmptyState icon="download" title={t('common.loading')} />
      </Screen>
    );
  }

  if (!vehicle.capabilities.otaUpdates) {
    return (
      <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
        <StackHeader title={t('ota.title')} subtitle={vehicle.name} />
        <Surface tone="soft">
          <Row gap={theme.spacing.md} align="flex-start">
            <Icon name="info" size={19} color={theme.colors.desert} />
            <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              {vehicle.name} is on software {vehicle.softwareVersion} and does not support
              over-the-air updates. Software on this vehicle is updated during a service visit.
            </Text>
          </Row>
        </Surface>
      </Screen>
    );
  }

  const prerequisites = buildPrerequisites(state, update, acknowledgements);
  const ready = canInstall(prerequisites);
  const inProgress = ['downloading', 'verifying', 'installing'].includes(update.status);
  const completed = update.status === 'completed';

  const onInstall = async () => {
    if (!ready) {
      showBanner('Some safety prerequisites are not yet met.', 'warning');
      return;
    }
    setInstalling(true);
    try {
      await install();
      showBanner(`Vehicle updated to ${update.version}.`, 'success');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader title={t('ota.title')} subtitle={vehicle.name} />

      <Surface>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <Text variant="mono" color={theme.colors.textTertiary}>
              {completed ? 'INSTALLED' : 'AVAILABLE'}
            </Text>
            <Row align="flex-end" gap={theme.spacing.sm} style={{ marginTop: 6 }}>
              <Text variant="numericSm" numeric>
                {update.version}
              </Text>
              <Text
                variant="caption"
                color={theme.colors.textSecondary}
                style={{ marginBottom: 5 }}
              >
                from {update.currentVersion}
              </Text>
            </Row>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 6 }}>
              {update.sizeMb} MB · about {formatDuration(update.estimatedMinutes)} to install ·
              released {dayMonth(update.releasedAt)}
            </Text>
          </View>
          <StatusPill
            label={OTA_STATUS_COPY[update.status]}
            tone={completed ? 'success' : inProgress ? 'electric' : 'desert'}
            pulse={inProgress}
          />
        </Row>

        {(inProgress || completed) && (
          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
            <ProgressBar
              progress={update.progressPercent / 100}
              tone={completed ? 'success' : 'electric'}
              label={OTA_STATUS_COPY[update.status]}
            />
            <Row justify="space-between">
              <Text variant="micro" color={theme.colors.textSecondary}>
                {OTA_STATUS_COPY[update.status]}
              </Text>
              <Text variant="micro" numeric color={theme.colors.textSecondary}>
                {Math.round(update.progressPercent)}%
              </Text>
            </Row>
          </View>
        )}

        {update.status === 'failed' && update.failureReason && (
          <Surface tone="soft" style={{ marginTop: theme.spacing.md }}>
            <Text variant="caption" color={theme.colors.critical}>
              {update.failureReason} The vehicle automatically rolled back to{' '}
              {update.currentVersion} and remains drivable. Retry once it is parked and charged.
            </Text>
          </Surface>
        )}
      </Surface>

      {/* Release notes */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('ota.releaseNotes')} />
        <Surface>
          <View style={{ gap: theme.spacing.lg }}>
            {update.highlights.map((highlight) => (
              <Row key={highlight.title} gap={theme.spacing.md} align="flex-start">
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.electric,
                    marginTop: 7,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{highlight.title}</Text>
                  <Text
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={{ marginTop: 4 }}
                  >
                    {highlight.detail}
                  </Text>
                </View>
              </Row>
            ))}
          </View>
        </Surface>
      </View>

      {/* Prerequisites */}
      {!completed && (
        <View style={{ marginTop: theme.spacing.xxl }}>
          <SectionHeader
            title={t('ota.prerequisites')}
            subtitle="The vehicle checks these itself before and during installation."
          />
          <Surface>
            <View style={{ gap: theme.spacing.lg }}>
              {prerequisites.map((prerequisite) => (
                <PrerequisiteRow
                  key={prerequisite.id}
                  prerequisite={prerequisite}
                  onAcknowledge={(value) =>
                    setAcknowledgements((current) => ({ ...current, [prerequisite.id]: value }))
                  }
                />
              ))}
            </View>
          </Surface>

          <Surface tone="soft" style={{ marginTop: theme.spacing.md }}>
            <Row gap={theme.spacing.md} align="flex-start">
              <Icon name="alert" size={19} color={theme.colors.warning} />
              <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                {t('ota.unavailableWarning')} If you need the vehicle sooner, schedule the
                installation for overnight instead.
              </Text>
            </Row>
          </Surface>

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
            <Button
              label={t('ota.install')}
              icon="download"
              onPress={() => void onInstall()}
              disabled={!ready || inProgress}
              loading={installing}
              accessibilityHint={!ready ? 'Some prerequisites are not yet met' : undefined}
            />
            <Button
              label={t('ota.schedule')}
              variant="secondary"
              icon="clock"
              onPress={() => {
                void schedule(isoIn(60 * 60 * 8));
                showBanner('Installation scheduled for tonight at 03:00.', 'success');
              }}
              disabled={inProgress}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const PrerequisiteRow = ({
  prerequisite,
  onAcknowledge,
}: {
  prerequisite: OtaPrerequisite;
  onAcknowledge: (value: boolean) => void;
}) => {
  const theme = useTheme();

  if (prerequisite.kind === 'acknowledgement') {
    return (
      <Toggle
        label={prerequisite.label}
        description={prerequisite.detail}
        value={prerequisite.satisfied}
        onChange={onAcknowledge}
      />
    );
  }

  return (
    <Row gap={theme.spacing.md} align="flex-start">
      <Icon
        name={prerequisite.satisfied ? 'check' : 'close'}
        size={18}
        color={prerequisite.satisfied ? theme.colors.success : theme.colors.warning}
      />
      <View style={{ flex: 1 }}>
        <Text
          variant="bodyStrong"
          color={prerequisite.satisfied ? theme.colors.textPrimary : theme.colors.warning}
        >
          {prerequisite.label}
        </Text>
        <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
          {prerequisite.detail}
        </Text>
      </View>
    </Row>
  );
};
