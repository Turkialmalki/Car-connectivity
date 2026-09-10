import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Icon, Row, Screen, SectionHeader, Surface, Text } from '@/components/design-system';
import { StackHeader } from '@/features/shared/StackHeader';
import { API_CONTRACT } from '@/infrastructure/api';

/**
 * About and privacy.
 *
 * The disclaimer is prominent and unambiguous, and the architecture is stated
 * plainly — including what is simulated. A prototype that overclaims is worse
 * than one that is honest about its boundaries.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader title={t('profile.about')} />

      {/* The required disclaimer, given its own surface. */}
      <Surface tone="soft">
        <Row gap={theme.spacing.md} align="flex-start">
          <Icon name="info" size={19} color={theme.colors.desert} />
          <Text variant="bodyStrong" color={theme.colors.desert} style={{ flex: 1 }}>
            {t('about.disclaimer')}
          </Text>
        </Row>
      </Surface>

      {/* Where the vehicle you are looking at comes from. */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('about.vehicleModel')} />
        <Surface tone="soft">
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('about.vehicleModelBody')}
          </Text>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title={t('about.simulated')} />
        <Surface>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('about.simulatedBody')}
          </Text>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Architecture" />
        <Surface>
          <View style={{ gap: theme.spacing.md }}>
            {[
              'Mobile app (React Native)',
              'Connected Services API',
              'Command Service',
              'IoT Broker',
              'Vehicle TCU',
              'Secure Gateway',
              'Vehicle ECU',
            ].map((layer, index, all) => (
              <Row key={layer} gap={theme.spacing.md}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: index === 0 ? theme.colors.electricDim : theme.colors.soft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    variant="micro"
                    color={index === 0 ? theme.colors.electric : theme.colors.textTertiary}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  variant="body"
                  color={index === 0 ? theme.colors.textPrimary : theme.colors.textSecondary}
                  style={{ flex: 1 }}
                >
                  {layer}
                </Text>
                {index < all.length - 1 && (
                  <Icon name="chevron-down" size={14} color={theme.colors.textTertiary} />
                )}
              </Row>
            ))}
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.line,
              marginVertical: theme.spacing.base,
            }}
          />
          <Text variant="caption" color={theme.colors.textSecondary}>
            The app occupies layer one only. Everything from layer two onward is simulated by a mock
            connected cloud that implements the same repository interfaces a production client
            would. The vehicle — layer seven — remains the only authority for physical execution.
          </Text>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="Privacy" />
        <Surface>
          <View style={{ gap: theme.spacing.md }}>
            <PrivacyPoint
              title="VIN"
              detail="The full VIN is written to the device keychain and never rendered — only the last four characters are shown, and logs replace it entirely."
            />
            <PrivacyPoint
              title="Location"
              detail="Reported by the vehicle, not your phone. Coordinates are coarsened to roughly one kilometre before they reach any log."
            />
            <PrivacyPoint
              title="Personal details"
              detail="Email addresses and phone numbers are masked in every log and analytics event by a redacting logger."
            />
            <PrivacyPoint
              title="Credentials"
              detail="Session tokens live in the platform keychain. Digital Key material never exists in JavaScript at all — it lives in the device secure element."
            />
          </View>
        </Surface>
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader title="API surface" subtitle="The contract the mock cloud implements." />
        <Surface padded="tight">
          <View style={{ gap: theme.spacing.sm }}>
            {API_CONTRACT.map((endpoint) => (
              <Row
                key={`${endpoint.method}${endpoint.path}`}
                gap={theme.spacing.sm}
                align="flex-start"
              >
                <View
                  style={{
                    backgroundColor:
                      endpoint.method === 'GET' ? theme.colors.soft : theme.colors.electricDim,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    minWidth: 52,
                  }}
                >
                  <Text
                    variant="micro"
                    align="center"
                    color={
                      endpoint.method === 'GET' ? theme.colors.textTertiary : theme.colors.electric
                    }
                  >
                    {endpoint.method}
                  </Text>
                </View>
                <Text variant="mono" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                  {endpoint.path}
                </Text>
              </Row>
            ))}
          </View>
        </Surface>
      </View>

      <Text
        variant="micro"
        align="center"
        color={theme.colors.textTertiary}
        style={{ marginTop: theme.spacing.xxl }}
      >
        Version 1.0.0 · Prototype build · Not for production use
      </Text>
    </Screen>
  );
}

const PrivacyPoint = ({ title, detail }: { title: string; detail: string }) => {
  const theme = useTheme();
  return (
    <View>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
        {detail}
      </Text>
    </View>
  );
};
