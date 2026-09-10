import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OtaUpdate } from '@/domain/entities';
import { otaRepository } from '@/infrastructure/api';
import { useAppStore } from '@/stores';

export const useOta = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const [liveUpdate, setLiveUpdate] = useState<OtaUpdate | null>(null);

  const query = useQuery<OtaUpdate>({
    queryKey: ['ota', vehicleId],
    queryFn: () => otaRepository.getUpdate(vehicleId),
  });

  const install = useCallback(async () => {
    const result = await otaRepository.startInstall(vehicleId, setLiveUpdate);
    setLiveUpdate(result);
    return result;
  }, [vehicleId]);

  const schedule = useCallback(
    async (whenIso: string) => {
      const result = await otaRepository.scheduleInstall(vehicleId, whenIso);
      setLiveUpdate(result);
      return result;
    },
    [vehicleId],
  );

  return {
    update: liveUpdate ?? query.data ?? null,
    isLoading: query.isLoading,
    install,
    schedule,
  };
};
