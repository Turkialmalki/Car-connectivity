import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeviceFrame, ThemeProvider, palette } from '@/theme';
import { I18nProvider, allowNativeRTL } from '@/i18n';
import { useAppStore, useCommandStore, useUiStore } from '@/stores';
import { useCommandStream, useResumeReconciliation, useTransientFeedback } from '@/hooks';
import { Banner, CommandSheet } from '@/components/feedback';
import { DemoOverlay } from '@/features/demo/DemoOverlay';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Vehicle data is push-driven; refetching on focus would fight the
      // telemetry subscription and cause flicker.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const language = useAppStore((s) => s.language);
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    allowNativeRTL();
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.base }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <DeviceFrame>
            <ThemeProvider>
              <I18nProvider language={language}>
                <AppShell />
              </I18nProvider>
            </ThemeProvider>
          </DeviceFrame>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Global chrome that must outlive individual routes: the command status sheet,
 * the banner channel, and the demo presenter overlay.
 */
const AppShell = () => {
  const banner = useUiStore((s) => s.banner);
  const hideBanner = useUiStore((s) => s.hideBanner);
  const activeCommandId = useCommandStore((s) => s.activeCommandId);
  const commands = useCommandStore((s) => s.commands);
  const clearActive = useCommandStore((s) => s.clearActive);

  useCommandStream();
  // Horn and flash are presented once, app-wide, keyed by vehicle event id.
  useTransientFeedback();
  // On resume, re-fetch state; never resend an in-flight or expired command.
  useResumeReconciliation();

  const activeCommand = activeCommandId ? (commands[activeCommandId] ?? null) : null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.base }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.base },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      </Stack>

      {banner && <Banner message={banner.message} tone={banner.tone} onDismiss={hideBanner} />}
      <CommandSheet command={activeCommand} onClose={clearActive} />
      <DemoOverlay />
    </View>
  );
};
