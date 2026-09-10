import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  ChargeLimitBar,
  Icon,
  ListRow,
  PAGE_PADDING,
  PageHeader,
  Pressable,
  Row,
  Screen,
  Surface,
  Text,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { CHARGING_STATUS_COPY } from '@/domain/entities';
import {
  canStartCharging,
  canStopCharging,
  estimateMinutesToLimit,
} from '@/domain/use-cases';
import { useSendCommand, useVehicle, useVehicleState } from '@/hooks';
import { useAppStore, useUiStore } from '@/stores';
import { simulationControl } from '@/infrastructure/api';
import { formatDuration } from '@/utils/time';
import { formatRange } from '@/utils/format';

const PRESETS = [50, 70, 80, 100];

/**
 * Energy.
 *
 * The information hierarchy is: schedule, then the charge limit, then the live
 * session, then history.
 *
 * The critical distinction on this screen is between two numbers that look
 * similar and are not: the green fill is the battery's MEASURED state of
 * charge, and the knob is the charge limit the user has SELECTED. Dragging the
 * limit never moves the measured percentage — only the vehicle does that.
 */
export default function EnergyScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const send = useSendCommand();
  const showBanner = useUiStore((s) => s.showBanner);
  const units = useAppStore((s) => s.units);
  const vehicleId = useAppStore((s) => s.activeVehicleId);

  /** Local echo of the limit while a drag is in progress. */
  const [draftLimit, setDraftLimit] = useState<number | null>(null);

  const commitLimit = useCallback(
    (value: number) => {
      simulationControl.patchCharge(vehicleId, { chargeLimitPercent: value });
      setDraftLimit(null);
    },
    [vehicleId],
  );

  const onStart = useCallback(async () => {
    if (!state || !vehicle) return;
    const check = canStartCharging(state.charge, vehicle.capabilities);
    if (!check.ok) {
      showBanner(check.message, 'warning');
      return;
    }
    const result = await send('start_charging');
    if (!result.ok) showBanner(result.reason, 'warning');
  }, [state, vehicle, send, showBanner]);

  const onStop = useCallback(async () => {
    if (!state) return;
    const check = canStopCharging(state.charge);
    if (!check.ok) {
      showBanner(check.message, 'warning');
      return;
    }
    const result = await send('stop_charging');
    if (!result.ok) showBanner(result.reason, 'warning');
  }, [state, send, showBanner]);

  const charge = state?.charge;
  const minutes = useMemo(() => {
    if (!charge || !vehicle) return null;
    return charge.minutesRemaining ?? estimateMinutesToLimit(charge, vehicle.batteryCapacityKwh);
  }, [charge, vehicle]);

  if (!state || !vehicle || !charge) {
    return (
      <Screen>
        <PageHeader title={t('charging.energyTitle')} />
        <EmptyState icon="charge" title={t('common.loading')} />
      </Screen>
    );
  }

  const limit = draftLimit ?? charge.chargeLimitPercent;
  const charging = charge.status === 'charging';
  const plugged = charge.status !== 'not_plugged_in';
  const range = formatRange(charge.estimatedRangeKm, units);
  const added = formatRange(charge.addedRangeKm, units);
  const startCheck = canStartCharging(charge, vehicle.capabilities);

  return (
    <Screen>
      <View>
        <PageHeader title={t('charging.energyTitle')} />
      </View>

      <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: theme.spacing.lg, gap: theme.spacing.base }}>
        {/* Dark scheduling banner, shown only when a schedule actually exists. */}
        {charge.scheduleEnabled && vehicle.capabilities.chargeScheduling && (
          <Pressable
            onPress={() =>
              simulationControl.patchCharge(vehicleId, { scheduleEnabled: false })
            }
            haptic="light"
            scaleTo={0.99}
            accessibilityLabel={t('charging.scheduledFor', { time: charge.scheduleStart })}
            accessibilityHint={t('charging.scheduled')}
            style={{
              backgroundColor: theme.colors.charcoal,
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.lg,
              paddingHorizontal: theme.spacing.base,
              paddingVertical: theme.spacing.base,
            }}
          >
            <Row justify="space-between">
              <Row gap={theme.spacing.sm}>
                <Icon name="clock" size={18} color={theme.colors.textInverse} />
                <Text variant="bodyStrong" color={theme.colors.textInverse}>
                  {t('charging.scheduledFor', { time: charge.scheduleStart })}
                </Text>
              </Row>
              <Icon name="arrow-right" size={18} color={theme.colors.textInverse} />
            </Row>
          </Pressable>
        )}

        {/* Charge limit. */}
        <Surface padded="loose">
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <Text variant="heading">{t('charging.chargeLimit')}</Text>
              <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                {`${vehicle.trim} · ${range.value} ${range.unit}`}
              </Text>
            </View>
          </Row>

          <View style={{ marginTop: theme.spacing.base }}>
            <ChargeLimitBar
              batteryPercent={charge.batteryPercent}
              limitPercent={limit}
              onChange={setDraftLimit}
              onCommit={commitLimit}
              disabled={!vehicle.capabilities.chargeControl}
            />
          </View>

          <Row gap={theme.spacing.sm} style={{ marginTop: theme.spacing.base }}>
            {PRESETS.map((preset) => {
              const selected = charge.chargeLimitPercent === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => commitLimit(preset)}
                  disabled={!vehicle.capabilities.chargeControl}
                  haptic="light"
                  scaleTo={0.95}
                  minTouchTarget={false}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('charging.chargeLimit')} ${preset}%`}
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? theme.colors.blue : theme.colors.soft,
                  }}
                >
                  <Text
                    variant="bodyStrong"
                    numeric
                    color={selected ? theme.colors.textInverse : theme.colors.textPrimary}
                  >
                    {`${preset}%`}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </Surface>

        {/* Live session, or a useful empty state when unplugged. */}
        <Surface padded="loose">
          <Row justify="space-between" align="center">
            <Text variant="heading">{CHARGING_STATUS_COPY[charge.status]}</Text>
            {charging && (
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.green }}
              />
            )}
          </Row>

          {plugged ? (
            <>
              <Row justify="space-between" wrap gap={theme.spacing.base} style={{ marginTop: theme.spacing.base }}>
                <Metric label={t('charging.power')} value={charging ? charge.powerKw.toFixed(1) : '—'} unit="kW" />
                <Metric
                  label={t('charging.added')}
                  value={charge.addedRangeKm > 0 ? added.value : '—'}
                  unit={added.unit}
                />
                <Metric
                  label={t('charging.timeToLimit')}
                  value={charging && minutes ? formatDuration(minutes) : '—'}
                />
              </Row>
              <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.md }}>
                {`${t('charging.connectedTo')} ${charge.locationLabel}`}
              </Text>
            </>
          ) : (
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.sm }}>
              {t('charging.notPluggedInBody')}
            </Text>
          )}

          {charge.status === 'fault' && charge.faultReason && (
            <Row gap={theme.spacing.sm} align="flex-start" style={{ marginTop: theme.spacing.md }}>
              <Icon name="alert" size={18} color={theme.colors.red} />
              <Text variant="caption" color={theme.colors.red} style={{ flex: 1 }}>
                {charge.faultReason}
              </Text>
            </Row>
          )}

          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label={charging ? t('charging.stopCharging') : t('charging.startCharging')}
              variant={charging ? 'secondary' : 'primary'}
              // An unsupported action is disabled and explained, never a button
              // that pretends to work and then fails.
              disabled={!vehicle.capabilities.chargeControl || (!charging && !startCheck.ok)}
              accessibilityHint={!charging && !startCheck.ok ? startCheck.message : undefined}
              onPress={() => void (charging ? onStop() : onStart())}
            />
            {!charging && !startCheck.ok && (
              <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.sm }}>
                {startCheck.message}
              </Text>
            )}
          </View>
        </Surface>

        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="clock"
              title={t('charging.history')}
              onPress={() => router.push('/charging-history')}
            />
          </View>
        </Surface>

        <Text variant="micro" color={theme.colors.textSecondary} style={{ paddingHorizontal: theme.spacing.xs }}>
          {`Battery health ${charge.batteryHealthPercent}% of original capacity, measured by the vehicle.`}
        </Text>
      </View>
    </Screen>
  );
}

const Metric = ({ label, value, unit }: { label: string; value: string; unit?: string }) => {
  const theme = useTheme();
  return (
    <View style={{ minWidth: 84 }}>
      <Text variant="micro" color={theme.colors.textSecondary}>
        {label}
      </Text>
      <Row align="flex-end" gap={3} style={{ marginTop: 2 }}>
        <Text variant="subheading" numeric>
          {value}
        </Text>
        {unit && (
          <Text variant="micro" color={theme.colors.textSecondary} style={{ marginBottom: 3 }}>
            {unit}
          </Text>
        )}
      </Row>
    </View>
  );
};
