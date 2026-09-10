import React, { useCallback, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CommandType, DoorId, TransientEvent } from '@/domain/entities';
import { COMMAND_PROGRESS_COPY, DOOR_COPY } from '@/domain/entities';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  PAGE_PADDING,
  PageHeader,
  Pressable,
  Row,
  Screen,
  SegmentedControl,
  Sheet,
  Text,
  type IconName,
} from '@/components/design-system';
import {
  CAMERA_PRESETS,
  HINGES,
  HOTSPOT_ANCHOR,
  PART_DOOR,
  VEHICLE_PARTS,
  VehicleScene,
  projectAnchor,
  separateHotspots,
  type CameraPreset,
  type VehiclePart,
} from '@/components/vehicle-3d';
import { EmptyState } from '@/components/feedback';
import { DriveAuthorizationStrip } from '@/features/remote-controls/DriveAuthorizationStrip';
import { useSendCommand, useVehicle, useVehicleState } from '@/hooks';
import { useCommandStore, useUiStore } from '@/stores';
import { selectPresentedEventIds } from '@/stores/command-store';

/**
 * Controls.
 *
 * The vehicle is the interface. Hotspots are projected from the model's own
 * anchor points through the active camera, so they track the panels they act on
 * at every preset instead of being pinned to fractions of a photograph. Each
 * one is a small dot with a generous touch target; the label and the actions
 * live in a bottom sheet, which is what removed the large translucent pills
 * that used to sit across the bodywork.
 *
 * Every hotspot has a row in the accessible list below the scene, so nothing
 * here depends on being able to hit a target inside a 3D view.
 */

const PRESETS: CameraPreset[] = ['exterior', 'topDown', 'rear', 'cabin'];

/** Keeps the scene from stretching into empty space on a tall phone. */
const SCENE_MAX_HEIGHT = 340;

/** Order the parts are listed in — front of the vehicle to the back. */
const PART_ORDER: VehiclePart[] = [
  'frontTrunk',
  'driverDoor',
  'passengerDoor',
  'rearLeftDoor',
  'rearRightDoor',
  'chargePort',
  'rearTrunk',
];

/** What each part reports, and which commands move it. */
type PartBinding = {
  icon: IconName;
  isOpen: (s: NonNullable<ReturnType<typeof useVehicleState>>) => boolean;
  open?: CommandType;
  close?: CommandType;
  payload?: Record<string, string>;
  capability?: (c: { [k: string]: unknown }) => boolean;
};

const doorBinding = (door: DoorId): PartBinding => ({
  icon: 'car',
  isOpen: (s) => s.doors[door] === 'open',
  open: 'open_door',
  close: 'close_door',
  payload: { door },
});

const BINDINGS: Record<VehiclePart, PartBinding> = {
  driverDoor: doorBinding('frontLeft'),
  passengerDoor: doorBinding('frontRight'),
  rearLeftDoor: doorBinding('rearLeft'),
  rearRightDoor: doorBinding('rearRight'),
  rearTrunk: {
    icon: 'trunk',
    isOpen: (s) => s.trunk === 'open',
    open: 'open_trunk',
    close: 'close_trunk',
  },
  frontTrunk: {
    icon: 'frunk',
    isOpen: (s) => s.frunk === 'open',
    open: 'open_frunk',
    close: 'close_frunk',
  },
  chargePort: {
    icon: 'charge',
    isOpen: (s) => s.charge.portOpen,
    open: 'open_charge_port',
    close: 'close_charge_port',
  },
};

export default function ControlsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const send = useSendCommand();
  const showBanner = useUiStore((s) => s.showBanner);
  const commands = useCommandStore((s) => s.commands);
  const presentedEventIds = useCommandStore(selectPresentedEventIds);
  const markEventPresented = useCommandStore((s) => s.markEventPresented);

  const [preset, setPreset] = useState<CameraPreset>('exterior');
  const [selected, setSelected] = useState<VehiclePart | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [focused, setFocused] = useState(true);

  // Rendering stops entirely when the screen is not on top of the stack.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame({ width, height });
  }, []);

  const onEventPresented = useCallback(
    (event: TransientEvent) => markEventPresented(event),
    [markEventPresented],
  );

  const run = useCallback(
    async (type: CommandType, payload?: Record<string, string>) => {
      const result = await send(type, { payload });
      if (!result.ok) showBanner(result.reason, 'warning');
    },
    [send, showBanner],
  );

  /** Command types currently unresolved, so a control can show its progress. */
  const pending = useMemo(() => {
    const inFlight = Object.values(commands).filter((c) =>
      ['requested', 'validating', 'queued', 'delivered', 'executing'].includes(c.status),
    );
    return {
      has: (type: CommandType, door?: string) =>
        inFlight.some((c) => c.type === type && (!door || c.payload?.door === door)),
      first: inFlight[0] ?? null,
    };
  }, [commands]);

  const hotspots = useMemo(() => {
    if (!state || frame.width === 0) return [];
    const points = VEHICLE_PARTS.map((part) => {
      const projected = projectAnchor(HOTSPOT_ANCHOR[part], preset, frame.width, frame.height);
      if (!projected) return null;
      // Occlusion: an anchor on the far side of the body is hidden rather than
      // floating over bodywork it is not attached to.
      if (projected.facing < 0.06 && preset !== 'topDown') return null;
      if (projected.x < 18 || projected.x > frame.width - 18) return null;
      if (projected.y < 18 || projected.y > frame.height - 18) return null;
      return { part, x: projected.x, y: projected.y, open: BINDINGS[part].isOpen(state) };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
    return separateHotspots(points);
  }, [state, preset, frame.width, frame.height]);

  if (!state || !vehicle) {
    return (
      <Screen tone="dark" scroll={false}>
        <PageHeader title={t('controls.title')} compactTitle onDark />
        <EmptyState icon="car" title={t('common.loading')} />
      </Screen>
    );
  }

  const binding = selected ? BINDINGS[selected] : null;
  const selectedOpen = selected && binding ? binding.isOpen(state) : false;
  const supportsDoors = vehicle.capabilities.remoteDoors;

  const partSupported = (part: VehiclePart): boolean => {
    if (PART_DOOR[part]) return supportsDoors;
    if (part === 'rearTrunk') return vehicle.capabilities.remoteTrunk;
    if (part === 'frontTrunk') return vehicle.capabilities.remoteFrunk;
    if (part === 'chargePort') return vehicle.capabilities.remoteChargePort;
    return false;
  };

  const statusLine = pending.first
    ? COMMAND_PROGRESS_COPY[pending.first.type]
    : state.connectivity === 'offline'
      ? 'Vehicle offline. Showing last known state.'
      : null;

  return (
    <Screen tone="dark" scroll={false} contentStyle={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <PageHeader title={t('controls.title')} compactTitle onDark />

        {/* The scene is bounded rather than flex:1. Framing is width-driven, so
            extra height became empty black rather than a bigger vehicle; the
            slack goes to the part list below, which is also the non-3D route to
            every control. */}
        <View style={{ flex: 1, maxHeight: SCENE_MAX_HEIGHT }} onLayout={onFrameLayout}>
          <VehicleScene
            state={state}
            preset={preset}
            paintHex={vehicle.paintHex}
            active={focused}
            presentedEventIds={presentedEventIds}
            onEventPresented={onEventPresented}
            accessibilityLabel={`${vehicle.model}, ${vehicle.colorName}. Interactive vehicle view.`}
            style={{ flex: 1 }}
          />

          {hotspots.map(({ part, x, y, open }) => (
            <Hotspot
              key={part}
              x={x}
              y={y}
              open={open}
              label={HINGES[part].label}
              busy={
                pending.has(BINDINGS[part].open!, BINDINGS[part].payload?.door) ||
                pending.has(BINDINGS[part].close!, BINDINGS[part].payload?.door)
              }
              onPress={() => setSelected(part)}
            />
          ))}
        </View>

        {statusLine && (
          <Text
            variant="caption"
            color={theme.colors.textInverseSecondary}
            align="center"
            style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: theme.spacing.sm }}
          >
            {statusLine}
          </Text>
        )}

        {/* Every part, with its reported position — the accessible alternative
            to hitting a hotspot inside the 3D view, and what fills the space
            the scene no longer stretches into. */}
        <View
          style={{
            paddingHorizontal: PAGE_PADDING,
            paddingBottom: theme.spacing.sm,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
          }}
        >
          {PART_ORDER.map((part) => {
            const b = BINDINGS[part];
            const open = b.isOpen(state);
            return (
              <PartChip
                key={part}
                label={HINGES[part].label}
                open={open}
                supported={partSupported(part)}
                busy={pending.has(b.open!, b.payload?.door) || pending.has(b.close!, b.payload?.door)}
                onPress={() => setSelected(part)}
              />
            );
          })}
        </View>

        <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: theme.spacing.sm }}>
          <DriveAuthorizationStrip
            state={state}
            supported={vehicle.capabilities.remoteDriveAuthorization}
            pending={pending.has('enable_driving') || pending.has('disable_driving')}
            onAuthorize={() => void run('enable_driving')}
            onRevoke={() => void run('disable_driving')}
          />
        </View>

        <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: theme.spacing.sm }}>
          <SegmentedControl
            label="View"
            value={preset}
            onChange={setPreset}
            options={PRESETS.map((p) => ({ value: p, label: CAMERA_PRESETS[p].label }))}
          />
        </View>

        {/* Accessible alternative: every hotspot also has a row here, so the 3D
            view is never the only way to reach a control. */}
        <Row
          justify="space-around"
          style={{
            paddingHorizontal: PAGE_PADDING,
            paddingTop: theme.spacing.sm,
            paddingBottom: insets.bottom + theme.spacing.base,
            borderTopWidth: 1,
            borderTopColor: theme.colors.charcoalLine,
          }}
        >
          <BarAction
            icon="trunk"
            label={HINGES.rearTrunk.label}
            active={state.trunk === 'open'}
            disabled={!vehicle.capabilities.remoteTrunk}
            pending={pending.has('open_trunk') || pending.has('close_trunk')}
            onPress={() => setSelected('rearTrunk')}
          />
          <BarAction
            icon="flash"
            label={t('controls.flash')}
            disabled={!vehicle.capabilities.remoteLights}
            pending={pending.has('flash_lights')}
            onPress={() => void run('flash_lights')}
          />
          <BarAction
            icon="horn"
            label={t('controls.horn')}
            disabled={!vehicle.capabilities.remoteHorn}
            pending={pending.has('sound_horn')}
            onPress={() => void run('sound_horn')}
          />
          <BarAction
            icon="climate"
            label={t('climate.title')}
            active={state.climate.active}
            disabled={!vehicle.capabilities.remoteClimate}
            onPress={() => router.push('/climate')}
          />
          <BarAction
            icon="charge"
            label={t('vehicle.energy')}
            active={state.charge.status === 'charging'}
            onPress={() => router.push('/energy')}
          />
        </Row>
      </View>

      {/* Contextual sheet for the selected component. */}
      <Sheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `${HINGES[selected].label} · ${selectedOpen ? t('controls.open') : t('controls.closed')}`
            : ''
        }
      >
        {selected && binding && (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="caption" color={theme.colors.textSecondary}>
              {partSupported(selected)
                ? 'The panel moves only once the vehicle reports its new position.'
                : 'This vehicle reports this panel but has no remote actuator for it. Its position is shown as reported.'}
            </Text>
            {partSupported(selected) && (
              <Button
                label={selectedOpen ? `Close ${HINGES[selected].label.toLowerCase()}` : `Open ${HINGES[selected].label.toLowerCase()}`}
                loading={
                  pending.has(binding.open!, binding.payload?.door) ||
                  pending.has(binding.close!, binding.payload?.door)
                }
                onPress={() => {
                  const type = selectedOpen ? binding.close! : binding.open!;
                  void run(type, binding.payload);
                }}
              />
            )}
            {PART_DOOR[selected] && (
              <Text variant="micro" color={theme.colors.textTertiary}>
                {DOOR_COPY[PART_DOOR[selected]!]} · unlocking the vehicle does not open it.
              </Text>
            )}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

/**
 * A part and its reported position, e.g. "Rear trunk · Open".
 *
 * Reads state; never anticipates it. An unsupported part still appears, so the
 * vehicle's real capability set is visible rather than hidden.
 */
const PartChip = ({
  label,
  open,
  supported,
  busy,
  onPress,
}: {
  label: string;
  open: boolean;
  supported: boolean;
  busy: boolean;
  onPress: () => void;
}) => {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      scaleTo={0.96}
      minTouchTarget={false}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${open ? t('controls.open') : t('controls.closed')}${supported ? '' : ', not remotely operable'}`}
      accessibilityState={{ selected: open, busy }}
      style={{
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 7,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: open ? theme.colors.blue : theme.colors.charcoalLine,
        backgroundColor: open ? 'rgba(58,102,255,0.16)' : 'transparent',
        opacity: supported ? 1 : 0.55,
      }}
    >
      <Text
        variant="micro"
        color={open ? theme.colors.blue : theme.colors.textInverseSecondary}
        numberOfLines={1}
        style={{ fontSize: 11 }}
      >
        {`${label} · ${busy ? '…' : open ? t('controls.open') : t('controls.closed')}`}
      </Text>
    </Pressable>
  );
};

/**
 * A hotspot: a small anchored dot with a 44pt touch target.
 *
 * No label rides on the bodywork — the label belongs to the sheet, which is
 * what keeps the vehicle readable.
 */
const Hotspot = ({
  x,
  y,
  open,
  label,
  busy,
  onPress,
}: {
  x: number;
  y: number;
  open: boolean;
  label: string;
  busy: boolean;
  onPress: () => void;
}) => {
  const theme = useTheme();
  const SIZE = 44;
  return (
    <View style={{ position: 'absolute', left: x - SIZE / 2, top: y - SIZE / 2 }}>
      <Pressable
        onPress={onPress}
        haptic="light"
        scaleTo={0.9}
        minTouchTarget={false}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${open ? 'open' : 'closed'}`}
        accessibilityState={{ selected: open, busy }}
        style={{
          width: SIZE,
          height: SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: open ? 16 : 13,
            height: open ? 16 : 13,
            borderRadius: 8,
            backgroundColor: open ? theme.colors.blue : 'rgba(255,255,255,0.92)',
            borderWidth: 2,
            borderColor: busy ? theme.colors.desert : 'rgba(8,10,12,0.72)',
          }}
        />
      </Pressable>
    </View>
  );
};

const BarAction = ({
  icon,
  label,
  onPress,
  disabled = false,
  pending = false,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  active?: boolean;
}) => {
  const theme = useTheme();
  const tint = disabled
    ? 'rgba(255,255,255,0.34)'
    : active
      ? theme.colors.blue
      : theme.colors.textInverse;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      haptic="light"
      scaleTo={0.94}
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active, busy: pending }}
      style={{ alignItems: 'center', gap: 6, minWidth: 58, paddingVertical: 4 }}
    >
      <Icon name={icon} size={21} color={tint} strokeWidth={1.7} />
      <Text variant="micro" color={tint} align="center" numberOfLines={1} style={{ fontSize: 10 }}>
        {pending ? '…' : label}
      </Text>
    </Pressable>
  );
};
