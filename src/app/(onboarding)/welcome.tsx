import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useViewport } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Pressable, Text } from '@/components/design-system';
import { VehicleScene } from '@/components/vehicle-3d';
import { useCommandStore } from '@/stores';
import { selectPresentedEventIds } from '@/stores/command-store';
import { useAppStore } from '@/stores';

/**
 * Welcome.
 *
 * A full-screen photograph of the vehicle with the actions at the bottom. The
 * photo is portrait to begin with, so the crop is gentle and the car stays
 * whole and readable behind the overlay. Everything else is deliberately
 * absent: no login card, no feature grid, no marketing headline.
 */
export default function Welcome() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useViewport();
  const presentedEventIds = useCommandStore(selectPresentedEventIds);
  const signIn = useAppStore((s) => s.signIn);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [openingDemo, setOpeningDemo] = React.useState(false);

  /**
   * "Explore vehicle" opens a demo session and lands in the vehicle experience.
   *
   * It previously started a presenter walkthrough and then pushed the user to
   * sign-in, which left a tutorial insisting the dashboard was open while the
   * user was still looking at a login form.
   */
  const exploreVehicle = async () => {
    setOpeningDemo(true);
    await signIn();
    completeOnboarding();
    router.replace('/(tabs)/vehicle');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.charcoal }}>
      {/* The vehicle itself, not a stock photograph — the same model the rest
          of the app renders, so the first thing seen is the real thing. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <VehicleScene
          state={null}
          preset="hero"
          active
          presentedEventIds={presentedEventIds}
          accessibilityLabel="Electric crossover, three-quarter view"
          style={{ flex: 1 }}
        />
      </View>

      {/* Just enough shading for legibility — the photograph stays dominant. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.24 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.36 }}
        pointerEvents="none"
      />

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.lg,
          paddingHorizontal: theme.spacing.xl,
          justifyContent: 'space-between',
        }}
      >
        {/* No wordmark: the vehicle identifies the product. */}
        <View />

        <Animated.View entering={FadeIn.delay(180).duration(500)} style={{ gap: theme.spacing.md }}>
          <Button label={t('onboarding.signIn')} onPress={() => router.push('/(onboarding)/sign-in')} />
          <Button
            label={t('onboarding.createAccount')}
            variant="secondary"
            onDark
            onPress={() => router.push('/(onboarding)/sign-in')}
          />
          <Pressable
            onPress={() => void exploreVehicle()}
            disabled={openingDemo}
            haptic="light"
            accessibilityLabel={t('onboarding.exploreDemo')}
            style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}
          >
            <Text variant="caption" color={theme.colors.textInverseSecondary}>
              {t('onboarding.exploreDemo')}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
