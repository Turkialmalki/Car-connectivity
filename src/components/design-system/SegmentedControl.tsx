import React, { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Row } from './Row';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

function SegmentedControlComponent<T extends string>({
  options,
  value,
  onChange,
  label,
}: Props<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}>
      <Row
        gap={4}
        style={{
          backgroundColor: theme.colors.soft,
          borderRadius: theme.radius.lg,
          padding: 4,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              haptic="light"
              scaleTo={0.97}
              minTouchTarget={false}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: selected ? theme.colors.surface : theme.colors.transparent,
                alignItems: 'center',
              }}
            >
              <Text
                variant="caption"
                align="center"
                color={selected ? theme.colors.textPrimary : theme.colors.textSecondary}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

export const SegmentedControl = memo(SegmentedControlComponent) as typeof SegmentedControlComponent;
