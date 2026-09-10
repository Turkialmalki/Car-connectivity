import React, { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Row } from './Row';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  right?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
};

const ListRowComponent = ({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  onPress,
  showChevron = true,
  right,
  destructive = false,
  disabled = false,
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const titleColor = destructive ? theme.colors.critical : theme.colors.textPrimary;

  const body = (
    <Row gap={theme.spacing.md} align="center">
      {icon && (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={19} color={iconColor ?? titleColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={titleColor}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {value && (
        <Text variant="caption" color={theme.colors.textSecondary}>
          {value}
        </Text>
      )}
      {right}
      {onPress && showChevron && !right && (
        <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}>
          <Icon name="chevron" size={16} color={theme.colors.textTertiary} />
        </View>
      )}
    </Row>
  );

  if (!onPress) {
    return <View style={{ paddingVertical: theme.spacing.md }}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.985}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={{ paddingVertical: theme.spacing.md }}
    >
      {body}
    </Pressable>
  );
};

export const ListRow = memo(ListRowComponent);
