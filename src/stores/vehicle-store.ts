import { create } from 'zustand';
import type { VehicleState } from '@/domain/entities';

/**
 * Authoritative vehicle state, fed exclusively by the telemetry subscription.
 *
 * Nothing in the UI writes to this store. That single rule is what guarantees
 * the interface can never display a state the vehicle has not reported.
 */
type VehicleStoreState = {
  state: VehicleState | null;
  setState: (state: VehicleState) => void;
  clear: () => void;
};

export const useVehicleStore = create<VehicleStoreState>((set) => ({
  state: null,
  setState: (state) => set({ state }),
  clear: () => set({ state: null }),
}));
