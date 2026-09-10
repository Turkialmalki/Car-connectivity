import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { palette } from '@/theme';
import { useAppStore } from '@/stores';

/** Entry gate: routes to onboarding or the app depending on session state. */
export default function Index() {
  const hydrated = useAppStore((s) => s.hydrated);
  const onboarded = useAppStore((s) => s.onboarded);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.base,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={palette.electric} />
      </View>
    );
  }

  return <Redirect href={onboarded ? '/(tabs)/vehicle' : '/(onboarding)/welcome'} />;
}
