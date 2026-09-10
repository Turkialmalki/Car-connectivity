import React, { useState } from 'react';
import { View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTheme, useViewport } from '@/theme';
import { Icon, Pressable, ProgressBar, Row, Text } from '@/components/design-system';
import { DEMO_STEPS, useDemoStore } from '@/stores';

/**
 * Demo Mode overlay.
 *
 * A floating presenter track that rides above every screen: it names the step,
 * carries the user to the right route, and — when notes are open — states what
 * that screen is actually proving. Designed so a presenter can run the whole
 * five minutes without notes on paper.
 */
export const DemoOverlay = () => {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useViewport();
  const [collapsed, setCollapsed] = useState(false);

  const enabled = useDemoStore((s) => s.enabled);
  const active = useDemoStore((s) => s.active);
  const stepIndex = useDemoStore((s) => s.stepIndex);
  const notesVisible = useDemoStore((s) => s.notesVisible);
  const next = useDemoStore((s) => s.next);
  const previous = useDemoStore((s) => s.previous);
  const stop = useDemoStore((s) => s.stop);
  const toggleNotes = useDemoStore((s) => s.toggleNotes);

  // Two independent gates. `enabled` is the developer setting; the route check
  // keeps the overlay off authentication and onboarding no matter what, so it
  // can never obscure a login form or a permissions prompt.
  const onProtectedRoute =
    pathname.startsWith('/(onboarding)') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/pair') ||
    pathname.startsWith('/permissions') ||
    pathname === '/';
  if (!enabled || !active || onProtectedRoute) return null;

  const step = DEMO_STEPS[stepIndex];
  if (!step) return null;

  const goToStep = (direction: 'next' | 'previous') => {
    const targetIndex = direction === 'next' ? stepIndex + 1 : stepIndex - 1;
    const target = DEMO_STEPS[Math.max(0, Math.min(DEMO_STEPS.length - 1, targetIndex))];
    if (direction === 'next') next();
    else previous();
    if (target) router.push(target.route as never);
  };

  if (collapsed) {
    return (
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={{
          position: 'absolute',
          right: theme.spacing.base,
          bottom: insets.bottom + 96,
          zIndex: 200,
        }}
      >
        <Pressable
          onPress={() => setCollapsed(false)}
          haptic="light"
          minTouchTarget={false}
          accessibilityLabel="Reopen demo mode"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.colors.desert,
            alignItems: 'center',
            justifyContent: 'center',
            ...theme.elevation.high,
          }}
        >
          <Icon name="play" size={20} color={theme.colors.base} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(22)}
      exiting={FadeOutDown.duration(220)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: theme.spacing.base,
        right: theme.spacing.base,
        bottom: insets.bottom + 88,
        zIndex: 200,
        maxWidth: Math.min(width - theme.spacing.base * 2, 520),
        alignSelf: 'center',
      }}
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(217,185,140,0.28)',
        }}
      >
        <View
          style={{
            backgroundColor: 'rgba(18,22,26,0.9)',
            padding: theme.spacing.base,
            gap: theme.spacing.md,
          }}
        >
          <Row justify="space-between" align="center">
            <Row gap={theme.spacing.sm}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.colors.desertDim,
                }}
              >
                <Text variant="micro" color={theme.colors.desert}>
                  DEMO {stepIndex + 1}/{DEMO_STEPS.length}
                </Text>
              </View>
              <Text variant="bodyStrong">{step.title}</Text>
            </Row>
            <Row gap={4}>
              <IconAction
                icon={notesVisible ? 'chevron-down' : 'info'}
                label={notesVisible ? 'Hide presenter notes' : 'Show presenter notes'}
                onPress={toggleNotes}
              />
              <IconAction icon="pause" label="Collapse demo" onPress={() => setCollapsed(true)} />
              <IconAction icon="close" label="Exit demo mode" onPress={stop} />
            </Row>
          </Row>

          <ProgressBar
            progress={(stepIndex + 1) / DEMO_STEPS.length}
            tone="desert"
            height={4}
            label="Demo progress"
          />

          <Text variant="caption" color={theme.colors.textPrimary}>
            {step.action}
          </Text>

          {notesVisible && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={{ gap: theme.spacing.sm }}>
              <View
                style={{
                  backgroundColor: theme.colors.soft,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                }}
              >
                <Text variant="micro" color={theme.colors.desert}>
                  PRESENTER NOTE
                </Text>
                <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
                  {step.presenterNote}
                </Text>
              </View>
              <Row gap={theme.spacing.sm} align="flex-start">
                <Icon name="check" size={13} color={theme.colors.electric} />
                <Text variant="micro" color={theme.colors.textTertiary} style={{ flex: 1 }}>
                  Proves: {step.proves}
                </Text>
              </Row>
            </Animated.View>
          )}

          <Row gap={theme.spacing.sm}>
            <Pressable
              onPress={() => goToStep('previous')}
              disabled={stepIndex === 0}
              haptic="light"
              scaleTo={0.96}
              accessibilityLabel="Previous demo step"
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.soft,
                alignItems: 'center',
              }}
            >
              <Text variant="caption" color={theme.colors.textSecondary}>
                Back
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(step.route as never)}
              haptic="light"
              scaleTo={0.96}
              accessibilityLabel="Go to this step's screen"
              style={{
                flex: 1,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.soft,
                alignItems: 'center',
              }}
            >
              <Text variant="caption" color={theme.colors.textSecondary}>
                Go there
              </Text>
            </Pressable>
            <Pressable
              onPress={() => (stepIndex === DEMO_STEPS.length - 1 ? stop() : goToStep('next'))}
              haptic="medium"
              scaleTo={0.96}
              accessibilityLabel={
                stepIndex === DEMO_STEPS.length - 1 ? 'Finish demo' : 'Next demo step'
              }
              style={{
                flex: 1.4,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.desert,
                alignItems: 'center',
              }}
            >
              <Text variant="caption" color={theme.colors.base}>
                {stepIndex === DEMO_STEPS.length - 1 ? 'Finish' : 'Next step'}
              </Text>
            </Pressable>
          </Row>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const IconAction = ({
  icon,
  label,
  onPress,
}: {
  icon: 'close' | 'info' | 'pause' | 'chevron-down';
  label: string;
  onPress: () => void;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      minTouchTarget={false}
      accessibilityLabel={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: theme.colors.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={14} color={theme.colors.textSecondary} />
    </Pressable>
  );
};
