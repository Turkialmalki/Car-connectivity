import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, Text, type IconName } from '../design-system';

export const EmptyState = ({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body?: string;
}) => {
  const theme = useTheme();
  return (
    <View
      style={{ alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.md }}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: theme.colors.soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={24} color={theme.colors.textTertiary} />
      </View>
      <Text variant="bodyStrong" align="center" color={theme.colors.textSecondary}>
        {title}
      </Text>
      {body && (
        <Text
          variant="caption"
          align="center"
          color={theme.colors.textTertiary}
          style={{ maxWidth: 280 }}
        >
          {body}
        </Text>
      )}
    </View>
  );
};
