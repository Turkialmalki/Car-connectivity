/**
 * Design tokens — charcoal automotive system.
 *
 * One dark identity: charcoal surfaces, off-white primary text, muted grey
 * secondary text, and colour used only to mean something — blue for primary
 * actions, green for charging, red for heat and faults. Photography of the
 * vehicle carries the visual weight, so the interface around it stays quiet.
 */

export const palette = {
  /** Page ground. */
  base: '#171819',
  /** Raised surface: rows, cards, sheets. */
  surface: '#202223',
  /** Grouped/inset surface: tracks, secondary controls, pressed states. */
  soft: '#2E3032',
  grouped: '#202223',
  inset: '#37393B',

  /** Hairline separators. */
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.16)',

  textPrimary: '#F2F2F0',
  textSecondary: '#9B9D9F',
  textTertiary: '#6E7072',
  /** Text on the blue action and on photography. */
  textInverse: '#FFFFFF',
  textInverseSecondary: 'rgba(255,255,255,0.7)',

  /** The immersive Controls ground — a touch deeper than the app. */
  charcoal: '#101112',
  charcoalSoft: '#1D1F20',
  charcoalLine: 'rgba(255,255,255,0.12)',
  /** Neutral matte behind the phone surface in a desktop browser. */
  desktopBackdrop: '#0B0C0D',

  /** Primary action. */
  blue: '#3E6AE1',
  blueDim: 'rgba(62,106,225,0.18)',
  climateBlue: '#3E6AE1',
  /** Charging and energy. */
  green: '#4CC15E',
  greenDim: 'rgba(76,193,94,0.18)',
  /** Heating, warnings and faults. */
  red: '#E5484D',
  redDim: 'rgba(229,72,77,0.18)',
  amber: '#E0A64B',
  amberDim: 'rgba(224,166,75,0.18)',

  /**
   * Legacy semantic aliases. Screens across the app speak these names; they
   * resolve into the charcoal system so nothing carries the old palette.
   */
  white: '#FFFFFF',
  electric: '#3E6AE1',
  electricDim: 'rgba(62,106,225,0.18)',
  desert: '#9B9D9F',
  desertDim: 'rgba(255,255,255,0.08)',
  success: '#4CC15E',
  successDim: 'rgba(76,193,94,0.18)',
  warning: '#E0A64B',
  warningDim: 'rgba(224,166,75,0.18)',
  critical: '#E5484D',
  criticalDim: 'rgba(229,72,77,0.18)',

  overlay: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.35)',
  transparent: 'transparent',
} as const;

export type PaletteKey = keyof typeof palette;

/** 8pt rhythm with 4pt half-steps. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  /** Standard horizontal page padding. */
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

/** Ordinary grouped surfaces stay at 8–12. Larger radii are for circles, the
 *  charge visualisation and genuine bottom sheets only. */
export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 12,
  xxl: 20,
  sheet: 24,
  pill: 999,
} as const;

/**
 * Type scale. Battery and temperature readouts get tabular figures so digits
 * do not jitter as telemetry updates.
 */
export const tabularNumbers = { fontVariant: ['tabular-nums'] } as const;

export const typography = {
  /** Reserved for rare hero numerals. */
  display: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '600' as const,
    letterSpacing: -1.8,
  },
  /** Target temperature. */
  numeric: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '600' as const,
    letterSpacing: -1.8,
  },
  numericSm: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.6,
  },
  /** Page titles. */
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, letterSpacing: -0.6 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.3 },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const, letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: 0 },
  /** Minimum readable size in this app. */
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0 },
  /** Technical/telemetry labels. */
  mono: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Minimal shadows: hierarchy comes from dividers and spacing. */
export const elevation = {
  none: {},
  low: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  high: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} as const;

/** Springs tuned to feel mechanical and settled, never bouncy. */
export const motion = {
  spring: { damping: 18, stiffness: 170, mass: 1 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  springSnappy: { damping: 16, stiffness: 260, mass: 0.9 },
  timingFast: 140,
  timing: 220,
  timingSlow: 360,
  ambient: 2600,
} as const;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH_TARGET = 44;
