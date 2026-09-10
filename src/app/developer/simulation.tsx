import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  Row,
  Screen,
  SectionHeader,
  Surface,
  Text,
  Toggle,
  Pressable,
} from '@/components/design-system';
import { StackHeader } from '@/features/shared/StackHeader';
import {
  CHARGING_STATUS_COPY,
  CONNECTIVITY_COPY,
  type ChargingStatus,
  type ConnectivityMode,
} from '@/domain/entities';
import { CONNECTIVITY_PROFILES } from '@/infrastructure/command-simulator';
import { useVehicleState } from '@/hooks';
import { useAppStore, useSimulationStore, useUiStore } from '@/stores';

const MODES: ConnectivityMode[] = ['online', 'asleep', 'poor_signal', 'offline', 'service_mode'];
const SCENARIOS: ChargingStatus[] = [
  'not_plugged_in',
  'connected_not_charging',
  'charging',
  'complete',
  'fault',
  'scheduled',
];

/**
 * Developer simulation panel.
 *
 * The presenter's control surface. Every failure mode this app is designed to
 * handle can be triggered here on demand, so a demo never has to wait for a bad
 * network or apologise for a happy path.
 */
export default function SimulationScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const state = useVehicleState();
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const showBanner = useUiStore((s) => s.showBanner);

  const connectivity = useSimulationStore((s) => s.connectivity);
  const setConnectivity = useSimulationStore((s) => s.setConnectivity);
  const chargingScenario = useSimulationStore((s) => s.chargingScenario);
  const setChargingScenario = useSimulationStore((s) => s.setChargingScenario);
  const isMoving = useSimulationStore((s) => s.isMoving);
  const setMoving = useSimulationStore((s) => s.setMoving);
  const forceBiometricFailure = useSimulationStore((s) => s.forceBiometricFailure);
  const setForceBiometricFailure = useSimulationStore((s) => s.setForceBiometricFailure);
  const resetAll = useSimulationStore((s) => s.resetAll);

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('developer.simulation')}
        subtitle="Not part of the customer experience"
      />

      <Surface tone="soft">
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="info" size={19} color={theme.colors.desert} />
          <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
            These controls drive the mock connected cloud directly. In a production build this
            screen would not ship — the equivalent switches live in a staging environment and a
            fleet test harness.
          </Text>
        </Row>
      </Surface>

      {/* Connectivity */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader
          title={t('developer.connectivity')}
          subtitle="Changes how the command engine behaves for every subsequent command."
        />
        <View style={{ gap: theme.spacing.md }}>
          {MODES.map((mode) => {
            const profile = CONNECTIVITY_PROFILES[mode];
            const selected = connectivity === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => {
                  setConnectivity(mode);
                  showBanner(
                    `Vehicle connectivity set to ${CONNECTIVITY_COPY[mode].label}.`,
                    'info',
                  );
                }}
                haptic="medium"
                scaleTo={0.985}
                accessibilityLabel={CONNECTIVITY_COPY[mode].label}
                accessibilityState={{ selected }}
              >
                <Surface
                  style={selected ? { borderColor: 'rgba(143,227,192,0.4)' } : undefined}
                  tone={selected ? 'elevated' : 'outline'}
                >
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <Row gap={theme.spacing.sm}>
                        <Icon
                          name={
                            mode === 'asleep'
                              ? 'moon'
                              : mode === 'service_mode'
                                ? 'wrench'
                                : 'signal'
                          }
                          size={17}
                          color={selected ? theme.colors.electric : theme.colors.textSecondary}
                        />
                        <Text
                          variant="bodyStrong"
                          color={selected ? theme.colors.electric : undefined}
                        >
                          {CONNECTIVITY_COPY[mode].label}
                        </Text>
                      </Row>
                      <Text
                        variant="caption"
                        color={theme.colors.textSecondary}
                        style={{ marginTop: 6 }}
                      >
                        {CONNECTIVITY_COPY[mode].detail}
                      </Text>
                      <Text
                        variant="mono"
                        color={theme.colors.textTertiary}
                        style={{ marginTop: 6 }}
                      >
                        {profile.reachable
                          ? `latency ×${profile.latencyMultiplier} · timeout ${(profile.timeoutProbability * 100).toFixed(0)}%${profile.wakeMs ? ` · wake ${profile.wakeMs[0] / 1000}–${profile.wakeMs[1] / 1000}s` : ''}`
                          : 'unreachable · commands fail or expire'}
                      </Text>
                    </View>
                    {selected && <Icon name="check" size={18} color={theme.colors.electric} />}
                  </Row>
                </Surface>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Charging scenario */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('developer.chargingScenario')} />
        <Row wrap gap={theme.spacing.sm}>
          {SCENARIOS.map((scenario) => {
            const selected = chargingScenario === scenario;
            return (
              <Pressable
                key={scenario}
                onPress={() => setChargingScenario(vehicleId, scenario)}
                haptic="light"
                scaleTo={0.95}
                minTouchTarget={false}
                accessibilityLabel={CHARGING_STATUS_COPY[scenario]}
                accessibilityState={{ selected }}
                style={{
                  paddingHorizontal: theme.spacing.base,
                  paddingVertical: theme.spacing.md,
                  borderRadius: theme.radius.pill,
                  backgroundColor: selected ? theme.colors.electricDim : theme.colors.soft,
                  borderWidth: 1,
                  borderColor: selected ? 'rgba(143,227,192,0.4)' : theme.colors.line,
                }}
              >
                <Text
                  variant="caption"
                  color={selected ? theme.colors.electric : theme.colors.textSecondary}
                >
                  {CHARGING_STATUS_COPY[scenario]}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </View>

      {/* Failure injection */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title="Vehicle state & failure injection" />
        <Surface>
          <View style={{ gap: theme.spacing.lg }}>
            <Toggle
              label="Vehicle is moving"
              description="Blocks unlock, lock, trunk and charging commands — the vehicle refuses them in motion."
              value={isMoving}
              onChange={(value) => setMoving(vehicleId, value)}
            />
            <Toggle
              label="Force biometric failure"
              description="Every step-up prompt is refused, so the biometric rejection path can be demonstrated."
              value={forceBiometricFailure}
              onChange={setForceBiometricFailure}
            />
          </View>
        </Surface>
      </View>

      {/* Current state */}
      {state && (
        <View style={{ marginTop: theme.spacing.xxl }}>
          <SectionHeader title="Live state snapshot" />
          <Surface padded="tight">
            <View style={{ gap: 6 }}>
              <StateLine label="connectivity" value={state.connectivity} />
              <StateLine label="lock" value={state.lock} />
              <StateLine label="gear" value={state.gear} />
              <StateLine label="isMoving" value={String(state.isMoving)} />
              <StateLine label="isCached" value={String(state.isCached)} />
              <StateLine label="battery" value={`${state.charge.batteryPercent.toFixed(1)}%`} />
              <StateLine label="charge.status" value={state.charge.status} />
              <StateLine label="climate.active" value={String(state.climate.active)} />
              <StateLine label="interiorTempC" value={state.climate.interiorTempC.toFixed(1)} />
              <StateLine label="location.isLive" value={String(state.location.isLive)} />
            </View>
          </Surface>
        </View>
      )}

      <View style={{ marginTop: theme.spacing.xl }}>
        <Button
          label={t('developer.reset')}
          icon="refresh"
          variant="secondary"
          onPress={() => {
            resetAll(vehicleId);
            showBanner('Simulation reset to its initial state.', 'success');
          }}
        />
      </View>
    </Screen>
  );
}

const StateLine = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <Row justify="space-between">
      <Text variant="mono" color={theme.colors.textTertiary}>
        {label}
      </Text>
      <Text variant="mono" color={theme.colors.electric}>
        {value}
      </Text>
    </Row>
  );
};
