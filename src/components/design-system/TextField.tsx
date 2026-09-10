import React, { memo, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n, textAlignFor } from '@/i18n';
import { Text } from './Text';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
};

const TextFieldComponent = ({ label, error, hint, style, ...rest }: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textTertiary}
        selectionColor={theme.colors.electric}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        {...rest}
        style={[
          {
            backgroundColor: theme.colors.soft,
            borderRadius: theme.radius.lg,
            paddingHorizontal: theme.spacing.base,
            paddingVertical: theme.spacing.base,
            color: theme.colors.textPrimary,
            fontSize: 16,
            borderWidth: 1,
            borderColor: error
              ? theme.colors.critical
              : focused
                ? theme.colors.electric
                : theme.colors.line,
            textAlign: textAlignFor(isRTL),
          },
          style,
        ]}
      />
      {(error || hint) && (
        <Text
          variant="micro"
          color={error ? theme.colors.critical : theme.colors.textTertiary}
          style={{ marginTop: 6 }}
        >
          {error ?? hint}
        </Text>
      )}
    </View>
  );
};

export const TextField = memo(TextFieldComponent);
