import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { isInFlight } from '@/domain/entities';
import { useTheme, useViewport } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  PAGE_PADDING,
  PageHeader,
  Pressable,
  Row,
  Screen,
  SegmentedControl,
  Surface,
  Text,
  Toggle,
  type IconName,
} from '@/components/design-system';
import { CabinVisualisation } from '@/features/climate/CabinVisualisation';
import { EmptyState } from '@/components/feedback';
import { useSendCommand, useVehicle, useVehicleState } from '@/hooks';
import { useAppStore, useCommandStore, useUiStore } from '@/stores';
import { simulationControl } from '@/infrastructure/api';

const MIN_TEMP = 16;
const MAX_TEMP = 30;
/** How long the stepper waits after the last tap before it sends one command. */
const COMMIT_DELAY = 700;

/**
 * Climate.
 *
 * White title area over a grouped ground. Four values are kept distinct and
 * are never conflated:
 *
 *  - the measured cabin temperature ("Cabin · 24°"),
 *  - the selected target (the large numeral),
 *  - a pending request (the target is dimmed and labelled while in flight),
 *  - the confirmed climate state (the black power control).
 *
 * Repeated taps on the steppers debounce into a single set_temperature command
 * rather than one command per press. Celsius throughout — this is a Saudi demo.
 */
export default function ClimateScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { width } = useViewport();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const send = useSendCommand();
  const showBanner = useUiStore((s) => s.showBanner);
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const commands = useCommandStore((s) => s.commands);
  const [surface, setSurface] = useState<'heat' | 'cool'>('heat');
  const [focused, setFocused] = useState(true);

  // The cabin's GL surface stops drawing when this screen is not on top.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const patch = useCallback(
    (values: Parameters<typeof simulationControl.patchClimate>[1]) =>
      simulationControl.patchClimate(vehicleId, values),
    [vehicleId],
  );

  const runCommand = useCallback(
    async (...args: Parameters<typeof send>) => {
      const result = await send(...args);
      if (!result.ok) showBanner(result.reason, 'warning');
      return result;
    },
    [send, showBanner],
  );

  // `isInFlight` comes from the domain rather than a local string list: the
  // list previously used here named statuses the state machine never emits
  // ('succeeded', 'timed_out'), so a confirmed command stayed "pending" forever.
  const tempPending = useMemo(
    () =>
      Object.values(commands).some((c) => c.type === 'set_temperature' && isInFlight(c.status)),
    [commands],
  );

  const climatePending = useMemo(
    () =>
      Object.values(commands).some(
        (c) => (c.type === 'start_climate' || c.type === 'stop_climate') && isInFlight(c.status),
      ),
    [commands],
  );

  if (!state || !vehicle) {
    return (
      <Screen>
        <PageHeader title={t('climate.title')} />
        <EmptyState icon="climate" title={t('common.loading')} />
      </Screen>
    );
  }

  if (!vehicle.capabilities.remoteClimate) {
    return (
      <Screen>
        <PageHeader title={t('climate.title')} subtitle={vehicle.name} />
        <View style={{ paddingHorizontal: PAGE_PADDING }}>
          <Surface>
            <Row gap={theme.spacing.md} align="flex-start">
              <Icon name="info" size={19} color={theme.colors.textSecondary} />
              <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                {t('climate.unsupported')}
              </Text>
            </Row>
          </Surface>
        </View>
      </Screen>
    );
  }

  const climate = state.climate;
  const target = climate.targetTempC;

  const nudge = (delta: number) => {
    const next = Math.min(MAX_TEMP, Math.max(MIN_TEMP, target + delta));
    if (next === target) return;
    patch({
      targetTempC: next,
      ...(climate.zonesSynced ? { passengerTargetTempC: next } : {}),
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void runCommand('set_temperature', { payload: { temperatureC: next }, silent: true });
    }, COMMIT_DELAY);
  };

  return (
    <Screen contentStyle={{ paddingBottom: theme.spacing.xxl }}>
      <PageHeader title={t('climate.title')} />

      {/* The cabin being conditioned. Airflow moves only while the vehicle
          reports climate as running, and only from the vents the selected zones
          feed — a pending command animates nothing. */}
      <View style={{ paddingHorizontal: PAGE_PADDING }}>
        <CabinVisualisation
          state={state}
          paintHex={vehicle.paintHex}
          height={(width - PAGE_PADDING * 2) * 0.60}
          active={focused}
        />
      </View>

      <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: theme.spacing.base, gap: theme.spacing.base }}>
        {/* Cabin: measured temperature, selected target, power control. */}
        <Surface padded="loose">
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">
                {`${t('climate.cabin')} · ${Math.round(climate.interiorTempC)}°`}
              </Text>
              <Text variant="numeric" numeric style={{ marginTop: theme.spacing.sm, opacity: tempPending ? 0.45 : 1 }}>
                {`${target.toFixed(target % 1 === 0 ? 0 : 1)}°`}
              </Text>
              <Text variant="micro" color={theme.colors.textSecondary}>
                {tempPending ? t('climate.pending') : t('climate.target')}
              </Text>
            </View>

            <Pressable
              onPress={() => void runCommand(climate.active ? 'stop_climate' : 'start_climate')}
              disabled={climatePending}
              haptic="medium"
              scaleTo={0.93}
              minTouchTarget={false}
              accessibilityRole="button"
              accessibilityLabel={climate.active ? t('climate.fanOff') : t('climate.fanOn')}
              accessibilityState={{ selected: climate.active }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: climate.active ? theme.colors.blue : theme.colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: climatePending ? 0.5 : 1,
              }}
            >
              <Icon
                name="fan"
                size={28}
                color={climate.active ? theme.colors.textInverse : theme.colors.textPrimary}
              />
            </Pressable>
          </Row>

          {/* Decrease, increase, defrost. Blue cools, red heats. */}
          <Row gap={theme.spacing.sm} style={{ marginTop: theme.spacing.lg }}>
            <StepTile
              icon="chevron-down"
              tint={theme.colors.blue}
              label={t('climate.cool')}
              disabled={target <= MIN_TEMP}
              onPress={() => nudge(-0.5)}
            />
            <StepTile
              icon="chevron-up"
              tint={theme.colors.red}
              label={t('climate.heat')}
              disabled={target >= MAX_TEMP}
              onPress={() => nudge(0.5)}
            />
            <StepTile
              icon="defrost"
              tint={climate.frontDefrost ? theme.colors.textInverse : theme.colors.textPrimary}
              label={t('climate.frontDefrost')}
              selected={climate.frontDefrost}
              onPress={() => patch({ frontDefrost: !climate.frontDefrost })}
            />
          </Row>
        </Surface>

        {/* Surfaces: seats and steering wheel, with intensity indicators. */}
        <Surface padded="loose">
          <Text variant="heading">{t('climate.surfaces')}</Text>

          <View style={{ marginTop: theme.spacing.md }}>
            <SegmentedControl
              label={t('climate.surfaces')}
              value={surface}
              onChange={setSurface}
              options={[
                { value: 'heat', label: t('climate.heat') },
                { value: 'cool', label: t('climate.cool') },
              ]}
            />
          </View>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <Row gap={theme.spacing.sm}>
              <SurfaceTile
                icon="seat"
                label={`${t('climate.driver')}`}
                level={surface === 'heat' ? climate.driverSeatHeat : climate.seatVentilation}
                tint={surface === 'heat' ? theme.colors.red : theme.colors.blue}
                onPress={() =>
                  surface === 'heat'
                    ? patch({ driverSeatHeat: (climate.driverSeatHeat + 1) % 4 })
                    : patch({ seatVentilation: (climate.seatVentilation + 1) % 4 })
                }
              />
              <SurfaceTile
                icon="steering"
                label={t('climate.steeringWheel')}
                level={climate.steeringWheelHeat ? 3 : 0}
                tint={theme.colors.red}
                onPress={() => patch({ steeringWheelHeat: !climate.steeringWheelHeat })}
              />
              <SurfaceTile
                icon="seat"
                label={t('climate.passenger')}
                level={surface === 'heat' ? climate.passengerSeatHeat : climate.seatVentilation}
                tint={surface === 'heat' ? theme.colors.red : theme.colors.blue}
                onPress={() =>
                  surface === 'heat'
                    ? patch({ passengerSeatHeat: (climate.passengerSeatHeat + 1) % 4 })
                    : patch({ seatVentilation: (climate.seatVentilation + 1) % 4 })
                }
              />
            </Row>
            <Row gap={theme.spacing.sm}>
              <SurfaceTile
                icon="fan"
                label={t('climate.airflow')}
                level={Math.min(3, Math.round((climate.fanLevel / 5) * 3))}
                tint={theme.colors.blue}
                onPress={() => patch({ fanLevel: (climate.fanLevel + 1) % 6 })}
              />
              <SurfaceTile
                icon="defrost"
                label={t('climate.rearDefrost')}
                level={climate.rearDefrost ? 3 : 0}
                tint={theme.colors.red}
                onPress={() => patch({ rearDefrost: !climate.rearDefrost })}
              />
              <View style={{ flex: 1 }} />
            </Row>
          </View>

          <View style={{ marginTop: theme.spacing.base }}>
            <Toggle
              label={t('climate.syncZones')}
              value={climate.zonesSynced}
              onChange={(value) =>
                patch({
                  zonesSynced: value,
                  ...(value ? { passengerTargetTempC: climate.targetTempC } : {}),
                })
              }
            />
          </View>
        </Surface>

        {/* Departure scheduling as its own simple section. */}
        <Surface padded="loose">
          <Row justify="space-between" align="center" gap={theme.spacing.md}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t('climate.departure')}</Text>
              <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                {`${t('climate.schedule')} · ${climate.departureTime ?? '07:30'}`}
              </Text>
            </View>
            <Toggle
              value={climate.departureEnabled}
              onChange={(v) => patch({ departureEnabled: v })}
              accessibilityLabel={t('climate.departure')}
            />
          </Row>
          <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.sm }}>
            {t('climate.departureBody')}
          </Text>
        </Surface>

        <Text variant="micro" color={theme.colors.textSecondary} style={{ paddingHorizontal: theme.spacing.xs }}>
          {`${t('climate.batteryImpact')}: ~${(((3.5 / vehicle.batteryCapacityKwh) * 100)).toFixed(1)}% per hour. Running climate while plugged in draws from the charger.`}
        </Text>
      </View>
    </Screen>
  );
}

const StepTile = ({
  icon,
  tint,
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  icon: IconName;
  tint: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.96}
      minTouchTarget={false}
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={{
        flex: 1,
        minHeight: 56,
        borderRadius: theme.radius.md,
        backgroundColor: selected ? theme.colors.blue : theme.colors.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={22} color={tint} strokeWidth={2} />
    </Pressable>
  );
};

/** Dark surface tile with small intensity pips, as on the reference screen. */
const SurfaceTile = ({
  icon,
  label,
  level,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  level: number;
  tint: string;
  onPress: () => void;
}) => {
  const theme = useTheme();
  const on = level > 0;

  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      scaleTo={0.96}
      minTouchTarget={false}
      accessibilityRole="button"
      accessibilityLabel={`${label}, level ${level} of 3`}
      accessibilityState={{ selected: on }}
      style={{
        flex: 1,
        minHeight: 64,
        borderRadius: theme.radius.md,
        backgroundColor: on ? theme.colors.inset : theme.colors.soft,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Icon
        name={icon}
        size={22}
        color={on ? tint : theme.colors.textSecondary}
        strokeWidth={1.8}
      />
      <Row gap={3} justify="center">
        {[1, 2, 3].map((step) => (
          <View
            key={step}
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor:
                level >= step ? tint : on ? 'rgba(255,255,255,0.22)' : theme.colors.lineStrong,
            }}
          />
        ))}
      </Row>
    </Pressable>
  );
};
