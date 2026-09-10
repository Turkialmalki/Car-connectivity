import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Pressable, Row, Text } from '@/components/design-system';

/**
 * Header for pushed routes that already sit inside a padded `Screen`.
 *
 * Same rhythm as `PageHeader` — a plain back control, then the page title at
 * the large end of the type scale — but without the safe-area padding, which
 * the surrounding Screen already applies.
 */
export const StackHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => {
  const theme = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();

  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      <Row justify="space-between" align="center" style={{ minHeight: 44 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/vehicle'))}
          haptic="light"
          accessibilityLabel={t('common.back')}
          style={{ width: 44, height: 44, justifyContent: 'center', marginLeft: -10 }}
        >
          <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}>
            <Icon name="back" size={24} color={theme.colors.textPrimary} strokeWidth={2} />
          </View>
        </Pressable>
        {action}
      </Row>

      <View style={{ paddingTop: theme.spacing.base }}>
        <Text variant="title">{title}</Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.xs }}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
};
