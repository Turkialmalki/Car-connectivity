import React, { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  StatusPill,
  Surface,
  Text,
  Pressable,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import {
  CARRIER_COPY,
  DIGITAL_KEY_STATE_COPY,
  PROVISIONING_STEPS,
  PROXIMITY_COPY,
  type DigitalKey,
  type ProximityTech,
} from '@/domain/entities';
import {
  initialKeyState,
  isKeyUsable,
  proximityGrade,
  techForCapability,
} from '@/domain/use-cases';
import { useDigitalKeys, useVehicle } from '@/hooks';
import { useUiStore } from '@/stores';
import { createBiometricAdapter } from '@/infrastructure/native-connectivity';
import { dayMonth, relativeTime } from '@/utils/time';

const biometric = createBiometricAdapter();

const TECH_ICON: Record<ProximityTech, 'bluetooth' | 'uwb' | 'nfc'> = {
  ble: 'bluetooth',
  uwb: 'uwb',
  nfc: 'nfc',
};

/**
 * Digital Key.
 *
 * This screen carries the app's most important architectural message: local
 * proximity access and cloud remote unlock are two DIFFERENT capabilities with
 * different trust models, and it says so explicitly rather than blurring them.
 */
export default function DigitalKeyScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { data: keys, isLoading, provision, revoke, suspend, resume } = useDigitalKeys();
  const { data: vehicle } = useVehicle();
  const showBanner = useUiStore((s) => s.showBanner);

  const [provisioning, setProvisioning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<DigitalKey | null>(null);

  const deviceSupportsSecureElement = Platform.OS !== 'web';
  const capability = vehicle?.capabilities.digitalKey ?? 'none';
  const supportedTech = techForCapability(capability);
  const baseState = initialKeyState(capability, deviceSupportsSecureElement);

  const startProvisioning = useCallback(async () => {
    if (baseState === 'not_supported') {
      showBanner('This vehicle or device does not support Digital Key.', 'warning');
      return;
    }
    const auth = await biometric.authenticate('Confirm your identity to create a Digital Key');
    if (!auth.success) {
      showBanner('Provisioning needs biometric confirmation to continue.', 'warning');
      return;
    }
    setProvisioning(true);
    setCurrentStep(PROVISIONING_STEPS[0].id);
    try {
      await provision.mutateAsync({
        carrier: 'phone',
        deviceLabel:
          Platform.OS === 'ios'
            ? 'This iPhone'
            : Platform.OS === 'android'
              ? 'This Android device'
              : 'This browser',
        holderName: 'You',
        onStep: setCurrentStep,
      });
      showBanner(t('digitalKey.activated'), 'success');
    } finally {
      setProvisioning(false);
      setCurrentStep(null);
    }
  }, [baseState, provision, showBanner, t]);

  const ownerKeys = (keys ?? []).filter((k) => k.isOwnerKey);
  const sharedKeys = (keys ?? []).filter((k) => !k.isOwnerKey);
  const grade = proximityGrade(supportedTech);

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader title={t('digitalKey.title')} subtitle={t('digitalKey.subtitle')} />

      {/* The core distinction */}
      <Surface tone="soft">
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="shield" size={19} color={theme.colors.desert} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Two separate ways in</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 6 }}>
              <Text variant="caption" color={theme.colors.electric}>
                Digital Key
              </Text>{' '}
              is local. Your phone talks straight to the vehicle over radio, so it works in a
              basement with no signal at all.
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 6 }}>
              <Text variant="caption" color={theme.colors.desert}>
                Remote unlock
              </Text>{' '}
              travels through the connected cloud and works from anywhere — but only while the
              vehicle itself has coverage. Neither one is a fallback for the other.
            </Text>
          </View>
        </Row>
      </Surface>

      {/* Capability */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('digitalKey.howItWorks')} />
        {supportedTech.length === 0 ? (
          <Surface tone="soft">
            <Text variant="caption" color={theme.colors.textSecondary}>
              {vehicle?.name} does not support Digital Key. Its capability profile reports
              `digitalKey: &quot;none&quot;`, so this feature is hidden rather than shown as broken.
            </Text>
          </Surface>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {supportedTech.map((tech) => (
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
            <Surface tone="soft">
              <Row gap={theme.spacing.md}>
                <Icon name="key" size={19} color={theme.colors.desert} />
                <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                  {grade.detail}
                </Text>
              </Row>
            </Surface>
          </View>
        )}
      </View>

      {/* Owner keys */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('digitalKey.yourKeys')} />
        {isLoading ? (
          <EmptyState icon="key" title={t('common.loading')} />
        ) : ownerKeys.length === 0 ? (
          <EmptyState
            icon="key"
            title="No keys yet"
            body="Set up a Digital Key to unlock and drive without carrying anything."
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {ownerKeys.map((key) => (
              <KeyCard key={key.id} digitalKey={key} onPress={() => setSelectedKey(key)} />
            ))}
          </View>
        )}

        {supportedTech.length > 0 && (
          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label={t('digitalKey.setUp')}
              icon="plus"
              variant="secondary"
              onPress={() => void startProvisioning()}
              loading={provisioning}
            />
          </View>
        )}
      </View>

      {/* Shared keys */}
      {sharedKeys.length > 0 && (
        <View style={{ marginTop: theme.spacing.xxl }}>
          <SectionHeader title={t('digitalKey.sharedKeys')} />
          <View style={{ gap: theme.spacing.md }}>
            {sharedKeys.map((key) => (
              <KeyCard key={key.id} digitalKey={key} onPress={() => setSelectedKey(key)} />
            ))}
          </View>
        </View>
      )}

      {/* Security boundary note */}
      <Surface tone="soft" style={{ marginTop: theme.spacing.xxl }}>
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="shield" size={19} color={theme.colors.electric} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Where the key actually lives</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 6 }}>
              A production Digital Key is an OEM-issued credential held in your device&apos;s secure
              element, provisioned through Apple Wallet or Google Wallet under the CCC Digital Key
              specification. The private key is generated inside that hardware and can never be
              exported — not to this app, not to the manufacturer, not to anyone. This screen only
              ever handles metadata: which device, which state, when it expires.
            </Text>
            <Text
              variant="micro"
              color={theme.colors.textTertiary}
              style={{ marginTop: theme.spacing.sm }}
            >
              In this prototype, provisioning is simulated. No radio is used and no cryptography is
              performed.
            </Text>
          </View>
        </Row>
      </Surface>

      {/* Provisioning progress */}
      <Sheet visible={provisioning} dismissible={false} title={t('digitalKey.provisioning')}>
        <View style={{ gap: theme.spacing.md }}>
          {PROVISIONING_STEPS.map((step) => {
            const index = PROVISIONING_STEPS.findIndex((s) => s.id === currentStep);
            const stepIndex = PROVISIONING_STEPS.findIndex((s) => s.id === step.id);
            const done = stepIndex < index;
            const active = step.id === currentStep;
            return (
              <Row key={step.id} gap={theme.spacing.md} align="flex-start">
                <View style={{ width: 22, alignItems: 'center', paddingTop: 2 }}>
                  {done ? (
                    <Icon name="check" size={16} color={theme.colors.electric} />
                  ) : (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: active ? theme.colors.electric : theme.colors.lineStrong,
                      }}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    variant={active ? 'bodyStrong' : 'body'}
                    color={done || active ? theme.colors.textPrimary : theme.colors.textTertiary}
                  >
                    {step.label}
                  </Text>
                  {active && (
                    <Animated.View entering={FadeIn}>
                      <Text
                        variant="caption"
                        color={theme.colors.textSecondary}
                        style={{ marginTop: 2 }}
                      >
                        {step.detail}
                      </Text>
                    </Animated.View>
                  )}
                </View>
              </Row>
            );
          })}
        </View>
      </Sheet>

      {/* Key detail */}
      <Sheet
        visible={selectedKey !== null}
        onClose={() => setSelectedKey(null)}
        title={selectedKey ? CARRIER_COPY[selectedKey.carrier] : ''}
      >
        {selectedKey && (
          <View style={{ gap: theme.spacing.base }}>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Device
              </Text>
              <Text variant="bodyStrong">{selectedKey.deviceLabel}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Holder
              </Text>
              <Text variant="bodyStrong">{selectedKey.holderName}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Status
              </Text>
              <StatusPill
                label={DIGITAL_KEY_STATE_COPY[selectedKey.state].label}
                tone={
                  selectedKey.state === 'active'
                    ? 'success'
                    : selectedKey.state === 'revoked'
                      ? 'critical'
                      : 'warning'
                }
              />
            </Row>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Expires
              </Text>
              <Text variant="bodyStrong">
                {selectedKey.expiresAt ? dayMonth(selectedKey.expiresAt) : 'Never'}
              </Text>
            </Row>
            <Row justify="space-between">
              <Text variant="body" color={theme.colors.textSecondary}>
                Credential reference
              </Text>
              <Text variant="mono" color={theme.colors.textTertiary}>
                {selectedKey.credentialRef}
              </Text>
            </Row>

            <Text variant="micro" color={theme.colors.textTertiary}>
              The reference above is a public identifier used for revocation. It is not the
              credential, and the credential itself is never readable by this app.
            </Text>

            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
              {selectedKey.state === 'active' && (
                <Button
                  label={`${t('digitalKey.suspend')} — lost device`}
                  variant="secondary"
                  icon="pause"
                  onPress={() => {
                    suspend.mutate(selectedKey.id);
                    setSelectedKey(null);
                    showBanner('Key suspended. It can be restored by the owner.', 'info');
                  }}
                />
              )}
              {selectedKey.state === 'suspended' && (
                <Button
                  label={t('digitalKey.resume')}
                  variant="secondary"
                  icon="play"
                  onPress={() => {
                    resume.mutate(selectedKey.id);
                    setSelectedKey(null);
                  }}
                />
              )}
              {selectedKey.state !== 'revoked' && (
                <Button
                  label={t('digitalKey.revoke')}
                  variant="destructive"
                  icon="trash"
                  onPress={() => {
                    revoke.mutate(selectedKey.id);
                    setSelectedKey(null);
                    showBanner(
                      'Key revoked permanently. The vehicle was told to distrust this credential.',
                      'warning',
                    );
                  }}
                />
              )}
              <Text variant="micro" color={theme.colors.textTertiary}>
                Revocation is permanent by design. A revoked credential can never be reactivated —
                the vehicle has already been told to reject it. Recovery means provisioning a new
                key with new material.
              </Text>
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const KeyCard = ({ digitalKey, onPress }: { digitalKey: DigitalKey; onPress: () => void }) => {
  const theme = useTheme();
  const usable = isKeyUsable(digitalKey);

  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      scaleTo={0.985}
      accessibilityLabel={`${CARRIER_COPY[digitalKey.carrier]}, ${digitalKey.deviceLabel}, ${DIGITAL_KEY_STATE_COPY[digitalKey.state].label}`}
    >
      <Surface>
        <Row gap={theme.spacing.md}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: theme.radius.md,
              backgroundColor: usable ? theme.colors.electricDim : theme.colors.soft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={
                digitalKey.carrier === 'watch'
                  ? 'device'
                  : digitalKey.carrier === 'key_card'
                    ? 'key'
                    : 'device'
              }
              size={20}
              color={usable ? theme.colors.electric : theme.colors.textTertiary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{digitalKey.deviceLabel}</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
              {CARRIER_COPY[digitalKey.carrier]}
              {digitalKey.lastUsedAt
                ? ` · used ${relativeTime(digitalKey.lastUsedAt)}`
                : ' · never used'}
            </Text>
            <Row gap={6} style={{ marginTop: 6 }}>
              {digitalKey.supportedTech.map((tech) => (
                <View
                  key={tech}
                  style={{
                    backgroundColor: theme.colors.soft,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: theme.radius.sm,
                  }}
                >
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    {tech.toUpperCase()}
                  </Text>
                </View>
              ))}
            </Row>
          </View>
          <StatusPill
            label={DIGITAL_KEY_STATE_COPY[digitalKey.state].label}
            tone={
              digitalKey.state === 'active'
                ? 'success'
                : digitalKey.state === 'revoked'
                  ? 'critical'
                  : 'warning'
            }
            compact
          />
        </Row>
      </Surface>
    </Pressable>
  );
};
