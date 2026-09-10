import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import type { TransientEvent } from '@/domain/entities';
import { useAppStore, useCommandStore, useVehicleStore } from '@/stores';
import { logger } from '@/utils/logger';

/**
 * Presents bounded physical events — horn and flash — exactly once.
 *
 * Two rules this exists to enforce:
 *
 *  1. An event is keyed by the id the VEHICLE assigned it. A duplicate
 *     telemetry frame, a reordered delivery, or navigating back to a screen all
 *     resolve to the same id, so the horn buzzes once and never again.
 *  2. Device feedback is bounded and opt-out. The horn is a short pulse, not a
 *     loop, and it is silent when the user has turned haptics off.
 *
 * The visual side of a flash is handled inside the vehicle scene, which lights
 * the actual head and tail surfaces for the event's reported duration.
 */
export const useTransientFeedback = () => {
  const events = useVehicleStore((s) => s.state?.transientEvents);
  const presented = useCommandStore((s) => s.presentedEventIds);
  const markPresented = useCommandStore((s) => s.markEventPresented);
  const hapticsEnabled = useAppStore((s) => s.hapticsEnabled);

  useEffect(() => {
    if (!events?.length) return;
    const seen = new Set(presented);
    const horn = events.find((e: TransientEvent) => e.kind === 'horn' && !seen.has(e.id));
    if (!horn) return;

    markPresented(horn);
    if (!hapticsEnabled) return;
    // One bounded pulse. Deliberately not a repeating pattern for the horn's
    // full duration — that would be the phone imitating the vehicle.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) =>
      logger.warn('Haptic feedback unavailable', { error: String(error) }),
    );
  }, [events, presented, markPresented, hapticsEnabled]);
};
