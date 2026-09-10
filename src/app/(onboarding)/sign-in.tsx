import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Button,
  Icon,
  Row,
  Screen,
  Surface,
  Text,
  TextField,
  Pressable,
} from '@/components/design-system';
import { useAppStore, useUiStore } from '@/stores';
import { createBiometricAdapter } from '@/infrastructure/native-connectivity';
import { DEMO_USER } from '@/infrastructure/mock-connected-cloud';
import { connected } from '@/infrastructure/api';
import { OnboardingHeader } from '@/features/onboarding/OnboardingHeader';

const biometric = createBiometricAdapter();

/**
 * Screen 2 — Authentication.
 *
 * The form is React Hook Form + Zod so validation lives in a schema rather than
 * in the component. The demo account is a first-class path: an interview
 * audience should never be asked to invent credentials.
 */
const schema = z.object({
  identifier: z
    .string()
    .min(1, 'Enter your email address or mobile number.')
    .refine(
      (value) => value.includes('@') || /^\+?[\d\s-]{8,}$/.test(value),
      'Enter a valid email address or mobile number.',
    ),
  password: z.string().min(8, 'Your password must be at least 8 characters.'),
});

/**
 * Connected mode requires an email address, because that is what Supabase Auth
 * authenticates. A mobile number is accepted on local fixtures, where nothing
 * verifies it either way.
 */
const connectedSchema = schema.extend({
  identifier: z.string().email('Enter the email address you registered with.'),
});

type FormValues = z.infer<typeof schema>;

export default function SignIn() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const signIn = useAppStore((s) => s.signIn);
  const signUp = useAppStore((s) => s.signUp);
  const showBanner = useUiStore((s) => s.showBanner);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(connected ? connectedSchema : schema),
    defaultValues: { identifier: '', password: '' },
    mode: 'onBlur',
  });

  /**
   * Completes a sign-in.
   *
   * A failure is shown and the user stays put. Advancing to pairing on a
   * rejected credential would put the app in a state where every later request
   * fails with no explanation of why.
   */
  const proceed = async (credentials?: { email: string; password: string }) => {
    setSubmitting(true);
    const result = await signIn(credentials);
    setSubmitting(false);

    if (!result.ok) {
      showBanner(result.error, 'warning');
      return;
    }
    router.push('/(onboarding)/pair');
  };

  const onSubmit = handleSubmit(async (values) => {
    await proceed({ email: values.identifier.trim(), password: values.password });
  });

  const onCreateAccount = handleSubmit(async (values) => {
    setSubmitting(true);
    const result = await signUp({ email: values.identifier.trim(), password: values.password });
    setSubmitting(false);
    if (!result.ok) {
      showBanner(result.error, result.needsConfirmation ? 'info' : 'warning');
      return;
    }
    router.push('/(onboarding)/pair');
  });

  const onBiometric = async () => {
    const available = await biometric.isAvailable();
    if (!available) {
      showBanner('No biometric credential is enrolled on this device.', 'warning');
      return;
    }
    const result = await biometric.authenticate('Sign in');
    if (!result.success) {
      showBanner('Biometric sign-in was not completed.', 'warning');
      return;
    }
    if (connected) {
      // Biometrics unlock a stored session; they are not a substitute for one.
      // With no session yet, the password is still required.
      showBanner('Sign in with your password once. Face ID then confirms commands.', 'info');
      return;
    }
    await proceed();
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingHeader step={2} total={5} onBack={() => router.back()} />

        <Animated.View entering={FadeInDown.duration(400)}>
          <Text variant="title" style={{ marginTop: theme.spacing.xl }}>
            {t('onboarding.signInTitle')}
          </Text>
          <Text
            variant="body"
            color={theme.colors.textSecondary}
            style={{ marginTop: theme.spacing.sm }}
          >
            {t('onboarding.signInSubtitle')}
          </Text>

          <View style={{ gap: theme.spacing.base, marginTop: theme.spacing.xxl }}>
            <Controller
              control={control}
              name="identifier"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={t('onboarding.emailLabel')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  error={formState.errors.identifier?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={t('onboarding.passwordLabel')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="password"
                  placeholder="••••••••"
                  error={formState.errors.password?.message}
                />
              )}
            />
          </View>

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
            <Button
              label={t('onboarding.signInTitle')}
              onPress={() => void onSubmit()}
              loading={submitting}
            />
            <Button
              label={t('onboarding.useBiometrics')}
              icon="shield"
              variant="secondary"
              onPress={() => void onBiometric()}
            />
            {connected ? (
              <Button
                label="Create an account"
                variant="secondary"
                onPress={() => void onCreateAccount()}
              />
            ) : (
              <Pressable
                onPress={() => void proceed()}
                haptic="light"
                accessibilityLabel={t('onboarding.useDemoAccount')}
                style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}
              >
                <Text variant="caption" color={theme.colors.desert}>
                  {t('onboarding.useDemoAccount')} — {DEMO_USER.email}
                </Text>
              </Pressable>
            )}
          </View>

          <Surface tone="soft" style={{ marginTop: theme.spacing.xl }}>
            <Row gap={theme.spacing.md} align="flex-start">
              <Icon name="shield" size={18} color={theme.colors.electric} />
              <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                {t('onboarding.authNote')}
              </Text>
            </Row>
          </Surface>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
