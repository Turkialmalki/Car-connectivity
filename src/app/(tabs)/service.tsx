import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  ListRow,
  PAGE_PADDING,
  Screen,
  Surface,
  Text,
} from '@/components/design-system';
import { useOta, useVehicle, useVehicleState } from '@/hooks';
import { useUiStore } from '@/stores';

/**
 * Service.
 *
 * A native-feeling list rather than a wall of decorative cards. Everything the
 * old profile tab exposed under support and vehicle care is reachable here or
 * from the profile control on the home screen — the navigation got simpler,
 * the feature set did not get smaller.
 */
export default function ServiceScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();
  const { update: ota } = useOta();
  const showBanner = useUiStore((s) => s.showBanner);

  const health = state?.health;

  return (
    <Screen tabBarPadding>
      <View style={{ paddingHorizontal: PAGE_PADDING }}>
        <Text variant="title">{t('service.title')}</Text>
        {vehicle && (
          <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.xs }}>
            {`${vehicle.name} · ${vehicle.softwareVersion}`}
          </Text>
        )}

        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.base }}>
          <Surface padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.base }}>
              <ListRow
                icon={health?.overall === 'ok' ? 'check' : 'alert'}
                iconColor={health?.overall === 'ok' ? theme.colors.green : theme.colors.amber}
                title={t('vehicle.vehicleHealth')}
                subtitle={
                  health
                    ? health.warnings.length === 0
                      ? t('health.allGood')
                      : t(
                          health.warnings.length === 1
                            ? 'vehicle.activeWarnings'
                            : 'vehicle.activeWarningsPlural',
                          { count: health.warnings.length },
                        )
                    : undefined
                }
                onPress={() => router.push('/health')}
              />
              <Divider />
              <ListRow
                icon="download"
                title={t('ota.title')}
                subtitle={ota ? ota.version : undefined}
                onPress={() => router.push('/ota')}
              />
              <Divider />
              <ListRow
                icon="charge"
                title={t('charging.history')}
                onPress={() => router.push('/charging-history')}
              />
            </View>
          </Surface>

          <Surface padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.base }}>
              <ListRow
                icon="wrench"
                title={t('service.bookService')}
                subtitle={health ? `${health.serviceDueKm.toLocaleString()} km` : undefined}
                onPress={() => showBanner(t('common.unavailable'), 'info')}
              />
              <Divider />
              <ListRow
                icon="alert"
                title={t('service.roadside')}
                onPress={() => showBanner(t('common.unavailable'), 'info')}
              />
              <Divider />
              <ListRow icon="info" title={t('service.support')} onPress={() => router.push('/help')} />
            </View>
          </Surface>

          <Surface padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.base }}>
              <ListRow icon="key" title={t('digitalKey.title')} onPress={() => router.push('/digital-key')} />
              <Divider />
              <ListRow icon="user" title={t('drivers.title')} onPress={() => router.push('/drivers')} />
              <Divider />
              <ListRow icon="car" title={t('profile.vehicles')} onPress={() => router.push('/vehicles')} />
            </View>
          </Surface>
        </View>
      </View>
    </Screen>
  );
}

const Divider = () => {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.line }} />;
};
