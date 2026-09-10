import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  Row,
  Screen,
  Surface,
  Text,
  Toggle,
  type IconName,
} from '@/components/design-system';
import { OnboardingHeader } from '@/features/onboarding/OnboardingHeader';
import { useAppStore } from '@/stores';
import type { PermissionKey } from '@/stores';
import { createNativeAdapters } from '@/infrastructure/native-connectivity';

const adapters = createNativeAdapters('nova_one_demo');

/**
 * Screen 4 — Permissions.
 *
 * Each permission states the concrete feature it unlocks and what breaks
 * without it. Nothing is requested silently, nothing is bundled, and every one
 * of them is genuinely optional — the app degrades rather than blocks.
 */
const PERMISSIONS: {
  key: PermissionKey;
  icon: IconName;
  title: string;
  why: string;
  withoutIt: string;
}[] = [
  {
    key: 'notifications',
    icon: 'bell',
    title: 'Notifications',
    why: 'Tells you when charging finishes, when a command fails, or if the vehicle is left unlocked.',
    withoutIt: 'You will need to open the app to learn any of that.',
  },
  {
    key: 'location',
    icon: 'location',
    title: 'Location',
    why: 'Shows your position relative to the vehicle and enables directions back to it.',
    withoutIt: 'The vehicle location still works — you just will not see yourself on the map.',
  },
  {
    key: 'bluetooth',
    icon: 'bluetooth',
    title: 'Bluetooth',
    why: 'Discovers your vehicle nearby for Digital Key entry, with no network needed.',
    withoutIt: 'Digital Key cannot work. Remote commands over the cloud are unaffected.',
  },
  {
    key: 'biometrics',
    icon: 'shield',
    title: 'Face ID / fingerprint',
    why: 'Confirms it is you before a high-risk action such as a remote unlock.',
    withoutIt: 'You can still unlock remotely, but with weaker protection on a lost phone.',
  },
];

export default function Permissions() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const permissions = useAppStore((s) => s.permissions);
  const grantPermission = useAppStore((s) => s.grantPermission);
  const [busy, setBusy] = useState<PermissionKey | null>(null);

  const request = async (key: PermissionKey, value: boolean) => {
    if (!value) {
      grantPermission(key, false);
      return;
    }
    setBusy(key);
    // Each permission goes through its own adapter so the production version
    // swaps in the real OS prompt without touching this screen.
    let granted = true;
    if (key === 'notifications') granted = await adapters.push.requestPermission();
    if (key === 'biometrics') granted = await adapters.biometric.isAvailable();
    if (key === 'bluetooth') granted = await adapters.bluetooth.isSupported();
    setBusy(null);
    grantPermission(key, granted);
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <OnboardingHeader
        step={4}
        total={5}
        onBack={() => router.back()}
        onSkip={() => router.push('/(onboarding)/digital-key')}
      />

      <Animated.View entering={FadeInDown.duration(400)}>
        <Text variant="title" style={{ marginTop: theme.spacing.xl }}>
          {t('onboarding.permissionsTitle')}
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          style={{ marginTop: theme.spacing.sm }}
        >
          {t('onboarding.permissionsSubtitle')}
        </Text>

        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
          {PERMISSIONS.map((permission) => (
            <Surface key={permission.key} tone="elevated">
              <Row gap={theme.spacing.md} align="flex-start">
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
                  <Icon
                    name={permission.icon}
                    size={19}
                    color={
                      permissions[permission.key]
                        ? theme.colors.electric
                        : theme.colors.textSecondary
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{permission.title}</Text>
                  <Text
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={{ marginTop: 4 }}
                  >
                    {permission.why}
                  </Text>
                  <Text variant="micro" color={theme.colors.textTertiary} style={{ marginTop: 6 }}>
                    Without it: {permission.withoutIt}
                  </Text>
                </View>
                <Toggle
                  value={permissions[permission.key]}
                  onChange={(value) => void request(permission.key, value)}
                  disabled={busy === permission.key}
                  accessibilityLabel={permission.title}
                />
              </Row>
            </Surface>
          ))}
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <Button
            label={t('common.continue')}
            onPress={() => router.push('/(onboarding)/digital-key')}
          />
        </View>
      </Animated.View>
    </Screen>
  );
}
