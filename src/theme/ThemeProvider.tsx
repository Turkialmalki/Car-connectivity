import React, { createContext, useContext, useMemo } from 'react';
import { AccessibilityInfo, I18nManager } from 'react-native';
import { elevation, motion, palette, radius, spacing, typography } from './tokens';
import { useViewport } from './Viewport';

/**
 * One light identity for the whole product surface. Charcoal is not a second
 * theme — it is a deliberate material used by exactly two things: the bottom
 * navigation and the immersive Controls view.
 */
export type Theme = {
  colors: typeof palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  motion: typeof motion;
  isRTL: boolean;
  /** True when the OS asks for reduced motion; ambient loops are disabled. */
  reduceMotion: boolean;
  /** Layout breakpoint so small phones get tighter spacing. */
  compact: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // The app surface, not the browser window: `compact` must react to the phone
  // frame in a desktop preview, not to the desktop itself.
  const { width, height } = useViewport();
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  const value = useMemo<Theme>(
    () => ({
      colors: palette,
      spacing,
      radius,
      typography,
      elevation,
      motion,
      isRTL: I18nManager.isRTL,
      reduceMotion,
      compact: width < 380 || height < 700,
    }),
    [reduceMotion, width, height],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Theme => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};
