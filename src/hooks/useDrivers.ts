import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessAuditEvent,
  AccessDuration,
  DriverPermission,
  SharedDriver,
} from '@/domain/entities';
import { driverAccessRepository } from '@/infrastructure/api';
import { useAppStore } from '@/stores';

export const useDrivers = () => {
  const vehicleId = useAppStore((s) => s.activeVehicleId);
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['drivers', vehicleId] });
    void queryClient.invalidateQueries({ queryKey: ['access-audit', vehicleId] });
    void queryClient.invalidateQueries({ queryKey: ['digital-keys', vehicleId] });
  };

  const drivers = useQuery<SharedDriver[]>({
    queryKey: ['drivers', vehicleId],
    queryFn: () => driverAccessRepository.listDrivers(vehicleId),
  });

  const audit = useQuery<AccessAuditEvent[]>({
    queryKey: ['access-audit', vehicleId],
    queryFn: () => driverAccessRepository.listAuditEvents(vehicleId),
  });

  const invite = useMutation({
    mutationFn: (input: {
      name: string;
      contact: string;
      permissions: DriverPermission[];
      duration: AccessDuration;
    }) => driverAccessRepository.inviteDriver(vehicleId, input),
    onSuccess: invalidate,
  });

  const updatePermissions = useMutation({
    mutationFn: (input: { driverId: string; permissions: DriverPermission[] }) =>
      driverAccessRepository.updatePermissions(vehicleId, input.driverId, input.permissions),
    onSuccess: invalidate,
  });

  const suspend = useMutation({
    mutationFn: (driverId: string) => driverAccessRepository.suspendDriver(vehicleId, driverId),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (driverId: string) => driverAccessRepository.revokeDriver(vehicleId, driverId),
    onSuccess: invalidate,
  });

  return { drivers, audit, invite, updatePermissions, suspend, revoke };
};
