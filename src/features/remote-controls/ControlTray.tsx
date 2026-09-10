import React, { memo } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  type CommandType,
  type VehicleCapabilities,
  type VehicleState,
  isHighRisk,
} from '@/domain/entities';
import { explainUnavailable } from '@/domain/use-cases';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Pressable, Text, type IconName } from '@/components/design-system';
import { useCommandStore } from '@/stores';

export type ControlDefinition = {
  id: string;
  type: CommandType;
  icon: IconName;
  labelKey: string;
  /** Marks a control that reflects an on/off vehicle state rather than a pulse. */
  stateful?: boolean;
};

type Props = {
  state: VehicleState;
  capabilities: VehicleCapabilities;
  onCommand: (type: CommandType) => void;
};

/**
 * Horizontal quick-control tray.
 *
 * A tray rather than a radial dial: five to six controls that must be readable
 * and hittable one-handed, in sunlight, sometimes in a hurry. A radial menu
 * looks striking in a portfolio and is worse to actually use.
 *
 * Every tile reflects DOMAIN state:
 *  - disabled with a reason when the capability or vehicle state forbids it
 *  - a pending ring while a command of that type is in flight
 *  - a lock icon marking commands that will ask for biometrics
 */
const ControlTrayComponent = ({ state, capabilities, onCommand }: Props) => {
  const theme = useTheme();
  const { t } = useI18n();
  const commands = useCommandStore((s) => s.commands);

  const pendingTypes = new Set(
    Object.values(commands)
      .filter((c) =>
        ['requested', 'validating', 'queued', 'delivered', 'executing'].includes(c.status),
      )
      .map((c) => c.type),
  );

  const controls: ControlDefinition[] = [
    state.lock === 'locked'
      ? { id: 'unlock', type: 'unlock', icon: 'unlock', labelKey: 'vehicle.unlock', stateful: true }
      : { id: 'lock', type: 'lock', icon: 'lock', labelKey: 'vehicle.lock', stateful: true },
    state.climate.active
      ? {
          id: 'stop_climate',
          type: 'stop_climate',
          icon: 'climate',
          labelKey: 'vehicle.climate',
          stateful: true,
        }
      : {
          id: 'start_climate',
          type: 'start_climate',
          icon: 'climate',
          labelKey: 'vehicle.climate',
          stateful: true,
        },
    state.charge.status === 'charging'
      ? {
          id: 'stop_charging',
          type: 'stop_charging',
          icon: 'charge',
          labelKey: 'vehicle.chargePort',
          stateful: true,
        }
      : {
          id: 'start_charging',
          type: 'start_charging',
          icon: 'charge',
          labelKey: 'vehicle.chargePort',
          stateful: true,
        },
    state.trunk === 'open'
      ? {
          id: 'close_trunk',
          type: 'close_trunk',
          icon: 'trunk',
          labelKey: 'vehicle.trunk',
          stateful: true,
        }
      : {
          id: 'open_trunk',
          type: 'open_trunk',
          icon: 'trunk',
          labelKey: 'vehicle.trunk',
          stateful: true,
        },
    { id: 'flash', type: 'flash_lights', icon: 'flash', labelKey: 'vehicle.flash' },
    { id: 'horn', type: 'sound_horn', icon: 'horn', labelKey: 'vehicle.horn' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.md, paddingHorizontal: theme.spacing.xl }}
    >
      {controls.map((control) => {
        const unavailable = explainUnavailable(control.type, state, capabilities);
        const active =
          (control.type === 'stop_climate' && state.climate.active) ||
          (control.type === 'stop_charging' && state.charge.status === 'charging') ||
          (control.type === 'lock' && state.lock === 'unlocked');
        return (
          <ControlTile
            key={control.id}
            icon={control.icon}
            label={t(control.labelKey as never)}
            pending={pendingTypes.has(control.type)}
            disabled={Boolean(unavailable)}
            disabledReason={unavailable}
            active={active}
            secure={isHighRisk(control.type)}
            onPress={() => onCommand(control.type)}
          />
        );
      })}
    </ScrollView>
  );
};

const TILE = 84;

const ControlTile = memo(
  ({
    icon,
    label,
    pending,
    disabled,
    disabledReason,
    active,
    secure,
    onPress,
  }: {
    icon: IconName;
    label: string;
    pending: boolean;
    disabled: boolean;
    disabledReason: string | null;
    active: boolean;
    secure: boolean;
    onPress: () => void;
  }) => {
    const theme = useTheme();
    const glow = useSharedValue(0);

    React.useEffect(() => {
      glow.value = withTiming(pending ? 1 : 0, { duration: 240 });
    }, [pending, glow]);

    const ringStyle = useAnimatedStyle(() => ({
      opacity: glow.value,
      transform: [{ scale: withSpring(0.9 + glow.value * 0.12) }],
    }));

    const tint = active ? theme.colors.electric : theme.colors.textPrimary;

    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        haptic="medium"
        scaleTo={0.93}
        minTouchTarget={false}
        accessibilityLabel={label}
        accessibilityHint={
          disabled
            ? (disabledReason ?? undefined)
            : secure
              ? 'Requires biometric confirmation'
              : undefined
        }
        accessibilityState={{ disabled, busy: pending, selected: active }}
        style={{
          width: TILE,
          height: TILE + 8,
          borderRadius: theme.radius.xl,
          backgroundColor: active ? theme.colors.electricDim : theme.colors.surface,
          borderWidth: 1,
          borderColor: active ? 'rgba(143,227,192,0.35)' : 'rgba(255,255,255,0.05)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: theme.radius.xl,
              borderWidth: 2,
              borderColor: theme.colors.electric,
            },
            ringStyle,
          ]}
        />
        <View>
          <Icon name={icon} size={24} color={disabled ? theme.colors.textTertiary : tint} />
          {secure && (
            <View
              style={{
                position: 'absolute',
                right: -9,
                top: -5,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="shield" size={9} color={theme.colors.desert} strokeWidth={2.2} />
            </View>
          )}
        </View>
        <Text
          variant="micro"
          align="center"
          color={disabled ? theme.colors.textTertiary : theme.colors.textSecondary}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  },
);
ControlTile.displayName = 'ControlTile';

export const ControlTray = memo(ControlTrayComponent);
