import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { PAGE_PADDING, PageHeader, Row, Screen, Text } from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { CHARGING_SESSIONS, type ChargingSession } from '@/infrastructure/mock-connected-cloud';
import { clockTime, formatDuration, longDate, spansDays } from '@/utils/time';

/**
 * Charging history.
 *
 * A restrained vertical list, not an analytics dashboard. Each row answers the
 * questions a bill or a range check actually raises: when, for how long, how
 * much energy, where, and what it cost. Cost is SAR for this demo.
 */
export default function ChargingHistoryScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Screen>
      <PageHeader title={t('charging.history')} />

      <View style={{ paddingHorizontal: PAGE_PADDING, gap: theme.spacing.md }}>
        {CHARGING_SESSIONS.length === 0 ? (
          <EmptyState icon="charge" title={t('charging.noSessions')} />
        ) : (
          CHARGING_SESSIONS.map((session) => <SessionRow key={session.id} session={session} />)
        )}
      </View>
    </Screen>
  );
}

const SessionRow = ({ session }: { session: ChargingSession }) => {
  const theme = useTheme();
  const { t } = useI18n();

  const start = session.startedAt;
  const end = new Date(
    new Date(start).getTime() + session.durationMinutes * 60_000,
  ).toISOString();
  // A session that runs past midnight says so rather than showing an end time
  // that appears to be before its start.
  const window = spansDays(start, end)
    ? `${clockTime(start)} – ${longDate(end).split(',')[1]?.trim() ?? ''}, ${clockTime(end)}`
    : `${clockTime(start)} – ${clockTime(end)}`;

  return (
    <View
      accessible
      accessibilityLabel={`${longDate(start)}, ${window}, ${session.energyKwh} kilowatt hours, ${formatDuration(session.durationMinutes)}, ${session.locationLabel}, ${session.costSar} riyals`}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.base,
        gap: theme.spacing.md,
      }}
    >
      <View>
        <Text variant="subheading">{longDate(start)}</Text>
        <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
          {`${t('charging.from')} ${window}`}
        </Text>
      </View>

      <Text variant="subheading" numeric>
        {`SAR ${session.costSar.toFixed(2)}`}
      </Text>

      <View>
        <Text variant="caption" color={theme.colors.textSecondary} numeric>
          {`${session.energyKwh} kWh in ${formatDuration(session.durationMinutes)}`}
        </Text>
        <Row gap={6} style={{ marginTop: 2 }}>
          <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
            {session.locationLabel}
          </Text>
          <Text variant="caption" color={theme.colors.textTertiary}>
            {session.type === 'dc' ? 'DC' : 'AC'}
          </Text>
        </Row>
      </View>
    </View>
  );
};
