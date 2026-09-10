import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n, rowDirectionFor } from '@/i18n';

type Props = {
  children: React.ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/** RTL-aware horizontal stack. Nothing in the app uses raw `flexDirection: 'row'`. */
export const Row = ({
  children,
  gap,
  align = 'center',
  justify,
  style,
  wrap,
  accessibilityLabel,
  testID,
}: Props) => {
  const theme = useTheme();
  const { isRTL } = useI18n();
  return (
    <View
      testID={testID}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: rowDirectionFor(isRTL),
          alignItems: align,
          justifyContent: justify,
          gap: gap ?? theme.spacing.sm,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Spacer = ({ size = 16 }: { size?: number }) => <View style={{ height: size }} />;

export const Divider = ({ inset = 0 }: { inset?: number }) => {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.colors.line,
        marginHorizontal: inset,
      }}
    />
  );
};
