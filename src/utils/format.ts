export type UnitSystem = 'metric' | 'imperial';

export const formatRange = (km: number, units: UnitSystem): { value: string; unit: string } =>
  units === 'metric'
    ? { value: String(Math.round(km)), unit: 'km' }
    : { value: String(Math.round(km * 0.621371)), unit: 'mi' };

export const formatTemp = (celsius: number, units: UnitSystem): { value: string; unit: string } =>
  units === 'metric'
    ? { value: String(Math.round(celsius)), unit: '°C' }
    : { value: String(Math.round(celsius * 1.8 + 32)), unit: '°F' };

export const formatPressure = (kpa: number, units: UnitSystem): { value: string; unit: string } =>
  units === 'metric'
    ? { value: (kpa / 100).toFixed(1), unit: 'bar' }
    : { value: (kpa * 0.145038).toFixed(0), unit: 'psi' };

export const formatSpeed = (kph: number, units: UnitSystem): { value: string; unit: string } =>
  units === 'metric'
    ? { value: String(Math.round(kph)), unit: 'km/h' }
    : { value: String(Math.round(kph * 0.621371)), unit: 'mph' };

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Converts Arabic-Indic digits for RTL display when the locale calls for it. */
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export const toArabicDigits = (input: string): string =>
  input.replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
