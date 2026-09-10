import React, { memo } from 'react';
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useTheme, type TypographyVariant } from '@/theme';
import { useI18n, textAlignFor, writingDirectionFor } from '@/i18n';

type Props = TextProps & {
  variant?: TypographyVariant;
  color?: string;
  /** Overrides the automatic RTL-aware alignment. */
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  /** Numeric readouts stay LTR even in Arabic and use tabular figures. */
  numeric?: boolean;
};

const TextComponent = ({
  variant = 'body',
  color,
  align,
  numeric = false,
  style,
  children,
  ...rest
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();

  return (
    <RNText
      // Dynamic type is supported, but capped so a large accessibility size
      // cannot break the vehicle hero layout.
      maxFontSizeMultiplier={variant === 'display' || variant === 'numeric' ? 1.2 : 1.6}
      {...rest}
      style={[
        theme.typography[variant],
        {
          color: color ?? theme.colors.textPrimary,
          textAlign: align ?? (numeric ? 'left' : textAlignFor(isRTL)),
          writingDirection: numeric ? 'ltr' : writingDirectionFor(isRTL),
        },
        // Tabular figures keep live telemetry from jittering as digits change.
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export const Text = memo(TextComponent);
