import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DigitalKey, DigitalKeyCarrier } from '@/domain/entities';
import { digitalKeyRepository } from '@/infrastructure/api';
import { useAppStore, useCommandStore } from '@/stores';

export const useDigitalKeys = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const queryClient = useQueryClient();
  const recordProvisioning = useCommandStore((s) => s.recordKeyProvisioning);

  const query = useQuery<DigitalKey[]>({
    queryKey: ['digital-keys', vehicleId],
    queryFn: () => digitalKeyRepository.listKeys(vehicleId),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['digital-keys', vehicleId] }),
    [queryClient, vehicleId],
  );

  const provision = useMutation({
    mutationFn: (input: {
      carrier: DigitalKeyCarrier;
      deviceLabel: string;
      holderName: string;
      onStep?: (stepId: string) => void;
    }) => digitalKeyRepository.provisionKey(vehicleId, input, input.onStep),
    onSuccess: () => {
      recordProvisioning(true);
      void invalidate();
    },
    onError: () => recordProvisioning(false),
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => digitalKeyRepository.revokeKey(vehicleId, keyId),
    onSuccess: invalidate,
  });

  const suspend = useMutation({
    mutationFn: (keyId: string) => digitalKeyRepository.suspendKey(vehicleId, keyId),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: (keyId: string) => digitalKeyRepository.resumeKey(vehicleId, keyId),
    onSuccess: invalidate,
  });

  return { ...query, provision, revoke, suspend, resume };
};
