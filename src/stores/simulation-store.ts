import { create } from 'zustand';
import type { ChargingStatus, ConnectivityMode } from '@/domain/entities';
import { simulationControl } from '@/infrastructure/api';

/**
 * Developer simulation state.
 *
 * This is the presenter's control surface: it drives the mock cloud's
 * connectivity mode and charging scenario so failure paths can be demonstrated
 * deliberately rather than waited for.
 */
type SimulationState = {
  connectivity: ConnectivityMode;
  chargingScenario: ChargingStatus;
  isMoving: boolean;
  /** Forces every biometric prompt to fail, to demo the rejection path. */
  forceBiometricFailure: boolean;
  panelUnlocked: boolean;

  setConnectivity: (mode: ConnectivityMode) => void;
  setChargingScenario: (vehicleId: string, status: ChargingStatus) => void;
  setMoving: (vehicleId: string, moving: boolean) => void;
  setForceBiometricFailure: (value: boolean) => void;
  unlockPanel: () => void;
  resetAll: (vehicleId: string) => void;
};

export const useSimulationStore = create<SimulationState>((set) => ({
  connectivity: 'online',
  chargingScenario: 'not_plugged_in',
  isMoving: false,
  forceBiometricFailure: false,
  panelUnlocked: false,

  setConnectivity: (mode) => {
    simulationControl.setConnectivity(mode);
    set({ connectivity: mode });
  },
  setChargingScenario: (vehicleId, status) => {
    simulationControl.setChargingScenario(vehicleId, status);
    set({ chargingScenario: status });
  },
  setMoving: (vehicleId, moving) => {
    simulationControl.setMoving(vehicleId, moving);
    set({ isMoving: moving });
  },
  setForceBiometricFailure: (value) => set({ forceBiometricFailure: value }),
  unlockPanel: () => set({ panelUnlocked: true }),
  resetAll: (vehicleId) => {
    simulationControl.reset();
    simulationControl.setActiveVehicle(vehicleId);
    set({
      connectivity: 'online',
      chargingScenario: 'not_plugged_in',
      isMoving: false,
      forceBiometricFailure: false,
    });
  },
}));
