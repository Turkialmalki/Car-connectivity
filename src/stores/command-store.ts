import { create } from 'zustand';
import type { TransientEvent, VehicleCommand } from '@/domain/entities';
import { conflictKey, isInFlight, isTerminal } from '@/domain/entities';

/**
 * In-flight command tracking.
 *
 * The UI reads command status from here and NEVER from an optimistic local
 * guess. `activeCommandId` drives the command status sheet; `history` is the
 * per-account audit trail shown on the Vehicle screen.
 */
type CommandState = {
  commands: Record<string, VehicleCommand>;
  history: VehicleCommand[];
  activeCommandId: string | null;
  /** Provisioning attempts, for the observability metrics panel. */
  keyProvisioning: { succeeded: number; total: number };
  /**
   * Transient events (flash, horn) that have already been presented.
   *
   * Keyed by the id the VEHICLE assigned, so a duplicate telemetry frame, a
   * screen remount, or navigating back can never replay a horn.
   */
  presentedEventIds: string[];

  upsert: (command: VehicleCommand) => void;
  markEventPresented: (event: TransientEvent) => void;
  setActive: (commandId: string | null) => void;
  clearActive: () => void;
  recordKeyProvisioning: (succeeded: boolean) => void;
  reset: () => void;
};

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: {},
  history: [],
  activeCommandId: null,
  keyProvisioning: { succeeded: 0, total: 0 },
  presentedEventIds: [],

  upsert: (command) => {
    const { commands, history } = get();
    const existing = commands[command.id];
    // Late duplicates from an at-least-once broker must not resurrect a
    // finished command.
    if (existing && isTerminal(existing.status) && !isTerminal(command.status)) return;

    const nextHistory = history.some((c) => c.id === command.id)
      ? history.map((c) => (c.id === command.id ? command : c))
      : [command, ...history];

    set({
      commands: { ...commands, [command.id]: command },
      history: nextHistory.slice(0, 60),
    });
  },
  markEventPresented: (event) =>
    set((state) =>
      state.presentedEventIds.includes(event.id)
        ? state
        : { presentedEventIds: [...state.presentedEventIds, event.id].slice(-40) },
    ),
  setActive: (commandId) => set({ activeCommandId: commandId }),
  clearActive: () => set({ activeCommandId: null }),
  recordKeyProvisioning: (succeeded) =>
    set({
      keyProvisioning: {
        succeeded: get().keyProvisioning.succeeded + (succeeded ? 1 : 0),
        total: get().keyProvisioning.total + 1,
      },
    }),
  reset: () =>
    set({ commands: {}, history: [], activeCommandId: null, presentedEventIds: [] }),
}));

/**
 * The unresolved command, if any, that already owns this intent.
 *
 * Two taps on "open boot" are the SAME intent and must not produce two
 * commands; "open boot" and "close boot" are a conflict on the same panel and
 * are resolved by policy (see `useSendCommand`). Unrelated intents — climate
 * while the boot is open, say — are free to run concurrently.
 */
export const findConflicting = (
  state: CommandState,
  type: VehicleCommand['type'],
  payload?: VehicleCommand['payload'],
): VehicleCommand | null => {
  const key = conflictKey(type, payload);
  const match = Object.values(state.commands).find(
    (c) => isInFlight(c.status) && conflictKey(c.type, c.payload) === key,
  );
  return match ?? null;
};

export const selectPresentedEventIds = (state: CommandState): ReadonlySet<string> =>
  new Set(state.presentedEventIds);

export const selectActiveCommand = (state: CommandState): VehicleCommand | null =>
  state.activeCommandId ? (state.commands[state.activeCommandId] ?? null) : null;
