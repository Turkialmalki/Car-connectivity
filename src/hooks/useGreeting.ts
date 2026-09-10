import { useI18n } from '@/i18n';

export const useGreeting = (): string => {
  const { t } = useI18n();
  const hour = new Date().getHours();
  if (hour < 12) return t('vehicle.greetingMorning');
  if (hour < 17) return t('vehicle.greetingAfternoon');
  return t('vehicle.greetingEvening');
};
