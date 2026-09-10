import React, { memo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  /** Charcoal fill: the confirmed or emphasised state. */
  selected?: boolean;
  disabled?: boolean;
  pending?: boolean;
  size?: number;
  accessibilityHint?: string;
};

/**
 * The circular vehicle control used on the home screen.
 *
 * `selected` reflects the vehicle's confirmed state, never the last button the
 * user pressed — a lock control shows charcoal because the vehicle reported
 * itself locked, not because the user tapped Lock.
 */
const CircleButtonComponent = ({
  icon,
  label,
  onPress,
  selected = false,
  disabled = false,
  pending = false,
  size = 64,
  accessibilityHint,
}: Props) => {
  const theme = useTheme();
  const background = selected ? theme.colors.blue : theme.colors.soft;
  const foreground = selected ? theme.colors.textInverse : theme.colors.textPrimary;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, minWidth: size }}>
      <Pressable
        onPress={onPress}
        disabled={disabled || pending}
        haptic="medium"
        scaleTo={0.93}
        minTouchTarget={false}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected, disabled: disabled || pending }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {pending ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : (
          <Icon name={icon} size={size * 0.36} color={foreground} strokeWidth={1.8} />
        )}
      </Pressable>
      <Text variant="micro" color={theme.colors.textSecondary} align="center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

export const CircleButton = memo(CircleButtonComponent);
