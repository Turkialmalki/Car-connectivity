import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { type VehicleCommand, isInFlight, isSuccess, isTerminal } from '@/domain/entities';
import { isRetryable, remainingMs } from '@/domain/use-cases';
import { COMMAND_SHEET_STEPS } from '@/infrastructure/command-simulator';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useCommandStore } from '@/stores';
import { useCommandLabel, useFailureLabel, useRetryCommand } from '@/hooks';
import { clockTime } from '@/utils/time';
import { Button, Icon, Row, Sheet, Text, triggerHaptic } from '../design-system';

type Props = {
  command: VehicleCommand | null;
  onClose: () => void;
};

/**
 * Command status sheet.
 *
 * Shows the request walking the pipeline in plain language. The steps are a
 * user-friendly representation of the end-to-end process, not literal
 * production timings — the developer trace screen is where the real stage
 * timings live.
 *
 * Critically: this sheet reads status from the command store, which is fed by
 * the simulated cloud. It cannot show "completed" unless the vehicle confirmed.
 */
export const CommandSheet = ({ command, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useI18n();
  const retry = useRetryCommand();
  const commandLabel = useCommandLabel();
  const failureLabel = useFailureLabel();
  const clearActive = useCommandStore((s) => s.clearActive);

  const stageIndex = useMemo(() => {
    if (!command) return -1;
    const reached = (command.trace ?? []).map((s) => s.stage);
    let index = -1;
    COMMAND_SHEET_STEPS.forEach((step, i) => {
      if (reached.includes(step.stage)) index = i;
    });
    return index;
  }, [command]);

  // The plain-language line for the stage the request has actually reached.
  const currentStepLabel = useMemo(() => {
    const next = COMMAND_SHEET_STEPS[Math.min(stageIndex + 1, COMMAND_SHEET_STEPS.length - 1)];
    return next ? t(next.i18nKey as never) : t('command.securing');
  }, [stageIndex, t]);

  const success = command ? isSuccess(command.status) : false;
  const failed = command ? isTerminal(command.status) && !success : false;

  // A single confirming haptic on the terminal outcome, never per stage.
  useEffect(() => {
    if (success) triggerHaptic('success');
    else if (failed) triggerHaptic('error');
  }, [success, failed]);

  // Auto-dismiss on success so a confirmed command does not need a tap.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      clearActive();
      onClose();
    }, 1600);
    return () => clearTimeout(timer);
  }, [success, clearActive, onClose]);

  if (!command) return null;

  const inFlight = isInFlight(command.status);
  const secondsLeft = Math.ceil(remainingMs(command) / 1000);

  return (
    <Sheet visible onClose={inFlight ? undefined : onClose} dismissible={!inFlight}>
      <View style={{ gap: theme.spacing.lg }}>
        <View>
          <Text variant="heading">{commandLabel(command.type)}</Text>
          <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
            {success
              ? t('command.completed')
              : failed
                ? (failureLabel(command) ?? t('command.failed'))
                : `${t('common.lastUpdated')} ${clockTime(command.requestedAt)} · expires in ${secondsLeft}s`}
          </Text>
        </View>

        {/* One line, in plain language. The five-stage pipeline this maps to
            is real, but it belongs in Developer Simulation, not in front of a
            driver who pressed a button. */}
        {inFlight && (
          <Row gap={theme.spacing.md} align="center">
            <Spinner />
            <Text variant="bodyStrong">{currentStepLabel}</Text>
          </Row>
        )}

        {failed && (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <View
              style={{
                backgroundColor: theme.colors.criticalDim,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.base,
              }}
            >
              <Row gap={theme.spacing.sm} align="flex-start">
                <Icon name="alert" size={18} color={theme.colors.critical} />
                <Text variant="caption" color={theme.colors.critical} style={{ flex: 1 }}>
                  {failureLabel(command) ??
                    'The vehicle did not confirm this command. Nothing was changed.'}
                </Text>
              </Row>
            </View>
          </Animated.View>
        )}

        {/* Correlation and command IDs are always visible: they are what an
            engineer needs to trace this exact request end to end. */}
        <Row justify="space-between">
          <Text variant="mono" color={theme.colors.textTertiary}>
            {t('command.commandId')} {command.id}
          </Text>
          <Text variant="mono" color={theme.colors.textTertiary}>
            {command.correlationId}
          </Text>
        </Row>

        {failed && (
          <Row gap={theme.spacing.md}>
            {isRetryable(command) && (
              <View style={{ flex: 1 }}>
                <Button
                  label={t('common.retry')}
                  icon="refresh"
                  onPress={() => void retry(command)}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button label={t('common.close')} variant="secondary" onPress={onClose} />
            </View>
          </Row>
        )}
      </View>
    </Sheet>
  );
};

/** A quiet indeterminate indicator while the request is in flight. */
const Spinner = () => {
  const theme = useTheme();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (theme.reduceMotion) return;
    spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin, theme.reduceMotion]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  return (
    <Animated.View
      style={[
        {
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: theme.colors.line,
          borderTopColor: theme.colors.blue,
        },
        style,
      ]}
    />
  );
};
