import React, { memo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Row } from './Row';
import { Text } from './Text';

export type PillTone = 'neutral' | 'electric' | 'success' | 'warning' | 'critical' | 'desert';

type Props = {
  label: string;
  tone?: PillTone;
  /** Slow breathing dot, used for "live" and in-flight states. */
  pulse?: boolean;
  compact?: boolean;
};

const StatusPillComponent = ({
  label,
  tone = 'neutral',
  pulse = false,
  compact = false,
}: Props) => {
  const theme = useTheme();
  const opacity = useSharedValue(1);

  const toneColor = {
    neutral: theme.colors.textSecondary,
    electric: theme.colors.electric,
    success: theme.colors.success,
    warning: theme.colors.warning,
    critical: theme.colors.critical,
    desert: theme.colors.desert,
  }[tone];

  const toneBackground = {
    neutral: theme.colors.soft,
    electric: theme.colors.electricDim,
    success: theme.colors.successDim,
    warning: theme.colors.warningDim,
    critical: theme.colors.criticalDim,
    desert: theme.colors.desertDim,
  }[tone];

  React.useEffect(() => {
    // Reduced-motion users get a steady dot rather than a pulsing one.
    if (pulse && !theme.reduceMotion) {
      opacity.value = withRepeat(withTiming(0.3, { duration: 1100 }), -1, true);
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
    return () => cancelAnimation(opacity);
  }, [pulse, theme.reduceMotion, opacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        backgroundColor: toneBackground,
        borderRadius: theme.radius.pill,
        paddingHorizontal: compact ? theme.spacing.sm : theme.spacing.md,
        paddingVertical: compact ? 4 : 6,
        alignSelf: 'flex-start',
      }}
    >
      <Row gap={6}>
        <Animated.View
          style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }, dotStyle]}
        />
        <Text variant="micro" color={toneColor}>
          {label}
        </Text>
      </Row>
    </View>
  );
};

export const StatusPill = memo(StatusPillComponent);
