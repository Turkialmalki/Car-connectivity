import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';
import { Text } from '../design-system/Text';

type Props = {
  percent: number;
  size?: number;
  /** Charging draws the arc in the electric accent regardless of level. */
  charging?: boolean;
  label?: string;
};

/**
 * Battery state of charge as a single open arc.
 *
 * An arc rather than a chart: state of charge is one number that matters at a
 * glance, and a gauge reads faster than any plot. Colour carries the warning —
 * amber under 20%, red under 10% — so level is legible without reading digits.
 */
const BatteryArcComponent = ({ percent, size = 168, charging = false, label }: Props) => {
  const theme = useTheme();
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Open 270° gauge, so the arc reads as an instrument, not a pie.
  const sweep = 0.75;
  const clamped = Math.max(0, Math.min(100, percent));

  const color = charging
    ? theme.colors.electric
    : clamped <= 10
      ? theme.colors.critical
      : clamped <= 20
        ? theme.colors.warning
        : theme.colors.electric;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Battery state of charge'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="arc" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0.55" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.soft}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * sweep} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#arc)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * sweep * (clamped / 100)} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="numeric" numeric color={theme.colors.textPrimary}>
        {Math.round(clamped)}
        <Text variant="numericSm" numeric color={theme.colors.textSecondary}>
          %
        </Text>
      </Text>
      {label && (
        <Text variant="micro" color={theme.colors.textTertiary} style={{ marginTop: 2 }}>
          {label}
        </Text>
      )}
    </View>
  );
};

export const BatteryArc = memo(BatteryArcComponent);
