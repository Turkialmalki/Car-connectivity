import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Text, triggerHaptic, type IconName } from '@/components/design-system';
import { TAB_BAR_HEIGHT } from '@/components/design-system/Screen';

const TABS: { name: string; icon: IconName; labelKey: string }[] = [
  { name: 'vehicle', icon: 'car', labelKey: 'tabs.vehicle' },
  { name: 'location', icon: 'map', labelKey: 'tabs.map' },
  { name: 'service', icon: 'wrench', labelKey: 'tabs.service' },
];

/**
 * Three primary destinations on one solid charcoal surface.
 *
 * Everything else in the app — Climate, Energy, charging history, Controls,
 * health, keys, profile — is a full-screen route reached from context, so the
 * navigation stays quiet and nothing is lost.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.base },
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: theme.colors.charcoal,
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarShowLabel: false,
      }}
      screenListeners={{ tabPress: () => triggerHaptic('light') }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.labelKey as never),
            tabBarAccessibilityLabel: t(tab.labelKey as never),
            tabBarIcon: ({ focused }) => (
              <TabItem icon={tab.icon} label={t(tab.labelKey as never)} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const TabItem = ({
  icon,
  label,
  focused,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
}) => {
  const theme = useTheme();
  const color = focused ? theme.colors.textInverse : 'rgba(255,255,255,0.5)';

  return (
    <View style={{ alignItems: 'center', gap: 3, width: 80 }}>
      <Icon name={icon} size={22} color={color} strokeWidth={focused ? 2 : 1.6} />
      <Text variant="micro" color={color} align="center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};
