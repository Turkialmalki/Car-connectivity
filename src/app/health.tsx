import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Surface,
  Text,
  ListRow,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import { CONNECTIVITY_COPY, type TirePressure } from '@/domain/entities';
import { useVehicle, useVehicleState } from '@/hooks';
import { useAppStore } from '@/stores';
import { formatPressure } from '@/utils/format';
import { dayMonth, relativeTime } from '@/utils/time';

/**
 * Vehicle health.
 *
 * Every value here is a normalized domain signal. Raw CAN frames and DTC codes
 * are deliberately absent: the cloud normalizes them into codes like
 * TPMS_PRESSURE_LOW_RL, and the consumer app renders meaning, not bus traffic.
 */
export default function HealthScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const units = useAppStore((s) => s.units);

  if (!state || !vehicle) {
    return (
      <Screen>
        <EmptyState icon="wrench" title={t('common.loading')} />
      </Screen>
    );
  }

  const health = state.health;
  const overallTone =
    health.overall === 'ok' ? 'success' : health.overall === 'attention' ? 'warning' : 'critical';

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader title={t('health.title')} subtitle={`${vehicle.name} · ${vehicle.trim}`} />

      {/* Overall */}
      <Surface>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text variant="mono" color={theme.colors.textTertiary}>
              {t('health.overall').toUpperCase()}
            </Text>
            <Text variant="heading" style={{ marginTop: 6 }}>
              {health.overall === 'ok'
                ? 'All systems normal'
                : health.overall === 'attention'
                  ? 'Attention needed'
                  : 'Service required'}
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
              Last full diagnostic {relativeTime(health.lastDiagnosticAt)}
            </Text>
          </View>
          <StatusPill
            label={
              health.overall === 'ok'
                ? 'OK'
                : health.overall === 'attention'
                  ? 'Attention'
                  : 'Critical'
            }
            tone={overallTone}
          />
        </Row>
      </Surface>

      {/* Warnings */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('health.warnings')} />
        {health.warnings.length === 0 ? (
          <Surface tone="soft">
            <Row gap={theme.spacing.md}>
              <Icon name="check" size={19} color={theme.colors.success} />
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('health.allGood')}
              </Text>
            </Row>
          </Surface>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {health.warnings.map((warning) => (
              <Surface key={warning.id}>
                <Row gap={theme.spacing.md} align="flex-start">
                  <Icon
                    name="alert"
                    size={19}
                    color={
                      warning.severity === 'critical' ? theme.colors.critical : theme.colors.warning
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{warning.title}</Text>
                    <Text
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={{ marginTop: 4 }}
                    >
                      {warning.detail}
                    </Text>
                    <Row justify="space-between" style={{ marginTop: theme.spacing.sm }}>
                      <Text variant="mono" color={theme.colors.textTertiary}>
                        {warning.code}
                      </Text>
                      <Text variant="micro" color={theme.colors.textTertiary}>
                        {relativeTime(warning.raisedAt)}
                      </Text>
                    </Row>
                  </View>
                </Row>
              </Surface>
            ))}
          </View>
        )}
      </View>

      {/* Tyres */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('health.tires')} />
        <Surface>
          <Row wrap gap={theme.spacing.base} justify="space-between">
            {health.tires.map((tire) => (
              <TireReadout key={tire.position} tire={tire} units={units} />
            ))}
          </Row>
        </Surface>
      </View>

      {/* Battery health */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('health.batteryHealth')} />
        <Surface>
          <Row justify="space-between" style={{ marginBottom: theme.spacing.md }}>
            <Text variant="body" color={theme.colors.textSecondary}>
              Usable capacity retained
            </Text>
            <Text variant="subheading" numeric color={theme.colors.electric}>
              {health.batteryHealthPercent}%
            </Text>
          </Row>
          <ProgressBar
            progress={health.batteryHealthPercent / 100}
            tone={health.batteryHealthPercent > 90 ? 'success' : 'warning'}
            label="Battery health"
          />
          <Text
            variant="caption"
            color={theme.colors.textSecondary}
            style={{ marginTop: theme.spacing.md }}
          >
            Estimated from{' '}
            {(vehicle.batteryCapacityKwh * (health.batteryHealthPercent / 100)).toFixed(1)} kWh
            usable of {vehicle.batteryCapacityKwh} kWh nominal, measured across recent full charge
            cycles.
          </Text>
        </Surface>
      </View>

      {/* System info */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('health.diagnostics')} />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="download"
              title={t('health.software')}
              value={health.softwareVersion}
              subtitle={
                vehicle.capabilities.otaUpdates
                  ? 'Over-the-air updates enabled'
                  : 'Updates require a service visit'
              }
              onPress={() => router.push('/ota')}
            />
            <ListRow
              icon="signal"
              title={t('health.connectivity')}
              value={CONNECTIVITY_COPY[state.connectivity].label}
              subtitle={CONNECTIVITY_COPY[state.connectivity].detail}
              showChevron={false}
            />
            <ListRow
              icon="wrench"
              title={t('health.serviceDue')}
              value={dayMonth(health.serviceDueDate)}
              subtitle={`or in ${health.serviceDueKm.toLocaleString()} km, whichever comes first`}
              showChevron={false}
            />
            <ListRow
              icon="car"
              title="Odometer"
              value={`${health.odometerKm.toLocaleString()} km`}
              showChevron={false}
            />
          </View>
        </Surface>
      </View>

      <Surface tone="soft" style={{ marginTop: theme.spacing.xl }}>
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="info" size={19} color={theme.colors.textSecondary} />
          <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
            Everything on this screen is a normalized signal. The vehicle&apos;s internal bus
            traffic and diagnostic trouble codes are translated by the connected cloud into the
            domain codes shown above — a consumer app should never render raw CAN frames.
          </Text>
        </Row>
      </Surface>
    </Screen>
  );
}

const TireReadout = ({ tire, units }: { tire: TirePressure; units: 'metric' | 'imperial' }) => {
  const theme = useTheme();
  const pressure = formatPressure(tire.pressureKpa, units);
  const deviation = tire.pressureKpa - tire.recommendedKpa;
  const low = deviation < -15;
  const high = deviation > 20;
  const color = low || high ? theme.colors.warning : theme.colors.textPrimary;

  const positionLabel = {
    FL: 'Front left',
    FR: 'Front right',
    RL: 'Rear left',
    RR: 'Rear right',
  }[tire.position];

  return (
    <View
      accessible
      accessibilityLabel={`${positionLabel} tyre, ${pressure.value} ${pressure.unit}${low ? ', low' : ''}`}
      style={{ width: '46%', gap: 4 }}
    >
      <Text variant="mono" color={theme.colors.textTertiary}>
        {tire.position}
      </Text>
      <Row align="flex-end" gap={3}>
        <Text variant="numericSm" numeric color={color}>
          {pressure.value}
        </Text>
        <Text variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 3 }}>
          {pressure.unit}
        </Text>
      </Row>
      <Text variant="micro" color={low ? theme.colors.warning : theme.colors.textTertiary}>
        {low ? 'Below target' : high ? 'Above target' : 'Normal'} · {tire.temperatureC}°C
      </Text>
    </View>
  );
};
