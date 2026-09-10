import React, { memo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon } from './Icon';
import { PAGE_PADDING } from './Screen';

type Props = {
  title: string;
  subtitle?: string;
  /** Rendered opposite the back control. */
  action?: React.ReactNode;
  /** Charcoal treatment for the immersive Controls view. */
  onDark?: boolean;
  /** Small centred title instead of the large left-aligned one. */
  compactTitle?: boolean;
  onBack?: () => void;
};

/**
 * Full-screen detail header: a plain back control, then the page title at the
 * large end of the type scale. Every detail route uses this so the back gesture
 * and the title rhythm are identical across the app.
 */
const PageHeaderComponent = ({
  title,
  subtitle,
  action,
  onDark = false,
  compactTitle = false,
  onBack,
}: Props) => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();

  const tint = onDark ? theme.colors.textInverse : theme.colors.textPrimary;

  const back = (
    <Pressable
      onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/(tabs)/vehicle'))}
      haptic="light"
      accessibilityLabel={t('common.back')}
      style={{ width: 44, height: 44, justifyContent: 'center', marginLeft: -10 }}
    >
      <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}>
        <Icon name="back" size={24} color={tint} strokeWidth={2} />
      </View>
    </Pressable>
  );

  return (
    <View style={{ paddingTop: insets.top + theme.spacing.xs, paddingHorizontal: PAGE_PADDING }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
        }}
      >
        {back}
        {compactTitle && (
          <Text variant="bodyStrong" color={tint} align="center" style={{ flex: 1 }}>
            {title}
          </Text>
        )}
        <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{action}</View>
      </View>

      {!compactTitle && (
        <View style={{ paddingTop: theme.spacing.base, paddingBottom: theme.spacing.lg }}>
          <Text variant="title" color={tint}>
            {title}
          </Text>
          {subtitle && (
            <Text
              variant="caption"
              color={onDark ? theme.colors.textInverseSecondary : theme.colors.textSecondary}
              style={{ marginTop: theme.spacing.xs }}
            >
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export const PageHeader = memo(PageHeaderComponent);
