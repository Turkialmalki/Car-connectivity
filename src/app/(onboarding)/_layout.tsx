import React from 'react';
import { Stack } from 'expo-router';
import { palette } from '@/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.base },
        animation: 'slide_from_right',
      }}
    />
  );
}
