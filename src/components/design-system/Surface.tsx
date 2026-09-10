import React, { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

type Props = {
  children?: React.ReactNode;
  /**
   * `elevated` is a white card on the grouped ground, `soft` is the grouped
   * ground itself used as an inset block, `outline` is a hairline-only box.
   */
  tone?: 'elevated' | 'soft' | 'outline' | 'dark';
  padded?: boolean | 'tight' | 'loose';
  radius?: 'md' | 'lg' | 'xl' | 'xxl';
  style?: StyleProp<ViewStyle>;
};

/**
 * Grouped surface. Hierarchy comes from the surface change and its hairline,
 * not from shadow — the system uses almost none.
 */
const SurfaceComponent = ({
  children,
  tone = 'elevated',
  padded = true,
  radius = 'lg',
  style,
}: Props) => {
  const theme = useTheme();
  const padding =
    padded === false
      ? 0
      : padded === 'tight'
        ? theme.spacing.md
        : padded === 'loose'
          ? theme.spacing.xl
          : theme.spacing.base;

  const background = {
    elevated: theme.colors.surface,
    soft: theme.colors.soft,
    outline: theme.colors.transparent,
    dark: theme.colors.charcoalSoft,
  }[tone];

  return (
    <View
      style={[
        {
          backgroundColor: background,
          borderRadius: theme.radius[radius],
          padding,
          borderWidth: tone === 'soft' ? 0 : 1,
          borderColor: tone === 'dark' ? theme.colors.charcoalLine : theme.colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Surface = memo(SurfaceComponent);
