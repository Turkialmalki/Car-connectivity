import React from 'react';
import { Stack } from 'expo-router';
import { palette } from '@/theme';

export default function DeveloperLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.base } }}
    />
  );
}
