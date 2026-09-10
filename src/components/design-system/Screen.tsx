import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedScrollViewProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export type ScreenTone = 'white' | 'grouped' | 'dark';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  /** Adds bottom padding clear of the solid tab bar. */
  tabBarPadding?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * `white` for plain content, `grouped` for screens built from grouped
   * sections, `dark` only for the immersive Controls view.
   */
  tone?: ScreenTone;
  /** Detail routes own their top inset via PageHeader. */
  edgeToEdgeTop?: boolean;
  refreshControl?: AnimatedScrollViewProps['refreshControl'];
  onScroll?: AnimatedScrollViewProps['onScroll'];
};

export const TAB_BAR_HEIGHT = 60;
/** Standard horizontal page padding. */
export const PAGE_PADDING = 24;

/**
 * Screen container: safe areas, ground colour and scroll behaviour, solved once
 * so no route has to re-derive them.
 */
export const Screen = ({
  children,
  scroll = true,
  tabBarPadding = false,
  contentStyle,
  tone = 'white',
  edgeToEdgeTop = false,
  refreshControl,
  onScroll,
}: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const background =
    tone === 'dark'
      ? theme.colors.charcoal
      : tone === 'grouped'
        ? theme.colors.grouped
        : theme.colors.base;

  const paddingBottom =
    (tabBarPadding ? TAB_BAR_HEIGHT + theme.spacing.xxl : theme.spacing.xxl) + insets.bottom;

  const content = (
    <View
      style={[
        { paddingTop: edgeToEdgeTop ? 0 : insets.top + theme.spacing.sm, paddingBottom },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      {scroll ? (
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {content}
        </Animated.ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}
    </View>
  );
};
