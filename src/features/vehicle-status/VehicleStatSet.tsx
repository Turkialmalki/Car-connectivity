import React, { memo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Vehicle, VehicleState } from '@/domain/entities';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Pressable, Row, Surface, Text } from '@/components/design-system';
import { useAppStore } from '@/stores';
import { formatRange, formatTemp } from '@/utils/format';

/**
 * Primary readouts.
 *
 * Battery and range get the large numeric treatment because they are the two
 * facts a driver actually opens the app for. Everything else is a compact
 * secondary row — present, but never competing.
 */
const VehicleStatSetComponent = ({ state, vehicle }: { state: VehicleState; vehicle: Vehicle }) => {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const units = useAppStore((s) => s.units);

  const range = formatRange(state.charge.estimatedRangeKm, units);
  const interior = formatTemp(state.climate.interiorTempC, units);
  const exterior = formatTemp(state.climate.exteriorTempC, units);

  const batteryColor =
    state.charge.batteryPercent <= 10
      ? theme.colors.critical
      : state.charge.batteryPercent <= 20
        ? theme.colors.warning
        : theme.colors.electric;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Row gap={theme.spacing.md}>
        <Pressable
          onPress={() => router.push('/energy')}
          haptic="light"
          scaleTo={0.98}
          accessibilityLabel={`${t('vehicle.battery')} ${Math.round(state.charge.batteryPercent)} percent`}
          style={{ flex: 1 }}
        >
          <Surface padded="loose">
            <Text variant="mono" color={theme.colors.textTertiary}>
              {t('vehicle.battery').toUpperCase()}
            </Text>
            <Row align="flex-end" gap={2} style={{ marginTop: theme.spacing.sm }}>
              <Text variant="numeric" numeric color={batteryColor}>
                {Math.round(state.charge.batteryPercent)}
              </Text>
              <Text
                variant="numericSm"
                numeric
                color={theme.colors.textSecondary}
                style={{ marginBottom: 4 }}
              >
                %
              </Text>
            </Row>
          </Surface>
        </Pressable>

        <Pressable
          onPress={() => router.push('/energy')}
          haptic="light"
          scaleTo={0.98}
          accessibilityLabel={`${t('vehicle.range')} ${range.value} ${range.unit}`}
          style={{ flex: 1 }}
        >
          <Surface padded="loose">
            <Text variant="mono" color={theme.colors.textTertiary}>
              {t('vehicle.range').toUpperCase()}
            </Text>
            <Row align="flex-end" gap={4} style={{ marginTop: theme.spacing.sm }}>
              <Text variant="numeric" numeric>
                {range.value}
              </Text>
              <Text
                variant="numericSm"
                numeric
                color={theme.colors.textSecondary}
                style={{ marginBottom: 4 }}
              >
                {range.unit}
              </Text>
            </Row>
          </Surface>
        </Pressable>
      </Row>

      <Surface>
        <Row justify="space-between" wrap gap={theme.spacing.base}>
          <Stat
            label={t('vehicle.status')}
            value={state.isMoving ? t('vehicle.driving') : t('vehicle.parked')}
          />
          <Stat label={t('vehicle.gear')} value={state.gear} />
          <Stat
            label={t('vehicle.interior')}
            value={`${interior.value}${interior.unit}`}
            icon="temperature"
          />
          <Stat label={t('vehicle.exterior')} value={`${exterior.value}${exterior.unit}`} />
        </Row>
        <View
          style={{
            height: 1,
            backgroundColor: theme.colors.line,
            marginVertical: theme.spacing.base,
          }}
        />
        <Row justify="space-between">
          <Row gap={theme.spacing.sm}>
            <Icon name="location" size={15} color={theme.colors.textTertiary} />
            <Text variant="caption" color={theme.colors.textSecondary}>
              {state.location.city} · {state.location.addressLabel}
            </Text>
          </Row>
          <Text variant="micro" color={theme.colors.textTertiary}>
            {vehicle.trim}
          </Text>
        </Row>
      </Surface>
    </View>
  );
};

const Stat = ({ label, value, icon }: { label: string; value: string; icon?: 'temperature' }) => {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="mono" color={theme.colors.textTertiary}>
        {label.toUpperCase()}
      </Text>
      <Row gap={4} style={{ marginTop: 4 }}>
        {icon && <Icon name={icon} size={14} color={theme.colors.textSecondary} />}
        <Text variant="subheading" numeric>
          {value}
        </Text>
      </Row>
    </View>
  );
};

export const VehicleStatSet = memo(VehicleStatSetComponent);
