import React, { memo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme';

type Props = {
  /** 0 to 1. */
  progress: number;
  tone?: 'electric' | 'success' | 'warning' | 'critical' | 'desert';
  height?: number;
  label?: string;
};

const ProgressBarComponent = ({ progress, tone = 'electric', height = 8, label }: Props) => {
  const theme = useTheme();
  const color = {
    electric: theme.colors.electric,
    success: theme.colors.success,
    warning: theme.colors.warning,
    critical: theme.colors.critical,
    desert: theme.colors.desert,
  }[tone];

  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(`${Math.max(0, Math.min(1, progress)) * 100}%`, {
      duration: theme.reduceMotion ? 0 : theme.motion.timing,
    }),
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.soft,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: color }, fillStyle]} />
    </View>
  );
};

export const ProgressBar = memo(ProgressBarComponent);
