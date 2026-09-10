import React from 'react';
import { Linking, View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  ListRow,
  Row,
  Screen,
  SectionHeader,
  Surface,
  Text,
} from '@/components/design-system';
import { StackHeader } from '@/features/shared/StackHeader';
import { useUiStore } from '@/stores';
import { useVehicle, useVehicleState } from '@/hooks';

/** Support and roadside assistance. */
export default function HelpScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const showBanner = useUiStore((s) => s.showBanner);
  const state = useVehicleState();
  const { data: vehicle } = useVehicle();

  const call = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() =>
      showBanner('Calling is not available on this device.', 'warning'),
    );
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader title={t('profile.help')} subtitle="Assistance, 24 hours a day" />

      <Surface tone="soft">
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="location" size={19} color={theme.colors.desert} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">What we would share with assistance</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
              {vehicle?.name ?? 'Your vehicle'} · {state?.location.addressLabel ?? '—'},{' '}
              {state?.location.city ?? '—'} · battery{' '}
              {state ? Math.round(state.charge.batteryPercent) : '—'}%. Location is shared only when
              you start a request, and only for the duration of that request.
            </Text>
          </View>
        </Row>
      </Surface>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Immediate assistance" />
        <Surface padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              icon="wrench"
              title="Roadside assistance"
              subtitle="Flat tyre, low charge, lockout or recovery"
              iconColor={theme.colors.desert}
              onPress={() => call('+966800000000')}
            />
            <ListRow
              icon="alert"
              title="Emergency services"
              subtitle="Calls your local emergency number"
              iconColor={theme.colors.critical}
              onPress={() => call('997')}
            />
            <ListRow
              icon="charge"
              title="Nearest charging"
              subtitle="Find a charger within your remaining range"
              onPress={() =>
                showBanner(
                  'Charger discovery needs a live charging-network integration — planned for the next build.',
                  'info',
                )
              }
            />
          </View>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Common questions" />
        <Surface>
          <View style={{ gap: theme.spacing.lg }}>
            <Faq
              question="Why did my unlock say it expired?"
              answer="High-risk commands are given a short window — thirty seconds — on purpose. If the vehicle cannot be reached within it, the command expires rather than sitting queued. An unlock that fires an hour later, when you have walked away, is worse than one that fails."
            />
            <Faq
              question="Why does the app show old data sometimes?"
              answer="When the vehicle is asleep or has no signal, we show the last state it reported and label it clearly, with its age. We would rather tell you the data is twenty minutes old than pretend it is current."
            />
            <Faq
              question="Digital Key or remote unlock — which do I use?"
              answer="Digital Key works locally over radio and needs no signal, so it is what you use at the car. Remote unlock goes through the network and works from anywhere, as long as the vehicle has coverage."
            />
          </View>
        </Surface>
      </View>
    </Screen>
  );
}

const Faq = ({ question, answer }: { question: string; answer: string }) => {
  const theme = useTheme();
  return (
    <View>
      <Text variant="bodyStrong">{question}</Text>
      <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
        {answer}
      </Text>
    </View>
  );
};
