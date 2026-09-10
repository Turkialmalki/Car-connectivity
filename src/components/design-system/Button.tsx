import React, { memo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n, rowDirectionFor } from '@/i18n';
import { Pressable, type HapticStyle } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'quiet';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  haptic?: HapticStyle;
  accessibilityHint?: string;
  /** For actions sitting on photography or charcoal. */
  onDark?: boolean;
};

const ButtonComponent = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  haptic = 'medium',
  accessibilityHint,
  onDark = false,
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();

  const background = {
    primary: theme.colors.blue,
    secondary: onDark ? 'rgba(255,255,255,0.16)' : theme.colors.soft,
    ghost: theme.colors.transparent,
    quiet: theme.colors.transparent,
    destructive: theme.colors.redDim,
  }[variant];

  const foreground = {
    primary: theme.colors.textInverse,
    secondary: onDark ? theme.colors.textInverse : theme.colors.textPrimary,
    ghost: onDark ? theme.colors.textInverse : theme.colors.textPrimary,
    quiet: onDark ? theme.colors.textInverseSecondary : theme.colors.textSecondary,
    destructive: theme.colors.red,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic}
      scaleTo={0.985}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={{
        backgroundColor: background,
        borderRadius: theme.radius.md,
        minHeight: variant === 'quiet' ? 40 : 50,
        justifyContent: 'center',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: onDark ? theme.colors.charcoalLine : theme.colors.line,
      }}
    >
      <View
        style={{
          flexDirection: rowDirectionFor(isRTL),
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : icon ? (
          <Icon name={icon} size={18} color={foreground} />
        ) : null}
        <Text variant="bodyStrong" color={foreground} align="center">
          {label}
        </Text>
      </View>
    </Pressable>
  );
};

export const Button = memo(ButtonComponent);
