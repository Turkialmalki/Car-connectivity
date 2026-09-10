import React, { memo, useCallback, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { triggerHaptic } from './Pressable';
import { Text } from './Text';
import { Row } from './Row';

type Props = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Fired once on release, for committing a value to the vehicle. */
  onCommit?: (value: number) => void;
  label: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  tone?: 'electric' | 'desert';
};

const TRACK_HEIGHT = 44;

/**
 * A large, glove-friendly slider.
 *
 * Deliberately chunky: this is a control people reach for while parked in the
 * sun, so the target is a 44pt track rather than a hairline with a small thumb.
 * Detented steps give a haptic tick so the value can be set without looking.
 */
const SliderComponent = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  label,
  formatValue,
  disabled = false,
  tone = 'electric',
}: Props) => {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const startValue = useSharedValue(value);
  const pressed = useSharedValue(0);

  const accent = tone === 'electric' ? theme.colors.electric : theme.colors.desert;
  const ratio = max === min ? 0 : (value - min) / (max - min);

  const emit = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      const snapped = Math.round(clamped / step) * step;
      const rounded = Number(snapped.toFixed(2));
      if (rounded !== value) {
        triggerHaptic('light');
        onChange(rounded);
      }
    },
    [max, min, onChange, step, value],
  );

  const commit = useCallback(() => onCommit?.(value), [onCommit, value]);

  const pan = Gesture.Pan()
    .enabled(!disabled && width > 0)
    .onBegin(() => {
      startValue.value = value;
      pressed.value = withSpring(1, { damping: 20, stiffness: 200 });
    })
    .onUpdate((event) => {
      const delta = (event.translationX / width) * (max - min);
      runOnJS(emit)(startValue.value + delta);
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, { damping: 20, stiffness: 200 });
      runOnJS(commit)();
    });

  const tap = Gesture.Tap()
    .enabled(!disabled && width > 0)
    .onEnd((event) => {
      runOnJS(emit)(min + (event.x / width) * (max - min));
      runOnJS(commit)();
    });

  const gesture = Gesture.Simultaneous(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pressed.value * 0.12 }],
  }));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: formatValue?.(value) }}
      accessibilityState={{ disabled }}
    >
      <Row justify="space-between" style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="caption" color={theme.colors.textSecondary}>
          {label}
        </Text>
        <Text variant="bodyStrong" numeric color={accent}>
          {formatValue ? formatValue(value) : String(value)}
        </Text>
      </Row>
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{
            height: TRACK_HEIGHT,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.soft,
            justifyContent: 'center',
            overflow: 'hidden',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
              backgroundColor: accent,
              opacity: 0.22,
            }}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
                marginLeft: -14,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: accent,
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
};

export const Slider = memo(SliderComponent);
