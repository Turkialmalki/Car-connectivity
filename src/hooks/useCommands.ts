import { useCallback, useEffect, useMemo } from 'react';
import {
  type CommandType,
  type VehicleCommand,
  COMMAND_COPY,
  DEFAULT_EXPIRY_SECONDS,
  isHighRisk,
} from '@/domain/entities';
import { authorizeCommand, buildRetry } from '@/domain/use-cases';
import { capabilitiesFor, commandRepository, connected, connectedBackend, simulationControl } from '@/infrastructure/api';
import { createBiometricAdapter } from '@/infrastructure/native-connectivity';
import { findConflicting } from '@/stores/command-store';
import { useAppStore, useCommandStore, useSimulationStore, useVehicleStore } from '@/stores';
import { idempotencyKey as newIdempotencyKey } from '@/utils/id';
import { logger } from '@/utils/logger';
import { nowIso } from '@/utils/time';

const biometric = createBiometricAdapter();

export type SendResult =
  | { ok: true; commandId: string; deduplicated?: boolean }
  | { ok: false; reason: string; blocked: 'authorization' | 'biometric' | 'conflict' };

/**
 * The single entry point for issuing a vehicle command.
 *
 * Sequence for a high-risk command such as unlock:
 *   1. Client-side authorization check (capability, permission, vehicle state)
 *   2. Biometric step-up
 *   3. Generate an idempotency key
 *   4. POST the command; server authorises again — the client check is a courtesy
 *   5. Observe the pipeline through to a vehicle acknowledgement
 *   6. Only then does the UI reflect the new state
 *
 * Nothing here mutates vehicle state. That is the point.
 */
export const useSendCommand = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const requireBiometricForUnlock = useAppStore((s) => s.requireBiometricForUnlock);
  const forceBiometricFailure = useSimulationStore((s) => s.forceBiometricFailure);
  const state = useVehicleStore((s) => s.state);
  const upsert = useCommandStore((s) => s.upsert);
  const setActive = useCommandStore((s) => s.setActive);

  return useCallback(
    async (
      type: CommandType,
      options: {
        payload?: Record<string, number | string | boolean>;
        /** Suppresses the status sheet, for background writes like a temp nudge. */
        silent?: boolean;
        expiresInSeconds?: number;
      } = {},
    ): Promise<SendResult> => {
      // --- 0. Deduplicate / resolve conflicts -------------------------------
      // Repeated taps are the same intent: return the command already running
      // rather than issuing a second one. A request that would move the SAME
      // part the OTHER way is refused while the first is still unresolved,
      // because reversing a panel mid-travel is not a state the vehicle can be
      // asked to reach. Unrelated controls stay available throughout.
      const existing = findConflicting(useCommandStore.getState(), type, options.payload);
      if (existing) {
        if (existing.type === type) {
          if (!options.silent) setActive(existing.id);
          return { ok: true, commandId: existing.id, deduplicated: true };
        }
        return {
          ok: false,
          reason: `${COMMAND_COPY[existing.type]} is still in progress.`,
          blocked: 'conflict',
        };
      }

      const capabilities = capabilitiesFor(vehicleId);

      const auth = authorizeCommand({
        type,
        capabilities,
        connectivity: state?.connectivity ?? 'online',
        isMoving: state?.isMoving ?? false,
        requireBiometricForUnlock,
      });

      if (!auth.allowed) {
        logger.warn('Command blocked before submission', { type, reason: auth.reason });
        return { ok: false, reason: auth.message, blocked: 'authorization' };
      }

      if (auth.requiresBiometric) {
        if (forceBiometricFailure) {
          return {
            ok: false,
            reason: 'Biometric verification was refused.',
            blocked: 'biometric',
          };
        }
        const result = await biometric.authenticate(
          `Confirm to ${COMMAND_COPY[type].toLowerCase()}`,
        );
        if (!result.success) {
          return {
            ok: false,
            reason:
              result.reason === 'cancelled'
                ? 'Biometric confirmation was cancelled.'
                : 'Biometric verification failed. The command was not sent.',
            blocked: 'biometric',
          };
        }
      }

      const accepted = await commandRepository.submitCommand(vehicleId, {
        type,
        idempotencyKey: newIdempotencyKey(),
        requestedAt: nowIso(),
        expiresInSeconds: options.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS[type],
        payload: options.payload,
      });

      const command = await commandRepository.getCommand(vehicleId, accepted.commandId);
      upsert(command);
      if (!options.silent) setActive(accepted.commandId);

      // Mirror every pipeline transition into the store.
      const unsubscribe = commandRepository.observeCommand(accepted.commandId, (next) => {
        upsert(next);
      });
      // The simulator stops emitting once terminal; drop the listener shortly after
      // the longest possible run to avoid leaking subscriptions during a demo.
      setTimeout(unsubscribe, 45_000);

      return { ok: true, commandId: accepted.commandId };
    },
    [vehicleId, requireBiometricForUnlock, forceBiometricFailure, state, upsert, setActive],
  );
};

/** Retries a failed command, reusing its original idempotency key. */
export const useRetryCommand = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const upsert = useCommandStore((s) => s.upsert);
  const setActive = useCommandStore((s) => s.setActive);

  return useCallback(
    async (original: VehicleCommand): Promise<SendResult> => {
      const retry = buildRetry(original, `corr_retry_${Date.now().toString(36)}`);
      const accepted = await commandRepository.submitCommand(vehicleId, {
        type: retry.type,
        // Same key: the command service must see this as the same intent.
        idempotencyKey: retry.idempotencyKey,
        requestedAt: retry.requestedAt,
        expiresInSeconds: Math.round(
          (new Date(retry.expiresAt).getTime() - new Date(retry.requestedAt).getTime()) / 1000,
        ),
        payload: retry.payload,
      });
      const command = await commandRepository.getCommand(vehicleId, accepted.commandId);
      upsert(command);
      setActive(accepted.commandId);
      const unsubscribe = commandRepository.observeCommand(accepted.commandId, upsert);
      setTimeout(unsubscribe, 45_000);
      return { ok: true, commandId: accepted.commandId };
    },
    [vehicleId, upsert, setActive],
  );
};

export const useActiveCommand = (): VehicleCommand | null => {
  const activeId = useCommandStore((s) => s.activeCommandId);
  const commands = useCommandStore((s) => s.commands);
  return activeId ? (commands[activeId] ?? null) : null;
};

export const useCommandHistory = (): VehicleCommand[] => {
  const history = useCommandStore((s) => s.history);
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  return useMemo(() => history.filter((c) => c.vehicleId === vehicleId), [history, vehicleId]);
};

/**
 * Keeps the global store in sync with every command update.
 *
 * In connected mode these arrive on the vehicle's private realtime channel and
 * from the reconcile fetch; on local fixtures they come from the in-process
 * simulator. Either way the subscription is torn down on unmount, so a
 * remounted screen replaces its listener rather than adding a second one.
 */
export const useCommandStream = () => {
  const upsert = useCommandStore((s) => s.upsert);
  useEffect(
    () =>
      connected
        ? connectedBackend.observeAllCommands(upsert)
        : simulationControl.simulator.observeAll(upsert),
    [upsert],
  );
};

export { isHighRisk };
