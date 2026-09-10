import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { I18nProvider, useI18n, type Language } from '@/i18n';
import { Row, Text } from '@/components/design-system';
import { en, ar } from '@/i18n/translations';

const renderWithLocale = (language: Language, ui: React.ReactElement) =>
  render(
    <ThemeProvider>
      <I18nProvider language={language}>{ui}</I18nProvider>
    </ThemeProvider>,
  );

/** Reads a key through the provider, so the assertion covers real lookup. */
const BatteryLabel = () => {
  const { t } = useI18n();
  return <Text>{t('vehicle.battery')}</Text>;
};

describe('Arabic RTL rendering', () => {
  it('renders Arabic copy when the locale is ar', () => {
    renderWithLocale('ar', <BatteryLabel />);
    expect(screen.getByText('البطارية')).toBeTruthy();
  });

  it('renders English copy when the locale is en', () => {
    renderWithLocale('en', <BatteryLabel />);
    expect(screen.getByText('Battery')).toBeTruthy();
  });

  it('right-aligns text and sets rtl writing direction in Arabic', () => {
    renderWithLocale('ar', <Text testID="probe">مرحبا</Text>);
    const style = screen.getByTestId('probe').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
    expect(flat.textAlign).toBe('right');
    expect(flat.writingDirection).toBe('rtl');
  });

  it('left-aligns text in English', () => {
    renderWithLocale('en', <Text testID="probe">Hello</Text>);
    const style = screen.getByTestId('probe').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
    expect(flat.textAlign).toBe('left');
    expect(flat.writingDirection).toBe('ltr');
  });

  it('mirrors horizontal stacks in Arabic', () => {
    // Every horizontal stack in the app goes through <Row>, so this single
    // assertion covers layout direction app-wide.
    renderWithLocale(
      'ar',
      <Row testID="row-probe">
        <Text>أ</Text>
      </Row>,
    );
    const style = screen.getByTestId('row-probe').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
    expect(flat.flexDirection).toBe('row-reverse');
  });

  it('keeps horizontal stacks in reading order in English', () => {
    renderWithLocale(
      'en',
      <Row testID="row-probe">
        <Text>A</Text>
      </Row>,
    );
    const style = screen.getByTestId('row-probe').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
    expect(flat.flexDirection).toBe('row');
  });

  it('keeps numeric readouts left-to-right even in Arabic', () => {
    // A range figure is not mirrored — "412 km" must not become "km 412".
    renderWithLocale(
      'ar',
      <Text testID="numeric" numeric>
        412
      </Text>,
    );
    const style = screen.getByTestId('numeric').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
    expect(flat.writingDirection).toBe('ltr');
    expect(flat.textAlign).toBe('left');
  });
});

describe('translation catalogue completeness', () => {
  /** Every English key must exist in Arabic, or a screen silently falls back. */
  const leafKeys = (obj: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [`${prefix}${key}`]
        : leafKeys(value as Record<string, unknown>, `${prefix}${key}.`),
    );

  it('has an Arabic value for every English key', () => {
    const englishKeys = leafKeys(en as unknown as Record<string, unknown>);
    const arabicKeys = leafKeys(ar as unknown as Record<string, unknown>);
    expect(arabicKeys.sort()).toEqual(englishKeys.sort());
  });

  it('has no empty translations', () => {
    const values = (obj: Record<string, unknown>): string[] =>
      Object.values(obj).flatMap((value) =>
        typeof value === 'string' ? [value] : values(value as Record<string, unknown>),
      );
    expect(values(ar as unknown as Record<string, unknown>).every((v) => v.trim().length > 0)).toBe(
      true,
    );
  });
});
