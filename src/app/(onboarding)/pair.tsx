import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  ListRow,
  Row,
  Screen,
  Sheet,
  Surface,
  Text,
  TextField,
} from '@/components/design-system';
import { OnboardingHeader } from '@/features/onboarding/OnboardingHeader';
import { connected, vehicleRepository } from '@/infrastructure/api';
import { secureStorage, SECURE_KEYS, maskVin } from '@/infrastructure/secure-storage';
import { useAppStore, useUiStore } from '@/stores';

const DEMO_VIN = 'NVA1EVSEDAN264821';

/**
 * Screen 3 — Pair vehicle.
 *
 * Four entry paths, all converging on the same server-side ownership check.
 * Camera-based scanning is presented as a future capability rather than a dead
 * button: the prototype does not ship a camera dependency, and pretending
 * otherwise would be exactly the kind of fake control this app avoids.
 */
export default function PairVehicle() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const showBanner = useUiStore((s) => s.showBanner);
  const setActiveVehicle = useAppStore((s) => s.setActiveVehicle);

  const activeVehicleId = useAppStore((s) => s.activeVehicleId);
  const [manualOpen, setManualOpen] = useState(false);
  const [vin, setVin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  /**
   * Adopts the vehicle already attached to this account.
   *
   * In connected mode there is nothing to pair: membership of a vehicle is
   * granted server-side, and the account was provisioned one on first sign-in.
   * Offering a VIN form that could only ever fail would be a fake control.
   */
  const useProvisionedVehicle = () => {
    if (!activeVehicleId) {
      showBanner('No vehicle is attached to this account yet.', 'warning');
      return;
    }
    router.push('/(onboarding)/permissions');
  };

  const pair = async (candidate: string) => {
    setVerifying(true);
    setError(undefined);
    const result = await vehicleRepository.pairVehicle(candidate);
    setVerifying(false);

    if ('error' in result) {
      setError(result.error);
      // The manual sheet shows the inline error; anything else (the demo path)
      // would otherwise fail silently, so it always gets a banner too.
      if (!manualOpen) showBanner(result.error, 'warning');
      return;
    }
    // The full VIN is personal data and never enters app state or logs.
    await secureStorage.set(SECURE_KEYS.fullVin, candidate.toUpperCase());
    setActiveVehicle(result.vehicleId);
    setManualOpen(false);
    router.push('/(onboarding)/permissions');
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <OnboardingHeader step={3} total={5} onBack={() => router.back()} />

      <Animated.View entering={FadeInDown.duration(400)}>
        <Text variant="title" style={{ marginTop: theme.spacing.xl }}>
          {t('onboarding.pairTitle')}
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          style={{ marginTop: theme.spacing.sm }}
        >
          {t('onboarding.pairSubtitle')}
        </Text>

        {connected ? null : (
        <Surface style={{ marginTop: theme.spacing.xl }} padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="car"
              title={t('onboarding.scanVin')}
              subtitle="Requires camera access — planned for the next build"
              onPress={() =>
                showBanner(
                  'VIN scanning needs a camera module. This prototype ships manual entry and the demo vehicle instead.',
                  'info',
                )
              }
            />
            <ListRow
              icon="key"
              title={t('onboarding.scanQr')}
              subtitle="Requires camera access — planned for the next build"
              onPress={() =>
                showBanner(
                  'QR pairing needs a camera module. Use manual VIN entry or the demo vehicle.',
                  'info',
                )
              }
            />
            <ListRow
              icon="device"
              title={t('onboarding.enterVin')}
              subtitle="17 characters, printed at the base of the windscreen"
              onPress={() => setManualOpen(true)}
            />
          </View>
        </Surface>
        )}

        <View style={{ marginTop: theme.spacing.xl }}>
          <Button
            label={connected ? 'Continue with my vehicle' : t('onboarding.useDemoVehicle')}
            icon="car"
            onPress={() => (connected ? useProvisionedVehicle() : void pair(DEMO_VIN))}
            loading={verifying && !manualOpen}
          />
          <Text
            variant="micro"
            align="center"
            color={theme.colors.textTertiary}
            style={{ marginTop: theme.spacing.md }}
          >
            {connected
              ? 'A simulated vehicle is already attached to this account.'
              : `Electric crossover · Long Range AWD · VIN ${maskVin(DEMO_VIN)}`}
          </Text>
        </View>

        <Surface tone="soft" style={{ marginTop: theme.spacing.xl }}>
          <Row gap={theme.spacing.md} align="flex-start">
            <Icon name="shield" size={18} color={theme.colors.electric} />
            <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              Pairing is verified server-side against the vehicle registry. The app never grants
              itself access — it asks, and the backend decides. The full VIN is written to the
              device keychain and shown redacted everywhere else.
            </Text>
          </Row>
        </Surface>
      </Animated.View>

      <Sheet
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        title={t('onboarding.enterVin')}
      >
        <View style={{ gap: theme.spacing.base }}>
          <TextField
            label={t('onboarding.vinLabel')}
            value={vin}
            onChangeText={(text) => setVin(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={17}
            placeholder="NVA1EVSEDAN264821"
            error={error}
            hint={`${vin.length}/17 characters`}
          />
          {verifying && (
            <Animated.View entering={FadeIn}>
              <Row gap={theme.spacing.sm}>
                <Icon name="refresh" size={16} color={theme.colors.electric} />
                <Text variant="caption" color={theme.colors.electric}>
                  {t('onboarding.verifying')}
                </Text>
              </Row>
            </Animated.View>
          )}
          <Button
            label={t('common.confirm')}
            onPress={() => void pair(vin)}
            loading={verifying}
            disabled={vin.length !== 17}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
