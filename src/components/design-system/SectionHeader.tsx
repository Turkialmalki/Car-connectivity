import React, { memo } from 'react';
import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Row } from './Row';

type Props = {
  title: string;
  action?: { label: string; onPress: () => void };
  subtitle?: string;
};

const SectionHeaderComponent = ({ title, action, subtitle }: Props) => {
  const theme = useTheme();
  return (
    <>
      <Row
        justify="space-between"
        align="center"
        style={{ marginBottom: subtitle ? 4 : theme.spacing.md }}
      >
        <Text
          variant="mono"
          color={theme.colors.textTertiary}
          style={{ textTransform: 'uppercase' }}
        >
          {title}
        </Text>
        {action && (
          <Pressable
            onPress={action.onPress}
            haptic="light"
            minTouchTarget={false}
            scaleTo={0.96}
            accessibilityLabel={action.label}
          >
            <Text variant="caption" color={theme.colors.electric}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </Row>
      {subtitle && (
        <Text
          variant="caption"
          color={theme.colors.textSecondary}
          style={{ marginBottom: theme.spacing.md }}
        >
          {subtitle}
        </Text>
      )}
    </>
  );
};

export const SectionHeader = memo(SectionHeaderComponent);
