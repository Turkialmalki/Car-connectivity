import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Surface,
  Text,
  Pressable,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import {
  PIPELINE_LAYER_NOTE,
  TRACE_STAGE_COPY,
  type VehicleCommand,
  isSuccess,
  isTerminal,
} from '@/domain/entities';
import {
  computeMetrics,
  EXAMPLE_COMMAND_REQUEST,
  EXAMPLE_COMMAND_RESPONSE,
} from '@/infrastructure/api';
import { useCommandHistory, useCommandLabel, useFailureLabel } from '@/hooks';
import { useCommandStore } from '@/stores';
import { clockTime, relativeTime } from '@/utils/time';

/**
 * End-to-end trace.
 *
 * The screen that teaches the architecture. Each command expands into the exact
 * hops it travelled, with per-stage elapsed time and a correlation ID — the same
 * artefact you would pull from a distributed trace during an incident.
 */
export default function TraceScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ commandId?: string }>();
  const history = useCommandHistory();
  const keyProvisioning = useCommandStore((s) => s.keyProvisioning);
  const [expandedId, setExpandedId] = useState<string | null>(params.commandId ?? null);

  const metrics = useMemo(
    () => computeMetrics(history, keyProvisioning),
    [history, keyProvisioning],
  );

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('developer.trace')}
        subtitle="Mobile → API → Command Service → Broker → TCU → Gateway → ECU"
      />

      {/* Metrics */}
      <SectionHeader
        title={t('developer.metrics')}
        subtitle="Computed from the commands issued in this session."
      />
      <Surface>
        <Row justify="space-between" wrap gap={theme.spacing.lg}>
          <Metric
            label={t('developer.successRate')}
            value={`${(metrics.successRate * 100).toFixed(0)}%`}
            tone={
              metrics.successRate > 0.9
                ? 'success'
                : metrics.successRate > 0.7
                  ? 'warning'
                  : 'critical'
            }
          />
          <Metric
            label={t('developer.p95')}
            value={
              metrics.p95LatencyMs === 0 ? '—' : `${(metrics.p95LatencyMs / 1000).toFixed(1)}s`
            }
          />
          <Metric
            label={t('developer.timeoutRate')}
            value={`${(metrics.timeoutRate * 100).toFixed(0)}%`}
            tone={metrics.timeoutRate > 0.2 ? 'warning' : 'success'}
          />
          <Metric
            label={t('developer.availability')}
            value={`${(metrics.vehicleAvailability * 100).toFixed(0)}%`}
            tone={metrics.vehicleAvailability > 0.9 ? 'success' : 'warning'}
          />
          <Metric
            label={t('developer.keySuccess')}
            value={
              keyProvisioning.total === 0
                ? '—'
                : `${(metrics.keyProvisioningSuccess * 100).toFixed(0)}%`
            }
          />
          <Metric label="Commands" value={String(metrics.total)} />
        </Row>
        <View
          style={{
            height: 1,
            backgroundColor: theme.colors.line,
            marginVertical: theme.spacing.base,
          }}
        />
        <Text variant="caption" color={theme.colors.textSecondary}>
          In production these come from the telemetry pipeline, not the client. P95 command latency
          and vehicle availability are the two numbers a connected-services team pages on: latency
          tells you the pipeline is healthy, availability tells you the fleet is reachable.
        </Text>
      </Surface>

      {/* Traces */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title="Command traces" />
        {history.length === 0 ? (
          <EmptyState
            icon="trace"
            title="No commands yet"
            body="Run a command from the Vehicle screen, then come back to see its full journey."
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {history.map((command) => (
              <TraceCard
                key={command.id}
                command={command}
                expanded={expandedId === command.id}
                onToggle={() => setExpandedId(expandedId === command.id ? null : command.id)}
              />
            ))}
          </View>
        )}
      </View>

      {/* Contract */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={t('developer.apiContract')} />
        <Surface padded="tight">
          <Text variant="mono" color={theme.colors.textTertiary}>
            POST /vehicles/:vehicleId/commands
          </Text>
          <CodeBlock value={EXAMPLE_COMMAND_REQUEST} />
          <Text
            variant="mono"
            color={theme.colors.textTertiary}
            style={{ marginTop: theme.spacing.md }}
          >
            202 Accepted
          </Text>
          <CodeBlock value={EXAMPLE_COMMAND_RESPONSE} />
          <Text
            variant="caption"
            color={theme.colors.textSecondary}
            style={{ marginTop: theme.spacing.md }}
          >
            The response is an acknowledgement of the request, not of the action. The command has
            been accepted for delivery; whether the vehicle performs it is learned later, through
            the status stream.
          </Text>
        </Surface>
      </View>
    </Screen>
  );
}

const TraceCard = ({
  command,
  expanded,
  onToggle,
}: {
  command: VehicleCommand;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const theme = useTheme();
  const commandLabel = useCommandLabel();
  const failureLabel = useFailureLabel();
  const trace = command.trace ?? [];
  const total = trace.reduce((sum, stage) => sum + stage.elapsedMs, 0);
  const success = isSuccess(command.status);
  const failed = isTerminal(command.status) && !success;

  return (
    <Surface padded={false}>
      <Pressable
        onPress={onToggle}
        haptic="light"
        scaleTo={0.99}
        accessibilityLabel={`${commandLabel(command.type)} trace, ${command.status}`}
        accessibilityState={{ expanded }}
        style={{ padding: theme.spacing.base }}
      >
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <Row gap={theme.spacing.sm}>
              <Text variant="bodyStrong">{commandLabel(command.type)}</Text>
              {command.wasRetry && <StatusPill label="Retry" tone="desert" compact />}
            </Row>
            <Text variant="mono" color={theme.colors.textTertiary} style={{ marginTop: 4 }}>
              {command.correlationId} · {clockTime(command.requestedAt)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <StatusPill
              label={command.status}
              tone={success ? 'success' : failed ? 'critical' : 'electric'}
              pulse={!isTerminal(command.status)}
              compact
            />
            <Text variant="micro" numeric color={theme.colors.textSecondary}>
              {total > 0 ? `${(total / 1000).toFixed(2)}s` : '—'}
            </Text>
          </View>
        </Row>

        {failed && failureLabel(command) && (
          <Text
            variant="caption"
            color={theme.colors.critical}
            style={{ marginTop: theme.spacing.sm }}
          >
            {failureLabel(command)}
          </Text>
        )}
      </Pressable>

      {expanded && (
        <View
          style={{
            paddingHorizontal: theme.spacing.base,
            paddingBottom: theme.spacing.base,
            gap: theme.spacing.md,
          }}
        >
          <View style={{ height: 1, backgroundColor: theme.colors.line }} />

          <Row justify="space-between">
            <Text variant="mono" color={theme.colors.textTertiary}>
              idempotencyKey
            </Text>
            <Text variant="mono" color={theme.colors.textSecondary}>
              {command.idempotencyKey}
            </Text>
          </Row>
          <Row justify="space-between">
            <Text variant="mono" color={theme.colors.textTertiary}>
              expiresAt
            </Text>
            <Text variant="mono" color={theme.colors.textSecondary}>
              {clockTime(command.expiresAt)}
            </Text>
          </Row>

          {trace.length === 0 ? (
            <Text variant="caption" color={theme.colors.textTertiary}>
              This command failed before it reached the pipeline, so no stages were recorded.
            </Text>
          ) : (
            trace.map((stage, index) => {
              const copy = TRACE_STAGE_COPY[stage.stage];
              const share = total > 0 ? stage.elapsedMs / total : 0;
              return (
                <View key={`${stage.stage}-${index}`} style={{ gap: 6 }}>
                  <Row justify="space-between">
                    <Row gap={theme.spacing.sm} style={{ flex: 1 }}>
                      <Icon
                        name={stage.ok ? 'check' : 'close'}
                        size={14}
                        color={stage.ok ? theme.colors.electric : theme.colors.critical}
                      />
                      <Text variant="caption" style={{ flex: 1 }}>
                        {copy.label}
                      </Text>
                    </Row>
                    <Text variant="mono" numeric color={theme.colors.textSecondary}>
                      {stage.elapsedMs} ms
                    </Text>
                  </Row>
                  <ProgressBar
                    progress={share}
                    height={4}
                    tone={stage.ok ? 'electric' : 'critical'}
                    label={copy.label}
                  />
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    {copy.layer}
                    {stage.detail ? ` — ${stage.detail}` : ''}
                  </Text>
                </View>
              );
            })
          )}

          {command.completedAt && (
            <Text variant="micro" color={theme.colors.textTertiary}>
              Completed {relativeTime(command.completedAt)}
            </Text>
          )}

          <Surface tone="soft" padded="tight">
            <Text variant="micro" color={theme.colors.textTertiary}>
              {PIPELINE_LAYER_NOTE}
            </Text>
          </Surface>
        </View>
      )}
    </Surface>
  );
};

const Metric = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'critical';
}) => {
  const theme = useTheme();
  const color =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'critical'
          ? theme.colors.critical
          : theme.colors.textPrimary;

  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ minWidth: 92 }}>
      <Text variant="mono" color={theme.colors.textTertiary}>
        {label.toUpperCase()}
      </Text>
      <Text variant="subheading" numeric color={color} style={{ marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
};

const CodeBlock = ({ value }: { value: Record<string, unknown> }) => {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.base,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
      }}
    >
      <Text variant="mono" color={theme.colors.electric} numeric>
        {JSON.stringify(value, null, 2)}
      </Text>
    </View>
  );
};
