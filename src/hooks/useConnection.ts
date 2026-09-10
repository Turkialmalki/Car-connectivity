import { useEffect, useState } from 'react';
import { connected, connectedBackend } from '@/infrastructure/api';
import { useVehicleStore } from '@/stores';
import type { ConnectionStatus } from '@/infrastructure/connected-backend';

/**
 * How fresh the data on screen is, and whether the app is still receiving it.
 *
 * Two independent facts, deliberately kept apart:
 *
 *   `status` — can this app reach the service right now
 *   `stale`  — is the vehicle's own last report old
 *
 * A live socket carrying a snapshot from four minutes ago is not the same thing
 * as a dropped socket, and a user deciding whether to walk to their car deserves
 * to be told which one they are looking at.
 */
export const STALE_AFTER_MS = 15_000;

export type ConnectionSummary = {
  status: ConnectionStatus;
  /** The vehicle has not reported recently enough to call this live. */
  stale: boolean;
  ageMs: number | null;
  /** Concise, user-facing sentence. Diagnostics belong in the simulator console. */
  label: string;
};

export const useConnection = (): ConnectionSummary => {
  const [status, setStatus] = useState<ConnectionStatus>(connected ? 'connecting' : 'live');
  const lastUpdatedAt = useVehicleStore((s) => s.state?.lastUpdatedAt);
  const isCached = useVehicleStore((s) => s.state?.isCached ?? false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!connected) return;
    return connectedBackend.observeConnection(setStatus);
  }, []);

  // A snapshot goes stale by the passage of time, not by an event, so the age
  // has to be re-evaluated on a timer. One second is enough for a timestamp
  // that is displayed to the minute, and cheap enough not to matter.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ageMs = lastUpdatedAt ? now - new Date(lastUpdatedAt).getTime() : null;
  const stale = isCached || (ageMs !== null && ageMs > STALE_AFTER_MS);

  const label = (() => {
    if (status === 'offline') return 'Not connected — showing last known state';
    if (status === 'reconnecting') return 'Reconnecting…';
    if (status === 'connecting') return 'Connecting…';
    if (stale) return 'Last known state';
    return 'Live';
  })();

  return { status, stale, ageMs, label };
};
