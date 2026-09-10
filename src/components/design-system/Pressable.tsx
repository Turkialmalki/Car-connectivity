import React, { useCallback } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme, MIN_TOUCH_TARGET } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'none';

export const triggerHaptic = (style: HapticStyle = 'light') => {
  if (style === 'none' || Platform.OS === 'web') return;
  switch (style) {
    case 'success':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'error':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case 'medium':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    default:
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  haptic?: HapticStyle;
  /** How far the surface presses in. Larger controls press less. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  minTouchTarget?: boolean;
};

/**
 * The single press primitive for the whole app.
 * Every interactive surface goes through here so press feedback, haptics and
 * minimum touch target are consistent and cannot be forgotten.
 */
export const Pressable = ({
  children,
  haptic = 'light',
  scaleTo = 0.96,
  style,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  minTouchTarget = true,
  ...rest
}: Props) => {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      scale.value = withSpring(scaleTo, theme.motion.springSnappy);
      onPressIn?.(event);
    },
    [onPressIn, scale, scaleTo, theme.motion.springSnappy],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      scale.value = withSpring(1, theme.motion.spring);
      onPressOut?.(event);
    },
    [onPressOut, scale, theme.motion.spring],
  );

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (!disabled) triggerHaptic(haptic);
      onPress?.(event);
    },
    [disabled, haptic, onPress],
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      {...rest}
      style={[
        minTouchTarget ? { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' } : null,
        { opacity: disabled ? 0.42 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};
