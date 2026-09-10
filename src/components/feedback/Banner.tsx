import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Icon, Row, Text, Pressable } from '../design-system';

export type BannerTone = 'info' | 'success' | 'warning' | 'critical';

type Props = {
  message: string;
  tone?: BannerTone;
  onDismiss: () => void;
  autoDismissMs?: number;
};

/**
 * Transient banner used for refusals and confirmations that do not deserve a
 * full sheet — for example "Plug in the charging cable to start a session."
 */
export const Banner = ({ message, tone = 'info', onDismiss, autoDismissMs = 4200 }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoDismissMs, message]);

  const color = {
    info: theme.colors.textPrimary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    critical: theme.colors.critical,
  }[tone];

  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert';

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(20)}
      exiting={FadeOutUp.duration(200)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + theme.spacing.sm,
        left: theme.spacing.base,
        right: theme.spacing.base,
        zIndex: 100,
      }}
    >
      <Pressable
        onPress={onDismiss}
        haptic="none"
        scaleTo={0.99}
        accessibilityLabel={message}
        accessibilityRole="alert"
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.base,
          borderWidth: 1,
          borderColor: theme.colors.line,
          ...theme.elevation.high,
        }}
      >
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name={icon} size={19} color={color} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" color={theme.colors.textPrimary}>
              {message}
            </Text>
          </View>
        </Row>
      </Pressable>
    </Animated.View>
  );
};
