import { useCallback } from 'react';
import type { CommandType } from '@/domain/entities';
import { useI18n, type TranslationKey } from '@/i18n';

/**
 * Localised command names.
 *
 * The domain layer keeps a canonical English `COMMAND_COPY` for logs and traces;
 * anything a driver reads goes through here instead, so Arabic gets real command
 * names rather than mirrored English.
 */
export const useCommandLabel = () => {
  const { t } = useI18n();
  return useCallback((type: CommandType) => t(`commandTypes.${type}` as TranslationKey), [t]);
};
