import React from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Icon, Row, Screen, StatusPill, Surface, Text } from '@/components/design-system';
import { OnboardingHeader } from '@/features/onboarding/OnboardingHeader';
import { PROXIMITY_COPY, type ProximityTech } from '@/domain/entities';
import { useAppStore } from '@/stores';

/**
 * Screen 5 — Digital Key invitation.
 *
 * The three radios are explained in plain language, and device compatibility is
 * stated honestly: on web there is no secure element at all, so the screen says
 * so rather than offering a setup that could not work.
 */
const TECH_ICON: Record<ProximityTech, 'bluetooth' | 'uwb' | 'nfc'> = {
  ble: 'bluetooth',
  uwb: 'uwb',
  nfc: 'nfc',
};

export default function DigitalKeyInvite() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const isWeb = Platform.OS === 'web';
  const deviceSupported = !isWeb;

  const finish = (setUpNow: boolean) => {
    completeOnboarding();
    router.replace(setUpNow ? '/digital-key' : '/(tabs)/vehicle');
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <OnboardingHeader step={5} total={5} onBack={() => router.back()} />

      <Animated.View entering={FadeInDown.duration(400)}>
        <Text variant="title" style={{ marginTop: theme.spacing.xl }}>
          {t('onboarding.keyTitle')}
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          style={{ marginTop: theme.spacing.sm }}
        >
          {t('onboarding.keySubtitle')}
        </Text>

        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
          {(['ble', 'uwb', 'nfc'] as ProximityTech[]).map((tech) => (
            <Surface key={tech}>
              <Row gap={theme.spacing.md} align="flex-start">
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.electricDim,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={TECH_ICON[tech]} size={20} color={theme.colors.electric} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{PROXIMITY_COPY[tech].label}</Text>
                  <Text
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={{ marginTop: 4 }}
                  >
                    {PROXIMITY_COPY[tech].role}
                  </Text>
                </View>
              </Row>
            </Surface>
          ))}
        </View>

        <Surface tone="soft" style={{ marginTop: theme.spacing.lg }}>
          <Row justify="space-between" align="center">
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Device compatibility</Text>
              <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
                {deviceSupported
                  ? `${Platform.OS === 'ios' ? 'iOS' : 'Android'} device with a secure element. Bluetooth LE and NFC available; UWB depends on the specific model.`
                  : 'Browsers have no secure element and no access to BLE, UWB or NFC card emulation, so Digital Key is simulated here for demonstration.'}
              </Text>
            </View>
            <StatusPill
              label={deviceSupported ? 'Eligible' : 'Simulated'}
              tone={deviceSupported ? 'success' : 'desert'}
            />
          </Row>
        </Surface>

        <Surface tone="soft" style={{ marginTop: theme.spacing.md }}>
          <Row gap={theme.spacing.md} align="flex-start">
            <Icon name="shield" size={18} color={theme.colors.desert} />
            <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              Provisioning in this prototype is simulated end to end. A production Digital Key is
              issued by the manufacturer&apos;s key server, stored in your device&apos;s secure
              element, and paired directly with the vehicle. No key material ever exists in the app.
            </Text>
          </Row>
        </Surface>

        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
          <Button label={t('onboarding.setUpNow')} icon="key" onPress={() => finish(true)} />
          <Button
            label={t('onboarding.doThisLater')}
            variant="ghost"
            onPress={() => finish(false)}
          />
        </View>
      </Animated.View>
    </Screen>
  );
}
