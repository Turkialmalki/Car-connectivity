import React, { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  /** The live value this tile exists to surface. */
  value: string;
  detail?: string;
  icon: IconName;
  tone: 'climate' | 'energy';
  onPress: () => void;
  disabled?: boolean;
};

/**
 * Bold feature entry — Climate and Energy on the vehicle home. These are doors
 * into full screens, not KPI cards, so they carry one number and one action
 * each rather than a cluster of statistics.
 */
const FeatureTileComponent = ({
  title,
  value,
  detail,
  icon,
  tone,
  onPress,
  disabled = false,
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const background = tone === 'climate' ? theme.colors.climateBlue : theme.colors.green;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.98}
      minTouchTarget={false}
      accessibilityLabel={`${title}, ${value}`}
      accessibilityHint={detail}
      style={{
        flex: 1,
        backgroundColor: background,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.base,
        minHeight: 104,
        justifyContent: 'space-between',
      }}
    >
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="bodyStrong" color={theme.colors.textInverse}>
          {title}
        </Text>
        <Icon name={icon} size={18} color="rgba(255,255,255,0.85)" />
      </View>
      <View>
        <Text variant="numericSm" numeric color={theme.colors.textInverse}>
          {value}
        </Text>
        {detail && (
          <Text variant="micro" color="rgba(255,255,255,0.8)" numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

export const FeatureTile = memo(FeatureTileComponent);
