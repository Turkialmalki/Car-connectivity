import React from 'react';
import { Modal, Pressable as RNPressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useTheme, useViewport } from '@/theme';
import { Text } from './Text';
import { Row } from './Row';
import { Pressable } from './Pressable';
import { Icon } from './Icon';

type Props = {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  /** A sheet with no dismiss affordance, used while a command is in flight. */
  dismissible?: boolean;
};

/**
 * Bottom sheet.
 *
 * Uses a plain Modal plus Reanimated entering/exiting rather than a gesture
 * bottom-sheet library: the sheets here are short, non-scrolling and often
 * non-dismissible mid-command, so a drag-to-dismiss surface would be the wrong
 * affordance and an extra dependency for no gain.
 */
export const Sheet = ({ visible, onClose, title, children, dismissible = true }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useViewport();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismissible ? onClose : undefined}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          style={{ ...StyleSheetAbsolute }}
        >
          <BlurView intensity={28} tint="dark" style={{ flex: 1 }}>
            <RNPressable
              style={{ flex: 1, backgroundColor: theme.colors.overlay }}
              onPress={dismissible ? onClose : undefined}
              // Distinct from the visible "Close" control, so a screen reader
              // announces two different affordances rather than the same name twice.
              accessibilityLabel="Dismiss by tapping outside"
              accessibilityRole="button"
            />
          </BlurView>
        </Animated.View>

        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(180)}
          exiting={SlideOutDown.duration(220)}
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.xxl,
            borderTopRightRadius: theme.radius.xxl,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.xl,
            maxHeight: height * 0.88,
            borderTopWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.lineStrong,
              marginBottom: theme.spacing.base,
            }}
          />
          {title && (
            <Row justify="space-between" style={{ marginBottom: theme.spacing.base }}>
              <Text variant="heading">{title}</Text>
              {dismissible && onClose && (
                <Pressable
                  onPress={onClose}
                  haptic="light"
                  minTouchTarget={false}
                  accessibilityLabel="Close"
                  style={{ padding: 6 }}
                >
                  <Icon name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </Row>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const StyleSheetAbsolute = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
