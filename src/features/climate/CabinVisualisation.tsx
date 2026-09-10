import React, { memo, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { ClimateState, TransientEvent, VehicleState } from '@/domain/entities';
import { useTheme } from '@/theme';
import { Row, Text } from '@/components/design-system';
import { VehicleScene } from '@/components/vehicle-3d';
import { useAppStore, useCommandStore } from '@/stores';
import { selectPresentedEventIds } from '@/stores/command-store';

/**
 * Cabin visualisation for the climate screen.
 *
 * The same articulated model as Home and Controls, framed from the driver's
 * seat, with airflow drawn over it. Two rules:
 *
 *  - Airflow animates only while the vehicle REPORTS climate as active. A
 *    pending start_climate shows nothing moving, because nothing is moving.
 *  - The vents that animate are the ones the selected zones actually feed, and
 *    their speed follows the reported fan level rather than a fixed loop.
 *
 * The airflow is UI motion, so it lives in Reanimated. The vehicle itself is
 * rendered by three.js in its own loop; the two never share a worklet.
 */

export type CabinVisualisationProps = {
  state: VehicleState;
  paintHex: string;
  height: number;
  active: boolean;
};

/** Vent positions as fractions of the visualisation box. */
const VENTS = [
  { key: 'driverOuter', x: 0.12, zone: 'driver' as const },
  { key: 'driverInner', x: 0.36, zone: 'driver' as const },
  { key: 'passengerInner', x: 0.62, zone: 'passenger' as const },
  { key: 'passengerOuter', x: 0.86, zone: 'passenger' as const },
];

const CabinVisualisationComponent = ({
  state,
  paintHex,
  height,
  active,
}: CabinVisualisationProps) => {
  const theme = useTheme();
  const climate = state.climate;
  const presentedEventIds = useCommandStore(selectPresentedEventIds);
  const markEventPresented = useCommandStore((s) => s.markEventPresented);
  const ambientMotion = useAppStore((s) => s.ambientMotionEnabled);

  const onEventPresented = useCallback(
    (event: TransientEvent) => markEventPresented(event),
    [markEventPresented],
  );

  const running = climate.active && active && ambientMotion;

  return (
    <View style={{ height, borderRadius: theme.radius.lg, overflow: 'hidden' }}>
      <VehicleScene
        state={state}
        preset="cabin"
        paintHex={paintHex}
        active={active}
        presentedEventIds={presentedEventIds}
        onEventPresented={onEventPresented}
        accessibilityLabel={describeCabin(climate)}
        style={{ flex: 1 }}
      />

      {/* Airflow overlay. Pointer-events off so it never eats a tap meant for
          the controls beneath. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {VENTS.map((vent, index) => (
          <AirflowPlume
            key={vent.key}
            x={vent.x}
            height={height}
            running={running}
            fanLevel={climate.fanLevel}
            delayMs={index * 190}
            tint={ventTint(climate, vent.zone, theme.colors.blue, theme.colors.desert)}
          />
        ))}
      </View>

      {/* Which zones are selected, and what each is set to. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.spacing.base,
          paddingVertical: theme.spacing.sm,
          backgroundColor: 'rgba(8,10,12,0.62)',
        }}
      >
        <Row justify="space-between">
          <ZoneChip
            label="Driver"
            value={`${Math.round(climate.targetTempC)}°`}
            on={climate.active}
          />
          <Text variant="micro" color={theme.colors.textInverseSecondary}>
            {climate.active ? `Fan ${climate.fanLevel}/5` : 'Off'}
          </Text>
          <ZoneChip
            label={climate.zonesSynced ? 'Passenger (synced)' : 'Passenger'}
            value={`${Math.round(climate.passengerTargetTempC)}°`}
            on={climate.active}
          />
        </Row>
      </View>
    </View>
  );
};

/**
 * One plume of moving air.
 *
 * Driven by a repeating Reanimated timing rather than a per-frame React update.
 * The animation is cancelled — not merely paused — when climate stops, so no
 * worklet keeps running behind an inactive screen.
 */
const AirflowPlume = ({
  x,
  height,
  running,
  fanLevel,
  delayMs,
  tint,
}: {
  x: number;
  height: number;
  running: boolean;
  fanLevel: number;
  delayMs: number;
  tint: string;
}) => {
  const progress = useSharedValue(0);
  const startedAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running || fanLevel <= 0) {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 220 });
      return;
    }
    // Higher fan levels move air faster. Level 5 is roughly twice level 1.
    const duration = 2100 - fanLevel * 220;
    startedAt.current = setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    }, delayMs);
    return () => {
      if (startedAt.current) clearTimeout(startedAt.current);
      cancelAnimation(progress);
    };
  }, [running, fanLevel, delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : Math.sin(progress.value * Math.PI) * 0.55,
    transform: [{ translateY: -progress.value * height * 0.30 }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${x * 100}%`,
          top: height * 0.52,
          width: 3,
          height: height * 0.24,
          borderRadius: 2,
          backgroundColor: tint,
        },
        style,
      ]}
    />
  );
};

const ZoneChip = ({ label, value, on }: { label: string; value: string; on: boolean }) => {
  const theme = useTheme();
  return (
    <View>
      <Text variant="micro" color="rgba(255,255,255,0.5)" style={{ fontSize: 9 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        variant="micro"
        color={on ? theme.colors.textInverse : theme.colors.textInverseSecondary}
        numeric
      >
        {value}
      </Text>
    </View>
  );
};

/** Cool air reads blue, warm air reads warm — per zone target vs cabin. */
const ventTint = (
  climate: ClimateState,
  zone: 'driver' | 'passenger',
  cool: string,
  warm: string,
): string => {
  const target = zone === 'driver' ? climate.targetTempC : climate.passengerTargetTempC;
  return target < climate.interiorTempC ? cool : warm;
};

const describeCabin = (climate: ClimateState): string =>
  climate.active
    ? `Cabin view. Climate running, fan ${climate.fanLevel} of 5, driver ${Math.round(climate.targetTempC)} degrees, passenger ${Math.round(climate.passengerTargetTempC)} degrees, cabin ${Math.round(climate.interiorTempC)} degrees.`
    : `Cabin view. Climate off, cabin ${Math.round(climate.interiorTempC)} degrees.`;

export const CabinVisualisation = memo(CabinVisualisationComponent);
