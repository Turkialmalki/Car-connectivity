import React, { memo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Row } from './Row';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Accessible name when the toggle is rendered bare, without a visible label. */
  accessibilityLabel?: string;
};

const ToggleComponent = ({
  value,
  onChange,
  label,
  description,
  disabled = false,
  disabledReason,
  accessibilityLabel,
}: Props) => {
  const theme = useTheme();

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(value ? 20 : 2, theme.motion.springSnappy) }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: withSpring(
      value ? theme.colors.electric : theme.colors.soft,
    ) as unknown as string,
  }));

  const control = (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      haptic="light"
      scaleTo={0.94}
      minTouchTarget={false}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label ?? accessibilityLabel}
      accessibilityHint={disabled ? disabledReason : undefined}
      style={{ padding: 6 }}
    >
      <Animated.View
        style={[{ width: 50, height: 30, borderRadius: 15, justifyContent: 'center' }, trackStyle]}
      >
        <Animated.View
          style={[
            {
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: value ? theme.colors.base : theme.colors.textSecondary,
            },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );

  if (!label) return control;

  return (
    <Row justify="space-between" align="center" gap={theme.spacing.base}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={disabled ? theme.colors.textTertiary : undefined}>
          {label}
        </Text>
        {(description || (disabled && disabledReason)) && (
          <Text
            variant="caption"
            color={disabled ? theme.colors.textTertiary : theme.colors.textSecondary}
            style={{ marginTop: 2 }}
          >
            {disabled && disabledReason ? disabledReason : description}
          </Text>
        )}
      </View>
      {control}
    </Row>
  );
};

export const Toggle = memo(ToggleComponent);
