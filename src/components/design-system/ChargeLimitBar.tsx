import React, { memo, useCallback, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Text } from './Text';
import { triggerHaptic } from './Pressable';

type Props = {
  /** Measured state of charge reported by the vehicle. */
  batteryPercent: number;
  /** The limit the user has selected. A different value, shown differently. */
  limitPercent: number;
  onChange: (value: number) => void;
  /** Fired once when the drag settles, so one gesture is one command. */
  onCommit: (value: number) => void;
  disabled?: boolean;
  /** Lowest limit the vehicle will accept. The axis still starts at zero. */
  minLimit?: number;
};

const HEIGHT = 56;
const KNOB = 40;

/**
 * The charge visualisation.
 *
 * Two values live here and they are NOT the same thing: the green fill is the
 * battery's measured state of charge, and the knob is the charge limit the user
 * has chosen. Dragging the knob moves the limit only — the measured percentage
 * keeps reporting what the vehicle says until the vehicle says otherwise.
 *
 * The drag emits `onChange` locally for a responsive knob and `onCommit`
 * exactly once on release, so a drag is one vehicle command rather than one per
 * animation frame.
 */
const ChargeLimitBarComponent = ({
  batteryPercent,
  limitPercent,
  onChange,
  onCommit,
  disabled = false,
  minLimit = 50,
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const [width, setWidth] = useState(0);
  const latest = useRef(limitPercent);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  const valueAt = useCallback(
    (x: number) => {
      if (width <= 0) return limitPercent;
      // The axis is a true 0–100 battery gauge, so the green fill can be read
      // as a state of charge; only the selectable limit is clamped.
      const ratio = Math.min(Math.max((isRTL ? width - x : x) / width, 0), 1);
      return Math.min(100, Math.max(minLimit, Math.round(ratio * 100)));
    },
    [width, isRTL, limitPercent, minLimit],
  );

  const move = useCallback(
    (x: number) => {
      const next = valueAt(x);
      if (next !== latest.current) {
        latest.current = next;
        onChange(next);
      }
    },
    [valueAt, onChange],
  );

  const commit = useCallback(() => {
    triggerHaptic('light');
    onCommit(latest.current);
  }, [onCommit]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => runOnJS(move)(e.x))
    .onUpdate((e) => runOnJS(move)(e.x))
    .onFinalize(() => runOnJS(commit)());

  const fraction = (v: number) => Math.min(Math.max(v / 100, 0), 1);
  const fill = width * fraction(batteryPercent);
  const knobX = Math.min(
    Math.max(width * fraction(limitPercent) - KNOB / 2, 0),
    Math.max(width - KNOB, 0),
  );

  return (
    <View>
      <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', marginBottom: theme.spacing.sm }}>
        <Text variant="bodyStrong" numeric>{`${limitPercent}%`}</Text>
      </View>

      <GestureDetector gesture={pan}>
        <View
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Charge limit ${limitPercent} percent. Battery is at ${batteryPercent} percent.`}
          accessibilityValue={{ min: minLimit, max: 100, now: limitPercent }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === 'increment' ? 5 : -5;
            const next = Math.min(100, Math.max(minLimit, limitPercent + step));
            latest.current = next;
            onChange(next);
            onCommit(next);
          }}
          style={{
            height: HEIGHT,
            borderRadius: HEIGHT / 2,
            backgroundColor: theme.colors.inset,
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
            overflow: 'hidden',
          }}
        >
          {/* Measured state of charge. */}
          <View
            style={{
              position: 'absolute',
              [isRTL ? 'right' : 'left']: 0,
              top: 0,
              bottom: 0,
              width: fill,
              backgroundColor: theme.colors.green,
              borderRadius: HEIGHT / 2,
            }}
          />
          {/* Selected limit. */}
          <View
            style={{
              position: 'absolute',
              [isRTL ? 'right' : 'left']: knobX,
              width: KNOB,
              height: KNOB,
              top: (HEIGHT - KNOB) / 2,
              borderRadius: KNOB / 2,
              backgroundColor: theme.colors.charcoal,
            }}
          />
        </View>
      </GestureDetector>

      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          marginTop: theme.spacing.sm,
        }}
      >
        <Text variant="micro" color={theme.colors.textSecondary}>
          {`Battery ${batteryPercent}%`}
        </Text>
        <Text variant="micro" color={theme.colors.textSecondary}>
          {`Limit ${limitPercent}%`}
        </Text>
      </View>
    </View>
  );
};

export const ChargeLimitBar = memo(ChargeLimitBarComponent);
