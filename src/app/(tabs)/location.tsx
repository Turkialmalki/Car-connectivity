import React, { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme, useViewport } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  PAGE_PADDING,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Surface,
  Text,
  Toggle,
} from '@/components/design-system';
import { MapCanvas } from '@/components/vehicle';
import { EmptyState } from '@/components/feedback';
import { useSendCommand, useVehicle, useVehicleState } from '@/hooks';
import { useUiStore } from '@/stores';
import { relativeTime } from '@/utils/time';

/**
 * Map.
 *
 * The map is the screen: it runs edge to edge, and a compact vehicle sheet sits
 * over its lower edge with everything a driver actually needs to walk to the
 * car. Modes and privacy live below the fold.
 *
 * The most important thing on this screen is the honesty of the header: a fix
 * from a reachable vehicle is "Live location", and anything else is explicitly
 * "Last known location" with its age. Presenting a cached fix as live is how
 * people end up walking to the wrong car park.
 */
export default function LocationScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const isFocused = useIsFocused();
  const { width, height } = useViewport();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const send = useSendCommand();
  const showBanner = useUiStore((s) => s.showBanner);
  const [valetMode, setValetMode] = useState(false);
  const [geofence, setGeofence] = useState(false);

  const run = useCallback(
    async (type: Parameters<typeof send>[0]) => {
      const result = await send(type);
      if (!result.ok) showBanner(result.reason, 'warning');
    },
    [send, showBanner],
  );

  const navigate = useCallback(() => {
    if (!state) return;
    const { latitude, longitude } = state.location;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    Linking.openURL(url).catch(() =>
      showBanner('No maps application is available on this device.', 'warning'),
    );
  }, [state, showBanner]);

  if (!state || !vehicle) {
    return (
      <Screen tabBarPadding>
        <EmptyState icon="location" title={t('common.loading')} />
      </Screen>
    );
  }

  if (!vehicle.capabilities.location) {
    return (
      <Screen tabBarPadding contentStyle={{ paddingHorizontal: PAGE_PADDING }}>
        <Text variant="title">{t('location.title')}</Text>
        <Surface tone="soft" style={{ marginTop: theme.spacing.xl }}>
          <Text variant="caption" color={theme.colors.textSecondary}>
            Location reporting is disabled for this vehicle.
          </Text>
        </Surface>
      </Screen>
    );
  }

  const live = state.location.isLive;
  const mapHeight = Math.max(280, Math.round(height * 0.46));

  return (
    <Screen tabBarPadding contentStyle={{ paddingHorizontal: 0 }} edgeToEdgeTop>
      {/* The map, edge to edge. */}
      <MapCanvas
        latitude={state.location.latitude}
        longitude={state.location.longitude}
        headingDegrees={state.location.headingDegrees}
        isLive={live}
        width={width}
        height={mapHeight}
        animate={isFocused}
        rounded={false}
      />

      {/* Compact vehicle sheet, overlapping the map's lower edge. */}
      <View style={{ paddingHorizontal: PAGE_PADDING, marginTop: -theme.spacing.xl }}>
        <Surface padded="loose" radius="xxl">
          <Row justify="space-between" align="flex-start" gap={theme.spacing.md}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" numberOfLines={2}>
                {`${state.location.addressLabel}, ${state.location.city}`}
              </Text>
              {/* A cached fix is never presented as a live one. */}
              <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
                {`${live ? t('location.liveLocation') : t('location.lastKnown')} · ${relativeTime(state.location.capturedAt)}`}
              </Text>
            </View>
            <StatusPill
              label={live ? t('common.live') : t('common.cached')}
              tone={live ? 'success' : 'warning'}
              pulse={live}
              compact
            />
          </Row>

          {!live && (
            <Text variant="micro" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.md }}>
              {`This is where the vehicle was ${relativeTime(state.location.capturedAt)}, not where it is now. The vehicle is unreachable, so its position cannot be confirmed.`}
            </Text>
          )}

          <Row justify="space-between" wrap gap={theme.spacing.base} style={{ marginTop: theme.spacing.base }}>
            <Detail label="Heading" value={`${Math.round(state.location.headingDegrees)}°`} />
            <Detail
              label="Coordinates"
              value={`${state.location.latitude.toFixed(3)}, ${state.location.longitude.toFixed(3)}`}
            />
          </Row>

          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.base }}>
            <Button label={t('location.navigate')} icon="navigate" onPress={navigate} />
            <Row gap={theme.spacing.sm}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('controls.flash')}
                  icon="flash"
                  variant="secondary"
                  onPress={() => void run('flash_lights')}
                  disabled={!vehicle.capabilities.remoteLights}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('controls.horn')}
                  icon="horn"
                  variant="secondary"
                  onPress={() => void run('sound_horn')}
                  disabled={!vehicle.capabilities.remoteHorn}
                />
              </View>
            </Row>
          </View>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: PAGE_PADDING }}>
        <SectionHeader title="Modes" />
        <Surface>
          <View style={{ gap: theme.spacing.lg }}>
            <Toggle
              label={t('location.valetMode')}
              description="Limits speed and power, locks the boot and glovebox, and hides personal data from the vehicle screen."
              value={valetMode}
              onChange={setValetMode}
            />
            <Toggle
              label={t('location.geofence')}
              description="Notifies you when the vehicle enters or leaves a saved area."
              value={geofence}
              onChange={setGeofence}
            />
          </View>
        </Surface>
        {valetMode && (
          <Surface tone="soft" style={{ marginTop: theme.spacing.md }}>
            <Row gap={theme.spacing.md} align="flex-start">
              <Icon name="shield" size={19} color={theme.colors.warning} />
              <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                Valet mode is active. The vehicle limits itself; the app cannot enforce this, which
                is why the restriction is applied by the vehicle rather than by the phone.
              </Text>
            </Row>
          </Surface>
        )}
      </View>

      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: PAGE_PADDING }}>
        <SectionHeader title={t('location.privacyTitle')} />
        <Surface tone="soft">
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('location.privacyBody')}
          </Text>
        </Surface>
      </View>
    </Screen>
  );
}

const Detail = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="micro" color={theme.colors.textSecondary}>
        {label}
      </Text>
      <Text variant="bodyStrong" numeric style={{ marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
};
