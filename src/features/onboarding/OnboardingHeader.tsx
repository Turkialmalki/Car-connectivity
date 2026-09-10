import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Pressable, Row, Text } from '@/components/design-system';

/** Shared onboarding chrome: back affordance plus a discreet step indicator. */
export const OnboardingHeader = ({
  step,
  total,
  onBack,
  onSkip,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  onSkip?: () => void;
}) => {
  const theme = useTheme();
  const { t, isRTL } = useI18n();

  return (
    <Row justify="space-between" align="center" style={{ height: 44 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          haptic="light"
          minTouchTarget={false}
          accessibilityLabel={t('common.back')}
          style={{ padding: 8, marginLeft: -8 }}
        >
          <View style={{ transform: [{ scaleX: isRTL ? 1 : -1 }] }}>
            <Icon name="chevron" size={20} color={theme.colors.textSecondary} />
          </View>
        </Pressable>
      ) : (
        <View style={{ width: 36 }} />
      )}

      <Row gap={6}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              width: i + 1 === step ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i + 1 === step ? theme.colors.electric : theme.colors.line,
            }}
          />
        ))}
      </Row>

      {onSkip ? (
        <Pressable
          onPress={onSkip}
          haptic="light"
          minTouchTarget={false}
          accessibilityLabel={t('common.skip')}
          style={{ padding: 8, marginRight: -8 }}
        >
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('common.skip')}
          </Text>
        </Pressable>
      ) : (
        <View style={{ width: 36 }} />
      )}
    </Row>
  );
};
