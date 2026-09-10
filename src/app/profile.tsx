import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { LANGUAGES, useI18n, type Language } from '@/i18n';
import {
  Icon,
  ListRow,
  Row,
  PAGE_PADDING,
  PageHeader,
  Screen,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Surface,
  Text,
  Pressable,
} from '@/components/design-system';
import { useNotificationBadge, useVehicle, useVehicles } from '@/hooks';
import { useAppStore, useDemoStore, useSimulationStore } from '@/stores';
import type { UnitSystem } from '@/utils/format';

/**
 * Profile and settings hub.
 *
 * The Developer Simulation entry is gated behind a deliberate gesture — five
 * taps on the version row — so the customer experience stays clean while a
 * presenter can still reach the simulation controls in one second on stage.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const units = useAppStore((s) => s.units);
  const setUnits = useAppStore((s) => s.setUnits);
  const ambientMotion = useAppStore((s) => s.ambientMotionEnabled);
  const setAmbientMotion = useAppStore((s) => s.setAmbientMotion);
  const signOut = useAppStore((s) => s.signOut);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);

  const panelUnlocked = useSimulationStore((s) => s.panelUnlocked);
  const unlockPanel = useSimulationStore((s) => s.unlockPanel);
  const startDemo = useDemoStore((s) => s.start);
  const setDemoEnabled = useDemoStore((s) => s.setEnabled);

  const { data: vehicle } = useVehicle();
  const { data: vehicles } = useVehicles();
  const unread = useNotificationBadge();

  const [tapCount, setTapCount] = useState(0);
  const [languageSheet, setLanguageSheet] = useState(false);

  const onVersionTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 5) unlockPanel();
  };

  return (
    <Screen contentStyle={{ paddingBottom: theme.spacing.xxl }}>
      <View>
        <PageHeader title={t('profile.title')} />
      </View>
      <View style={{ paddingHorizontal: PAGE_PADDING }}>

      {/* Identity */}
      <Surface style={{ marginTop: theme.spacing.lg }}>
        <Row gap={theme.spacing.base}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: theme.colors.desertDim,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(217,185,140,0.3)',
            }}
          >
            <Text variant="heading" color={theme.colors.desert}>
              {user?.initials ?? 'NA'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user?.fullName ?? 'Guest'}</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
              {user?.email ?? '—'}
            </Text>
          </View>
          {user?.isDemoAccount && (
            <View
              style={{
                backgroundColor: theme.colors.soft,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 4,
                borderRadius: theme.radius.pill,
              }}
            >
              <Text variant="micro" color={theme.colors.desert}>
                Demo
              </Text>
            </View>
          )}
        </Row>
      </Surface>

      {/* Vehicle & access */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Vehicle & access" />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="car"
              title={t('profile.vehicles')}
              subtitle={`${vehicle?.name ?? '—'} · ${vehicles?.length ?? 0} paired`}
              onPress={() => router.push('/vehicles')}
            />
            <ListRow
              icon="key"
              title={t('digitalKey.title')}
              subtitle="Phone, watch and shared keys"
              onPress={() => router.push('/digital-key')}
            />
            <ListRow
              icon="user"
              title={t('profile.driversKeys')}
              subtitle="Invite drivers and manage permissions"
              onPress={() => router.push('/drivers')}
            />
            <ListRow
              icon="wrench"
              title={t('health.title')}
              subtitle="Tyres, battery health and diagnostics"
              onPress={() => router.push('/health')}
            />
            <ListRow
              icon="download"
              title={t('ota.title')}
              subtitle={`Current version ${vehicle?.softwareVersion ?? '—'}`}
              onPress={() => router.push('/ota')}
            />
          </View>
        </Surface>
      </View>

      {/* Preferences */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Preferences" />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="bell"
              title={t('profile.notifications')}
              subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
              onPress={() => router.push('/notifications')}
            />
            <ListRow
              icon="globe"
              title={t('profile.language')}
              value={LANGUAGES.find((l) => l.code === language)?.nativeLabel}
              onPress={() => setLanguageSheet(true)}
            />
            <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.md }}>
              <Text variant="bodyStrong">{t('profile.units')}</Text>
              <SegmentedControl<UnitSystem>
                label={t('profile.units')}
                value={units}
                onChange={setUnits}
                options={[
                  { value: 'metric', label: `${t('profile.metric')} · km, °C` },
                  { value: 'imperial', label: `${t('profile.imperial')} · mi, °F` },
                ]}
              />
            </View>
            <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.md }}>
              <Text variant="bodyStrong">{t('profile.appearance')}</Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                The interface is dark by design — it is used at night, in car parks and on a windscreen
                mount. Ambient motion can be reduced independently of the system setting.
              </Text>
              <SegmentedControl
                label="Ambient motion"
                value={ambientMotion ? 'on' : 'off'}
                onChange={(value) => setAmbientMotion(value === 'on')}
                options={[
                  { value: 'on', label: 'Ambient motion on' },
                  { value: 'off', label: 'Reduced' },
                ]}
              />
            </View>
          </View>
        </Surface>
      </View>

      {/* Security & privacy */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Security & privacy" />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="shield"
              title={t('profile.security')}
              subtitle="Biometrics, trusted devices, sessions"
              onPress={() => router.push('/security')}
            />
            <ListRow
              icon="info"
              title={t('profile.privacy')}
              subtitle="What is collected, and what is redacted"
              onPress={() => router.push('/about')}
            />
          </View>
        </Surface>
      </View>

      {/* Support & demo */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Support" />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
                        <ListRow
              icon="wrench"
              title={t('profile.help')}
              subtitle="Roadside assistance and support"
              onPress={() => router.push('/help')}
            />
            <ListRow icon="info" title={t('profile.about')} onPress={() => router.push('/about')} />
            {panelUnlocked && (
              <>
                {/* Presenter mode lives here, behind the developer unlock, and
                    never appears on sign-in or any customer-facing screen. */}
                <ListRow
                  icon="play"
                  title="Presenter mode"
                  subtitle="Guided walkthrough with presenter notes. Developer tool."
                  iconColor={theme.colors.desert}
                  onPress={() => {
                    setDemoEnabled(true);
                    startDemo();
                    router.push('/(tabs)/vehicle');
                  }}
                />
                <ListRow
                  icon="settings"
                  title={t('developer.simulation')}
                  subtitle="Connectivity, charging scenarios and failure injection"
                  iconColor={theme.colors.electric}
                  onPress={() => router.push('/developer/simulation')}
                />
                <ListRow
                  icon="trace"
                  title={t('developer.trace')}
                  subtitle="Per-command stage timings and fleet metrics"
                  iconColor={theme.colors.electric}
                  onPress={() => router.push('/developer/trace')}
                />
              </>
            )}
            <ListRow
              icon="close"
              title={t('profile.signOut')}
              destructive
              showChevron={false}
              onPress={() => {
                void signOut();
                resetOnboarding();
                router.replace('/(onboarding)/welcome');
              }}
            />
          </View>
        </Surface>
      </View>

      {/* Version + hidden developer gesture */}
      <Pressable
        onPress={onVersionTap}
        haptic="none"
        scaleTo={1}
        accessibilityLabel="Application version"
        accessibilityHint="Tap five times to reveal developer simulation tools"
        style={{ marginTop: theme.spacing.xxl, alignItems: 'center', gap: theme.spacing.md }}
      >
        <Text variant="micro" color={theme.colors.textTertiary} align="center">
          Version 1.0.0 · Prototype build
          {!panelUnlocked && tapCount > 0 ? ` · ${5 - tapCount} more taps` : ''}
        </Text>
        <Text
          variant="micro"
          color={theme.colors.textTertiary}
          align="center"
          style={{ maxWidth: 300 }}
        >
          {t('about.disclaimer')}
        </Text>
      </Pressable>

      </View>

      <Sheet
        visible={languageSheet}
        onClose={() => setLanguageSheet(false)}
        title={t('profile.language')}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {LANGUAGES.map((option) => (
            <Pressable
              key={option.code}
              onPress={() => {
                setLanguage(option.code as Language);
                setLanguageSheet(false);
              }}
              haptic="light"
              scaleTo={0.985}
              accessibilityLabel={option.label}
              accessibilityState={{ selected: option.code === language }}
              style={{
                padding: theme.spacing.base,
                borderRadius: theme.radius.lg,
                backgroundColor:
                  option.code === language ? theme.colors.electricDim : theme.colors.soft,
              }}
            >
              <Row justify="space-between">
                <View>
                  <Text variant="bodyStrong">{option.nativeLabel}</Text>
                  <Text
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={{ marginTop: 2 }}
                  >
                    {option.label}
                    {option.rtl ? ' · right-to-left layout' : ''}
                  </Text>
                </View>
                {option.code === language && (
                  <Icon name="check" size={18} color={theme.colors.electric} />
                )}
              </Row>
            </Pressable>
          ))}
          <Text
            variant="micro"
            color={theme.colors.textTertiary}
            style={{ marginTop: theme.spacing.sm }}
          >
            Arabic mirrors the layout immediately, with no app restart — every row, icon and
            alignment is direction-aware in JavaScript rather than relying on a native RTL reload.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
