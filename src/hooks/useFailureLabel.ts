import { useCallback } from 'react';
import type { VehicleCommand } from '@/domain/entities';
import { useI18n, type TranslationKey } from '@/i18n';

/**
 * Localised failure text.
 *
 * Reads the machine-readable `failureCode` where the command carries one and
 * falls back to the stored English prose otherwise, so a command captured
 * before a locale switch still renders something meaningful.
 */
export const useFailureLabel = () => {
  const { t } = useI18n();
  return useCallback(
    (command: Pick<VehicleCommand, 'failureCode' | 'failureReason'>): string | undefined => {
      if (command.failureCode) return t(`failures.${command.failureCode}` as TranslationKey);
      return command.failureReason;
    },
    [t],
  );
};
