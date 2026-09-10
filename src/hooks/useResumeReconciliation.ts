import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { TRANSIENT_EVENT_TTL_MS, isInFlight } from '@/domain/entities';
import { connected, connectedBackend, telemetryRepository } from '@/infrastructure/api';
import { useAppStore, useCommandStore, useVehicleStore } from '@/stores';
import { logger } from '@/utils/logger';

/**
 * Reconciles vehicle state when the app comes back to the foreground.
 *
 * While the app is backgrounded the telemetry subscription may have missed
 * frames, so the snapshot on screen can be arbitrarily old. On resume we
 * re-fetch the authoritative snapshot and adopt it.
 *
 * Three things this deliberately does NOT do:
 *
 *  - It does not resend anything. A command that was in flight when the app
 *    was backgrounded is left exactly as it was; an unlock that expired while
 *    the phone was in a pocket must never fire on resume.
 *  - It does not convert an unresolved command into a failure. An unknown
 *    outcome stays unknown until the provider says otherwise.
 *  - It does not reset the vehicle to a default pose. If the boot was reported
 *    open before backgrounding and the refresh fails, the boot stays open.
 *
 * It also marks any transient event older than its time-to-live as already
 * presented, so returning to the app cannot replay a horn that sounded while
 * the screen was off.
 */
export const useResumeReconciliation = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const setState = useVehicleStore((s) => s.setState);
  const markEventPresented = useCommandStore((s) => s.markEventPresented);
  const previous = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const wasBackgrounded = previous.current.match(/inactive|background/) !== null;
      previous.current = next;
      if (next !== 'active' || !wasBackgrounded) return;

      // Suppress any transient event that is already stale, before it can be
      // handed to the scene or the haptics hook.
      const current = useVehicleStore.getState().state;
      const cutoff = Date.now() - TRANSIENT_EVENT_TTL_MS;
      current?.transientEvents
        .filter((event) => new Date(event.occurredAt).getTime() < cutoff)
        .forEach(markEventPresented);

      // In connected mode the stream's own reconcile is used: it re-reads the
      // snapshot AND the recent command outcomes in one round trip, which is
      // what resolves anything left in flight while the app was away.
      const refresh = connected
        ? connectedBackend.reconcile()
        : telemetryRepository.getTelemetry(vehicleId).then(setState);

      refresh.catch((error: unknown) => {
        // Keep showing the last known state, flagged as cached by the
        // provider, rather than blanking the vehicle out.
        logger.warn('State reconciliation after resume failed', { error: String(error) });
      });

      const unresolved = Object.values(useCommandStore.getState().commands).filter((c) =>
        isInFlight(c.status),
      );
      if (unresolved.length) {
        logger.info('Resumed with unresolved commands; awaiting provider, not resending', {
          count: unresolved.length,
        });
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [vehicleId, setState, markEventPresented]);
};
