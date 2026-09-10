import React, { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { VehicleState } from '@/domain/entities';
import { POWER_STATE_COPY } from '@/domain/entities';
import { useTheme } from '@/theme';
import { Pressable, Row, Text } from '@/components/design-system';

/**
 * Drive authorization, wake-up and readiness — shown as three separate things,
 * because they are three separate things.
 *
 *   Authorization  a time-boxed PERMISSION granted by connected services.
 *   Power          whether the vehicle's computers are asleep, waking or awake.
 *   Readiness      the VEHICLE's own report that it can be driven.
 *
 * Granting authorization does not make a vehicle ready, and a ready vehicle is
 * not being driven — nothing here spins a wheel or pretends the car moves. When
 * a grant expires it simply lapses; re-authorising is always a fresh action.
 */
export type DriveAuthorizationStripProps = {
  state: VehicleState;
  supported: boolean;
  pending: boolean;
  onAuthorize: () => void;
  onRevoke: () => void;
};

const secondsUntil = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
};

const DriveAuthorizationStripComponent = ({
  state,
  supported,
  pending,
  onAuthorize,
  onRevoke,
}: DriveAuthorizationStripProps) => {
  const theme = useTheme();
  const { granted, expiresAt } = state.driveAuthorization;
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));

  // A visible countdown, so an expiring grant is never a surprise.
  useEffect(() => {
    setRemaining(secondsUntil(expiresAt));
    if (!expiresAt) return;
    const timer = setInterval(() => setRemaining(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const authorizationLabel = !granted
    ? 'Not authorised'
    : remaining > 0
      ? `Authorised · ${remaining}s`
      : 'Authorisation lapsed';

  const readinessLabel = state.driveReady
    ? 'Ready to drive'
    : granted
      ? 'Not ready yet'
      : 'Not ready';

  return (
    <View
      accessible
      accessibilityLabel={`Driving. ${authorizationLabel}. ${POWER_STATE_COPY[state.power]}. ${readinessLabel}.`}
      style={{
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.charcoalLine,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.base,
      }}
    >
      <Row justify="space-between" align="center" gap={theme.spacing.sm}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={theme.spacing.sm} wrap>
            <Field label="Authorisation" value={authorizationLabel} tone={granted ? 'good' : 'muted'} />
            <Field
              label="Power"
              value={POWER_STATE_COPY[state.power]}
              tone={state.power === 'awake' ? 'good' : 'muted'}
            />
            <Field
              label="Readiness"
              value={readinessLabel}
              tone={state.driveReady ? 'good' : 'muted'}
            />
          </Row>
        </View>
        {supported && (
          <Pressable
            onPress={granted ? onRevoke : onAuthorize}
            disabled={pending}
            haptic="medium"
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel={granted ? 'Revoke driving authorisation' : 'Enable driving'}
            accessibilityState={{ busy: pending }}
            style={{
              paddingHorizontal: theme.spacing.base,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.sm,
              backgroundColor: granted ? 'rgba(255,255,255,0.10)' : theme.colors.blue,
            }}
          >
            <Text variant="micro" color={theme.colors.textInverse}>
              {pending ? '…' : granted ? 'Revoke' : 'Enable'}
            </Text>
          </Pressable>
        )}
      </Row>
      {!supported && (
        <Text variant="micro" color={theme.colors.textTertiary} style={{ marginTop: 4 }}>
          This vehicle does not support remote drive authorisation.
        </Text>
      )}
    </View>
  );
};

const Field = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'muted';
}) => {
  const theme = useTheme();
  return (
    <View style={{ minWidth: 96 }}>
      <Text variant="micro" color="rgba(255,255,255,0.45)" style={{ fontSize: 9 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        variant="micro"
        color={tone === 'good' ? theme.colors.green : theme.colors.textInverseSecondary}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
};

export const DriveAuthorizationStrip = memo(DriveAuthorizationStripComponent);
