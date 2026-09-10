import React, { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, Pressable, Row, Text, type IconName } from '@/components/design-system';

/**
 * Discrete level control (seat heat, ventilation, fan speed).
 *
 * Segments rather than a slider: these are 0–3 or 0–5 values where each step
 * means something specific, and a segmented row lets you jump straight to
 * "maximum" with one tap instead of dragging.
 */
const StepperRowComponent = ({
  icon,
  label,
  value,
  max,
  onChange,
}: {
  icon: IconName;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) => {
  const theme = useTheme();

  return (
    <Row justify="space-between" gap={theme.spacing.md}>
      <Row gap={theme.spacing.sm} style={{ flex: 1 }}>
        <Icon
          name={icon}
          size={17}
          color={value > 0 ? theme.colors.electric : theme.colors.textTertiary}
        />
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </Row>

      <Row gap={4} accessibilityLabel={`${label}, level ${value} of ${max}`}>
        {Array.from({ length: max + 1 }, (_, level) => {
          const on = level > 0 && level <= value;
          const isOff = level === 0;
          return (
            <Pressable
              key={level}
              onPress={() => onChange(level)}
              haptic="light"
              scaleTo={0.9}
              minTouchTarget={false}
              accessibilityLabel={isOff ? 'Off' : `Level ${level}`}
              accessibilityState={{ selected: isOff ? value === 0 : level === value }}
              style={{
                width: isOff ? 34 : 22,
                height: 30,
                borderRadius: theme.radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on
                  ? theme.colors.electric
                  : isOff && value === 0
                    ? theme.colors.lineStrong
                    : theme.colors.soft,
              }}
            >
              {isOff ? (
                <Text
                  variant="micro"
                  color={value === 0 ? theme.colors.textPrimary : theme.colors.textTertiary}
                >
                  Off
                </Text>
              ) : (
                <View
                  style={{
                    width: 3,
                    height: 10 + level * 2.5,
                    borderRadius: 2,
                    backgroundColor: on ? theme.colors.base : theme.colors.lineStrong,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </Row>
    </Row>
  );
};

export const StepperRow = memo(StepperRowComponent);
