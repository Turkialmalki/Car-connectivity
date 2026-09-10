import React, { memo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { type VehicleCommand, isSuccess, isTerminal } from '@/domain/entities';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useFailureLabel } from '@/hooks';
import { Icon, Pressable, Row, Text } from '@/components/design-system';
import { clockTime, relativeTime } from '@/utils/time';

/**
 * One entry in the command audit trail.
 *
 * Shows the outcome, when it happened, and — always — the correlation ID.
 * Tapping through opens the full end-to-end trace for that command.
 */
const CommandHistoryRowComponent = ({
  command,
  label,
  showDivider,
}: {
  command: VehicleCommand;
  label: string;
  showDivider: boolean;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const failureLabel = useFailureLabel();

  const success = isSuccess(command.status);
  const terminal = isTerminal(command.status);
  const failed = terminal && !success;

  const tone = success
    ? theme.colors.success
    : failed
      ? theme.colors.critical
      : theme.colors.electric;
  const icon = success ? 'check' : failed ? 'close' : 'clock';

  return (
    <View>
      <Pressable
        onPress={() => router.push(`/developer/trace?commandId=${command.id}`)}
        haptic="light"
        scaleTo={0.99}
        accessibilityLabel={`${label}, ${command.status}, ${relativeTime(command.requestedAt)}`}
        accessibilityHint="Opens the end-to-end trace for this command"
        style={{ paddingVertical: theme.spacing.md }}
      >
        <Row gap={theme.spacing.md}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: success
                ? theme.colors.successDim
                : failed
                  ? theme.colors.criticalDim
                  : theme.colors.electricDim,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={15} color={tone} />
          </View>

          <View style={{ flex: 1 }}>
            <Row justify="space-between">
              <Text variant="bodyStrong">{label}</Text>
              <Text variant="micro" color={theme.colors.textTertiary}>
                {clockTime(command.requestedAt)}
              </Text>
            </Row>
            <Row justify="space-between" style={{ marginTop: 2 }}>
              <Text
                variant="caption"
                color={failed ? theme.colors.critical : theme.colors.textSecondary}
              >
                {failed ? (failureLabel(command) ?? command.status) : statusLabel(command, t)}
              </Text>
              <Text variant="mono" color={theme.colors.textTertiary}>
                {command.correlationId}
              </Text>
            </Row>
          </View>
        </Row>
      </Pressable>
      {showDivider && <View style={{ height: 1, backgroundColor: theme.colors.line }} />}
    </View>
  );
};

const statusLabel = (command: VehicleCommand, t: ReturnType<typeof useI18n>['t']): string => {
  if (isSuccess(command.status)) {
    const elapsed = (command.trace ?? []).reduce((sum, stage) => sum + stage.elapsedMs, 0);
    const seconds = (elapsed / 1000).toFixed(1);
    return t(command.wasRetry ? 'commandStatus.confirmedRetryIn' : 'commandStatus.confirmedIn', {
      seconds,
    });
  }
  return t('commandStatus.inProgress', { status: command.status });
};

export const CommandHistoryRow = memo(CommandHistoryRowComponent);
