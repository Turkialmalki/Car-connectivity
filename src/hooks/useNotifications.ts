import { useCallback, useEffect, useState } from 'react';
import type { AppNotification } from '@/domain/entities';
import { notificationRepository, simulationControl } from '@/infrastructure/api';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => simulationControl.observeNotifications(setNotifications), []);

  const markRead = useCallback(async (id: string) => {
    await notificationRepository.markRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationRepository.markAllRead();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead };
};

/** Unread count only — used by the header badge without re-rendering on body changes. */
export const useNotificationBadge = (): number => {
  const [count, setCount] = useState(0);
  useEffect(
    () =>
      simulationControl.observeNotifications((list) =>
        setCount(list.filter((n) => !n.read).length),
      ),
    [],
  );
  return count;
};
