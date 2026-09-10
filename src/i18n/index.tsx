import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { I18nManager } from 'react-native';
import { catalogues, type TranslationShape } from './translations';

export type Language = 'en' | 'ar';

export const LANGUAGES: { code: Language; label: string; nativeLabel: string; rtl: boolean }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', rtl: false },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', rtl: true },
];

/** Dot-path keys into the catalogue, e.g. "vehicle.battery". */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<TranslationShape>;

type I18nContextValue = {
  language: Language;
  isRTL: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /**
   * Direction-aware helper. Returns `start` in LTR and `end` in RTL, so layouts
   * can mirror without hard-coding left/right anywhere.
   */
  dir: <T>(ltr: T, rtl: T) => T;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const resolve = (catalogue: unknown, key: string): string => {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalogue);
  return typeof value === 'string' ? value : key;
};

export const I18nProvider = ({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) => {
  const isRTL = language === 'ar';

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = resolve(catalogues[language], key);
      if (vars) {
        Object.entries(vars).forEach(([name, value]) => {
          text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
        });
      }
      return text;
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      isRTL,
      t,
      dir: (ltr, rtl) => (isRTL ? rtl : ltr),
    }),
    [language, isRTL, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
};

/**
 * RTL strategy.
 *
 * `I18nManager.forceRTL` on React Native requires a native reload to fully take
 * effect, which would break a live demo mid-presentation. So the app mirrors
 * layout in JS instead: every directional style goes through `useI18n().dir()`
 * or the `writingDirection`/`flexDirection` helpers below, and text alignment
 * follows the active language immediately with no restart.
 */
export const allowNativeRTL = () => {
  I18nManager.allowRTL(true);
};

export const textAlignFor = (isRTL: boolean) => (isRTL ? ('right' as const) : ('left' as const));
export const rowDirectionFor = (isRTL: boolean) =>
  isRTL ? ('row-reverse' as const) : ('row' as const);
export const writingDirectionFor = (isRTL: boolean) =>
  isRTL ? ('rtl' as const) : ('ltr' as const);

export * from './translations';
