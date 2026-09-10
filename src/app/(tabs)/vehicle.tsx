import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CONNECTIVITY_COPY,
  COMMAND_COPY,
  COMMAND_PROGRESS_COPY,
  isInFlight,
  type CommandType,
  type TransientEvent,
} from '@/domain/entities';
import { useTheme, useViewport } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  ListRow,
  PAGE_PADDING,
  Pressable,
  Row,
  Screen,
  Text,
  type IconName,
} from '@/components/design-system';
import { VehicleScene } from '@/components/vehicle-3d';
import { EmptyState } from '@/components/feedback';
import {
  useConnection,
  useNotificationBadge,
  useSendCommand,
  useVehicle,
  useVehicleState,
} from '@/hooks';
import { useAppStore, useCommandStore, useUiStore } from '@/stores';

/** How long a settled command's outcome line stays on screen. */
const SETTLED_LINE_MS = 6000;
import { selectPresentedEventIds } from '@/stores/command-store';
import { relativeTime } from '@/utils/time';
import { formatRange } from '@/utils/format';

/**
 * Vehicle home.
 *
 * Charcoal ground, and the hierarchy of the reference: identity, a compact
 * battery line, the vehicle photograph, four quick controls, contextual
 * charging, then quiet navigation rows.
 *
 * The vehicle sits in a defined stage sized from the app surface, so the whole
 * car — body, mirrors and wheels — is always in frame and never distorted, on
 * a phone or in the desktop preview.
 *
 * Quick controls render the vehicle's CONFIRMED state. Pressing Unlock does not
 * light the control; the vehicle acknowledging the unlock does.
 */
export default function VehicleScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { width } = useViewport();

  const state = useVehicleState();

  const connection = useConnection();
  const { data: vehicle } = useVehicle();
  const send = useSendCommand();
  const showBanner = useUiStore((s) => s.showBanner);
  const user = useAppStore((s) => s.user);
  const units = useAppStore((s) => s.units);
  const unread = useNotificationBadge();
  const commands = useCommandStore((s) => s.commands);
  const presentedEventIds = useCommandStore(selectPresentedEventIds);
  const markEventPresented = useCommandStore((s) => s.markEventPresented);

  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(true);

  // The GL surface stops drawing when this tab is not the visible one.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onEventPresented = useCallback(
    (event: TransientEvent) => markEventPresented(event),
    [markEventPresented],
  );

  const onCommand = useCallback(
    async (type: CommandType) => {
      const result = await send(type);
      if (!result.ok) showBanner(result.reason, 'warning');
    },
    [send, showBanner],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  const inFlight = useMemo(
    () => Object.values(commands).filter((c) => isInFlight(c.status)),
    [commands],
  );
  const pending = useMemo(() => new Set(inFlight.map((c) => c.type)), [inFlight]);

  /**
   * A short outcome line that appears when a command settles and then clears.
   *
   * It is held in state with its own timer rather than derived from a
   * `Date.now()` comparison: a pure derivation only recomputes when its inputs
   * change, and once the last command settles nothing changes again — so the
   * line would stay on screen indefinitely.
   *
   * An uncertain outcome stays uncertain: a command with no acknowledgement is
   * reported as unconfirmed, never converted into a definite failure.
   */
  const [settledLine, setSettledLine] = useState<string | null>(null);

  useEffect(() => {
    const recent = Object.values(commands)
      .filter((c) => c.completedAt)
      .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))[0];
    if (!recent) return;
    const age = Date.now() - new Date(recent.completedAt!).getTime();
    if (age > SETTLED_LINE_MS) return;

    setSettledLine(
      recent.status === 'confirmed'
        ? `${COMMAND_COPY[recent.type]} — done.`
        : recent.failureCode === 'no_acknowledgment'
          ? 'Confirmation unavailable.'
          : `${COMMAND_COPY[recent.type]} — not confirmed.`,
    );
    const timer = setTimeout(() => setSettledLine(null), SETTLED_LINE_MS - age);
    return () => clearTimeout(timer);
  }, [commands]);

  const operationLine = inFlight[0]
    ? COMMAND_PROGRESS_COPY[inFlight[0].type]
    : settledLine;

  if (!state || !vehicle) {
    return (
      <Screen tabBarPadding>
        <View style={{ paddingHorizontal: PAGE_PADDING }}>
          <EmptyState icon="car" title={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  const range = formatRange(state.charge.estimatedRangeKm, units);
  const locked = state.lock === 'locked';
  const charging = state.charge.status === 'charging';
  const connectivity = CONNECTIVITY_COPY[state.connectivity];
  const stageWidth = width - PAGE_PADDING * 2;

  return (
    <Screen
      tabBarPadding
      contentStyle={{ paddingHorizontal: 0 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.textSecondary}
        />
      }
    >
      {/* 1. Vehicle name and selector. */}
      <View style={{ paddingHorizontal: PAGE_PADDING }}>
        <Row justify="space-between" align="center">
          <Pressable
            onPress={() => router.push('/vehicles')}
            haptic="light"
            minTouchTarget={false}
            accessibilityLabel={t('vehicle.selectVehicle')}
            accessibilityHint={`${vehicle.model} ${vehicle.trim}`}
            style={{ flex: 1 }}
          >
            <Row gap={6}>
              <Text variant="heading" numberOfLines={1}>
                {vehicle.name}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </Row>
          </Pressable>

          <Row gap={theme.spacing.xs}>
            <IconAction
              icon="bell"
              label={`${t('notifications.title')}${unread > 0 ? `, ${unread} unread` : ''}`}
              badge={unread > 0}
              onPress={() => router.push('/notifications')}
            />
            <Pressable
              onPress={() => router.push('/profile')}
              haptic="light"
              minTouchTarget={false}
              accessibilityLabel={`${t('profile.title')} — ${user?.fullName ?? 'account'}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: theme.colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="micro" color={theme.colors.textPrimary}>
                {user?.initials ?? 'NA'}
              </Text>
            </Pressable>
          </Row>
        </Row>

        {/* 2. Compact battery, range and charging status. */}
        <Row gap={theme.spacing.sm} align="center" style={{ marginTop: theme.spacing.sm }} wrap>
          <BatteryPip percent={state.charge.batteryPercent} charging={charging} />
          <Text variant="bodyStrong" numeric>
            {`${state.charge.batteryPercent}%`}
          </Text>
          <Text variant="caption" color={theme.colors.textSecondary} numeric>
            {`${range.value} ${range.unit}`}
          </Text>
          {charging && (
            <Text variant="caption" color={theme.colors.green} numeric>
              {`${state.charge.powerKw} kW`}
            </Text>
          )}
        </Row>
        {/* Freshness line.
            `connection.label` is about this app's link to the service;
            `connectivity.label` is about the vehicle's own link, as the vehicle
            last reported it. They are different failures and read differently. */}
        <Text
          variant="micro"
          color={connection.stale ? theme.colors.amber : theme.colors.textTertiary}
          style={{ marginTop: 2 }}
        >
          {`${connection.status === 'live' ? connectivity.label : connection.label} · ${
            state.isCached || connection.stale ? t('common.cached') : t('common.live')
          } ${relativeTime(state.lastUpdatedAt)}`}
        </Text>
      </View>

      {/* 3. The vehicle itself — the same model and state mapping as Controls,
             so an open panel looks identical on both screens. */}
      <View style={{ alignItems: 'center', marginTop: theme.spacing.base }}>
        <VehicleScene
          state={state}
          preset="hero"
          paintHex={vehicle.paintHex}
          active={focused}
          presentedEventIds={presentedEventIds}
          onEventPresented={onEventPresented}
          accessibilityLabel={`${vehicle.model}, ${vehicle.colorName}`}
          style={{ width: stageWidth, height: stageWidth * 0.62 }}
        />
      </View>

      {/* Concise current-operation feedback, in the vehicle's own vocabulary. */}
      {operationLine && (
        <Text
          variant="caption"
          color={theme.colors.textSecondary}
          align="center"
          style={{ marginTop: theme.spacing.xs, paddingHorizontal: PAGE_PADDING }}
        >
          {operationLine}
        </Text>
      )}

      {/* 4. Four quick controls. */}
      <Row
        justify="space-between"
        style={{ marginTop: theme.spacing.base, paddingHorizontal: PAGE_PADDING }}
      >
        <QuickControl
          icon={locked ? 'lock' : 'unlock'}
          label={locked ? t('vehicle.unlock') : t('vehicle.lock')}
          active={!locked}
          pending={pending.has('lock') || pending.has('unlock')}
          disabled={!vehicle.capabilities.remoteLock}
          onPress={() => void onCommand(locked ? 'unlock' : 'lock')}
        />
        <QuickControl
          icon="climate"
          label={t('climate.title')}
          active={state.climate.active}
          disabled={!vehicle.capabilities.remoteClimate}
          onPress={() => router.push('/climate')}
        />
        <QuickControl
          icon="charge"
          label={t('vehicle.energy')}
          active={charging}
          onPress={() => router.push('/energy')}
        />
        <QuickControl
          icon="trunk"
          label={t('controls.trunk')}
          active={state.trunk === 'open'}
          pending={pending.has('open_trunk') || pending.has('close_trunk')}
          disabled={!vehicle.capabilities.remoteTrunk}
          onPress={() => void onCommand(state.trunk === 'open' ? 'close_trunk' : 'open_trunk')}
        />
      </Row>

      {/* 5. Charging context, only while a session is running. */}
      {charging && (
        <View style={{ marginTop: theme.spacing.lg, paddingHorizontal: PAGE_PADDING }}>
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.base,
              borderWidth: 1,
              borderColor: theme.colors.line,
            }}
          >
            <Row justify="space-between">
              <Text variant="caption" color={theme.colors.green}>
                {`${t('charging.title')} · ${state.charge.chargeLimitPercent}%`}
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary} numeric>
                {state.charge.minutesRemaining
                  ? `${state.charge.minutesRemaining} min`
                  : state.charge.locationLabel}
              </Text>
            </Row>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.inset,
                marginTop: theme.spacing.sm,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${state.charge.batteryPercent}%`,
                  height: 4,
                  backgroundColor: theme.colors.green,
                }}
              />
            </View>
          </View>
        </View>
      )}

      {/* 6. Quiet navigation rows. */}
      <View style={{ marginTop: theme.spacing.lg, paddingHorizontal: PAGE_PADDING }}>
        <NavRow icon="grid" title={t('controls.title')} onPress={() => router.push('/controls')} />
        <NavRow icon="climate" title={t('climate.title')} onPress={() => router.push('/climate')} />
        <NavRow
          icon="location"
          title={t('location.title')}
          onPress={() => router.push('/location')}
        />
        <NavRow icon="shield" title={t('profile.security')} onPress={() => router.push('/security')} />
        <NavRow icon="wrench" title={t('service.title')} onPress={() => router.push('/service')} />
      </View>

      {/* An unreachable vehicle is stated, not hidden. */}
      {state.connectivity !== 'online' && (
        <View style={{ marginTop: theme.spacing.base, paddingHorizontal: PAGE_PADDING }}>
          <Row gap={theme.spacing.sm} align="flex-start">
            <Icon
              name={state.connectivity === 'asleep' ? 'moon' : 'signal'}
              size={15}
              color={theme.colors.textTertiary}
            />
            <Text variant="micro" color={theme.colors.textTertiary} style={{ flex: 1 }}>
              {connectivity.detail}
            </Text>
          </Row>
        </View>
      )}
    </Screen>
  );
}

const IconAction = ({
  icon,
  label,
  onPress,
  badge = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      minTouchTarget={false}
      accessibilityLabel={label}
      style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={19} color={theme.colors.textSecondary} />
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: theme.colors.blue,
          }}
        />
      )}
    </Pressable>
  );
};

const BatteryPip = ({ percent, charging }: { percent: number; charging: boolean }) => {
  const theme = useTheme();
  const tint = charging ? theme.colors.green : percent <= 15 ? theme.colors.red : theme.colors.textPrimary;
  return (
    <View
      style={{
        width: 24,
        height: 12,
        borderRadius: 3,
        borderWidth: 1.2,
        borderColor: theme.colors.textSecondary,
        padding: 1.5,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: `${Math.max(6, percent)}%`,
          height: '100%',
          borderRadius: 1,
          backgroundColor: tint,
        }}
      />
    </View>
  );
};

/** Square quick control. Charcoal when idle, blue when the state is confirmed on. */
const QuickControl = ({
  icon,
  label,
  onPress,
  active = false,
  pending = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  pending?: boolean;
  disabled?: boolean;
}) => {
  const theme = useTheme();
  const tint = disabled
    ? theme.colors.textTertiary
    : active
      ? theme.colors.textInverse
      : theme.colors.textPrimary;

  return (
    <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled || pending}
        haptic="medium"
        scaleTo={0.94}
        minTouchTarget={false}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled: disabled || pending }}
        style={{
          width: 60,
          height: 56,
          borderRadius: theme.radius.lg,
          backgroundColor: active ? theme.colors.blue : theme.colors.soft,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pending ? 0.55 : 1,
        }}
      >
        <Icon name={icon} size={22} color={tint} strokeWidth={1.7} />
      </Pressable>
      <Text variant="micro" color={theme.colors.textSecondary} align="center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const NavRow = ({
  icon,
  title,
  onPress,
}: {
  icon: IconName;
  title: string;
  onPress: () => void;
}) => {
  const theme = useTheme();
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.line }}>
      <ListRow icon={icon} title={title} onPress={onPress} />
    </View>
  );
};
