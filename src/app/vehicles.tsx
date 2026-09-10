import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  Pressable,
  Row,
  Screen,
  StatusPill,
  Surface,
  Text,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import { VehicleScene } from '@/components/vehicle-3d';
import type { VehicleCapabilities } from '@/domain/entities';
import { useVehicles, useVehicleState } from '@/hooks';
import { useAppStore, useCommandStore, useUiStore } from '@/stores';
import { selectPresentedEventIds } from '@/stores/command-store';

/**
 * Garage.
 *
 * Three demo vehicles with genuinely different capability profiles. Switching
 * between them is the fastest way to see the capability model working: controls
 * disappear, screens explain themselves, and nothing breaks.
 */
export default function VehiclesScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { data: vehicles, isLoading } = useVehicles();
  const activeId = useAppStore((s) => s.activeVehicleId);
  const setActive = useAppStore((s) => s.setActiveVehicle);
  const showBanner = useUiStore((s) => s.showBanner);
  const state = useVehicleState();
  const presentedEventIds = useCommandStore(selectPresentedEventIds);

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('profile.vehicles')}
        subtitle="Switch vehicles to see the capability model adapt the whole app"
      />

      {isLoading ? (
        <EmptyState icon="car" title={t('common.loading')} />
      ) : (
        <View style={{ gap: theme.spacing.base }}>
          {(vehicles ?? []).map((vehicle) => {
            const active = vehicle.id === activeId;
            const supported = countCapabilities(vehicle.capabilities);
            return (
              <Pressable
                key={vehicle.id}
                onPress={() => {
                  setActive(vehicle.id);
                  showBanner(`Switched to ${vehicle.name}.`, 'success');
                }}
                haptic="medium"
                scaleTo={0.985}
                accessibilityLabel={`${vehicle.name}, ${vehicle.trim}`}
                accessibilityState={{ selected: active }}
              >
                <Surface
                  style={
                    active
                      ? {
                          borderColor: 'rgba(143,227,192,0.4)',
                          backgroundColor: theme.colors.surface,
                        }
                      : undefined
                  }
                >
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <Text variant="heading">{vehicle.name}</Text>
                      <Text
                        variant="caption"
                        color={theme.colors.textSecondary}
                        style={{ marginTop: 2 }}
                      >
                        {vehicle.modelYear} · {vehicle.trim} · {vehicle.colorName}
                      </Text>
                    </View>
                    {active && <StatusPill label="Active" tone="electric" />}
                  </Row>

                  <View style={{ alignItems: 'center', marginVertical: theme.spacing.sm }}>
                    {/* Only the active vehicle draws a live scene: one GL
                        surface per screen, not one per row in a list. */}
                    {active ? (
                      <VehicleScene
                        state={state}
                        preset="hero"
                        paintHex={vehicle.paintHex}
                        active
                        presentedEventIds={presentedEventIds}
                        accessibilityLabel={`${vehicle.model}, ${vehicle.colorName}`}
                        style={{ width: 260, height: 150 }}
                      />
                    ) : (
                      <View style={{ width: 260, height: 150, justifyContent: 'center' }}>
                        <Text variant="caption" color={theme.colors.textTertiary} align="center">
                          {`${vehicle.colorName} · ${vehicle.trim}`}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Row justify="space-between" wrap gap={theme.spacing.md}>
                    <Spec label="Battery" value={`${vehicle.batteryCapacityKwh} kWh`} />
                    <Spec label="Range" value={`${vehicle.maxRangeKm} km`} />
                    <Spec label="DC peak" value={`${vehicle.maxDcChargeKw} kW`} />
                    <Spec label="Software" value={vehicle.softwareVersion} />
                  </Row>

                  <View
                    style={{
                      height: 1,
                      backgroundColor: theme.colors.line,
                      marginVertical: theme.spacing.base,
                    }}
                  />

                  <Row justify="space-between">
                    <Row gap={6}>
                      <Icon name="shield" size={14} color={theme.colors.textTertiary} />
                      <Text variant="micro" color={theme.colors.textTertiary}>
                        VIN {vehicle.vinMasked}
                      </Text>
                    </Row>
                    <Text variant="micro" color={theme.colors.textSecondary}>
                      {supported.enabled} of {supported.total} remote features
                    </Text>
                  </Row>

                  <Row wrap gap={6} style={{ marginTop: theme.spacing.md }}>
                    {capabilityChips(vehicle.capabilities).map((chip) => (
                      <View
                        key={chip.label}
                        style={{
                          backgroundColor: chip.on ? theme.colors.electricDim : theme.colors.soft,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: theme.radius.sm,
                        }}
                      >
                        <Text
                          variant="micro"
                          color={chip.on ? theme.colors.electric : theme.colors.textTertiary}
                        >
                          {chip.label}
                        </Text>
                      </View>
                    ))}
                  </Row>
                </Surface>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const Spec = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="mono" color={theme.colors.textTertiary}>
        {label.toUpperCase()}
      </Text>
      <Text variant="bodyStrong" numeric style={{ marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
};

const capabilityChips = (capabilities: VehicleCapabilities) => [
  { label: 'Lock', on: capabilities.remoteLock },
  { label: 'Climate', on: capabilities.remoteClimate },
  { label: 'Trunk', on: capabilities.remoteTrunk },
  { label: 'Charge control', on: capabilities.chargeControl },
  { label: 'Scheduling', on: capabilities.chargeScheduling },
  { label: 'Location', on: capabilities.location },
  { label: 'OTA', on: capabilities.otaUpdates },
  {
    label:
      capabilities.digitalKey === 'none'
        ? 'No Digital Key'
        : capabilities.digitalKey.toUpperCase().replace(/_/g, ' + '),
    on: capabilities.digitalKey !== 'none',
  },
];

const countCapabilities = (capabilities: VehicleCapabilities) => {
  const chips = capabilityChips(capabilities);
  return { enabled: chips.filter((c) => c.on).length, total: chips.length };
};
