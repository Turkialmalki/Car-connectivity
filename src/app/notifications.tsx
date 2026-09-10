import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import {
  Icon,
  Pressable,
  Row,
  Screen,
  SectionHeader,
  SegmentedControl,
  Surface,
  Text,
  Toggle,
} from '@/components/design-system';
import { EmptyState } from '@/components/feedback';
import { StackHeader } from '@/features/shared/StackHeader';
import { CATEGORY_COPY, type NotificationCategory } from '@/domain/entities';
import { useNotifications } from '@/hooks';
import { useAppStore } from '@/stores';
import { relativeTime } from '@/utils/time';

/** Notification centre plus per-category preferences. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const prefs = useAppStore((s) => s.notificationPrefs);
  const setPref = useAppStore((s) => s.setNotificationPref);
  const [tab, setTab] = useState<'inbox' | 'preferences'>('inbox');

  return (
    <Screen contentStyle={{ paddingHorizontal: theme.spacing.xl }}>
      <StackHeader
        title={t('notifications.title')}
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : t('notifications.empty')}
        action={
          unreadCount > 0 ? (
            <Pressable
              onPress={() => void markAllRead()}
              haptic="light"
              minTouchTarget={false}
              accessibilityLabel={t('notifications.markAllRead')}
              style={{ padding: 8 }}
            >
              <Text variant="caption" color={theme.colors.electric}>
                {t('notifications.markAllRead')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <SegmentedControl
        label="Notification view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inbox', label: t('notifications.title') },
          { value: 'preferences', label: t('notifications.preferences') },
        ]}
      />

      {tab === 'inbox' ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          {notifications.length === 0 ? (
            <EmptyState icon="bell" title={t('notifications.empty')} />
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              {notifications.map((notification) => {
                const tone =
                  notification.severity === 'critical'
                    ? theme.colors.critical
                    : notification.severity === 'warning'
                      ? theme.colors.warning
                      : notification.severity === 'success'
                        ? theme.colors.success
                        : theme.colors.electric;
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => void markRead(notification.id)}
                    haptic="light"
                    scaleTo={0.985}
                    accessibilityLabel={`${notification.title}. ${notification.body}`}
                  >
                    <Surface tone={notification.read ? 'outline' : 'elevated'}>
                      <Row gap={theme.spacing.md} align="flex-start">
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: notification.read ? theme.colors.soft : `${tone}22`,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon
                            name={iconFor(notification.category)}
                            size={16}
                            color={notification.read ? theme.colors.textTertiary : tone}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Row justify="space-between">
                            <Text
                              variant="bodyStrong"
                              color={
                                notification.read
                                  ? theme.colors.textSecondary
                                  : theme.colors.textPrimary
                              }
                              style={{ flex: 1 }}
                            >
                              {notification.title}
                            </Text>
                            <Text variant="micro" color={theme.colors.textTertiary}>
                              {relativeTime(notification.createdAt)}
                            </Text>
                          </Row>
                          <Text
                            variant="caption"
                            color={theme.colors.textSecondary}
                            style={{ marginTop: 4 }}
                          >
                            {notification.body}
                          </Text>
                          {notification.correlationId && (
                            <Text
                              variant="mono"
                              color={theme.colors.textTertiary}
                              style={{ marginTop: 6 }}
                            >
                              {notification.correlationId}
                            </Text>
                          )}
                        </View>
                        {!notification.read && (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: theme.colors.electric,
                              marginTop: 6,
                            }}
                          />
                        )}
                      </Row>
                    </Surface>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader
            title="Categories"
            subtitle="Turn off what you do not need. Security alerts stay on by default."
          />
          <Surface>
            <View style={{ gap: theme.spacing.lg }}>
              {(Object.keys(CATEGORY_COPY) as NotificationCategory[]).map((category) => (
                <Toggle
                  key={category}
                  label={CATEGORY_COPY[category].label}
                  description={CATEGORY_COPY[category].detail}
                  value={prefs[category]}
                  onChange={(value) => setPref(category, value)}
                />
              ))}
            </View>
          </Surface>
        </View>
      )}
    </Screen>
  );
}

const iconFor = (category: NotificationCategory) => {
  switch (category) {
    case 'charging':
      return 'charge' as const;
    case 'security':
      return 'shield' as const;
    case 'climate':
      return 'climate' as const;
    case 'digital_key':
      return 'key' as const;
    case 'software':
      return 'download' as const;
    case 'health':
      return 'wrench' as const;
    case 'commands':
      return 'alert' as const;
    case 'geofence':
      return 'location' as const;
    case 'service':
      return 'clock' as const;
  }
};
