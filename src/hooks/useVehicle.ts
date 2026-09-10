import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Vehicle, VehicleState } from '@/domain/entities';
import { telemetryRepository, vehicleRepository } from '@/infrastructure/api';
import { useAppStore, useVehicleStore } from '@/stores';

/**
 * Live vehicle state.
 *
 * TanStack Query owns the initial fetch and cache; the telemetry subscription
 * then pushes authoritative updates into the Zustand store. Screens read the
 * store, so a state change reaches every screen at once with no refetch.
 */
export const useVehicleState = (): VehicleState | null => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const state = useVehicleStore((s) => s.state);
  const setState = useVehicleStore((s) => s.setState);

  useEffect(() => {
    const unsubscribe = telemetryRepository.observeState(vehicleId, setState);
    return unsubscribe;
  }, [vehicleId, setState]);

  return state;
};

export const useVehicle = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  return useQuery<Vehicle>({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => vehicleRepository.getVehicle(vehicleId),
    staleTime: 5 * 60 * 1000,
  });
};

export const useVehicles = () =>
  useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: () => vehicleRepository.listVehicles(),
    staleTime: 5 * 60 * 1000,
  });

export const useCapabilities = () => {
  const { data: vehicle } = useVehicle();
  return vehicle?.capabilities ?? null;
};
