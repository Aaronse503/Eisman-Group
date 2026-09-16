/**
 * Design tokens, in one place, for both applications.
 *
 * The web application turns these into CSS custom properties in globals.css;
 * the mobile application consumes them directly. Deep emerald navigation,
 * warm cream content, emerald and gold accents, and no dominant blue — blue
 * appears only as an informational status colour.
 */

export const palette = {
  emerald: {
    950: '#06281a',
    900: '#0a3a26',
    800: '#0f5132',
    700: '#14663f',
    600: '#1a7f4e',
    500: '#22a165',
    400: '#3fbd82',
    300: '#74d4a5',
    200: '#a9e5c6',
    100: '#d6f2e3',
    50: '#eefaf3',
  },
  gold: {
    900: '#6b5417',
    800: '#8c6f1f',
    700: '#ab8a2b',
    600: '#c8a951',
    500: '#d8bd72',
    400: '#e5d09a',
    300: '#eee0bd',
    200: '#f5ecd8',
    100: '#faf5e9',
  },
  cream: { 50: '#fdfcf9', 100: '#faf8f3', 200: '#f2efe7', 300: '#e7e2d6' },
  charcoal: {
    950: '#0c0e0d',
    900: '#131614',
    850: '#191d1b',
    800: '#202524',
    700: '#2c3331',
    600: '#3d4644',
    500: '#5a6360',
  },
} as const;

export interface ThemeColors {
  bg: string;
  bgSubtle: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  accentSoftFg: string;
  gold: string;
  goldSoft: string;
  navBg: string;
  navFg: string;
  navFgMuted: string;
  navActiveBg: string;
  navActiveFg: string;
  ring: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  neutral: string;
  neutralBg: string;
}

export const lightColors: ThemeColors = {
  bg: palette.cream[100],
  bgSubtle: palette.cream[200],
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSunken: palette.cream[200],
  border: '#e3ded2',
  borderStrong: '#cfc8b7',
  fg: '#1a1f1d',
  fgMuted: '#5f6b66',
  fgSubtle: '#87918c',
  accent: palette.emerald[800],
  accentFg: '#ffffff',
  accentSoft: palette.emerald[50],
  accentSoftFg: palette.emerald[800],
  gold: palette.gold[700],
  goldSoft: palette.gold[100],
  navBg: palette.emerald[950],
  navFg: '#d9e6df',
  navFgMuted: '#8fa89c',
  navActiveBg: 'rgba(255, 255, 255, 0.09)',
  navActiveFg: '#ffffff',
  ring: palette.emerald[600],
  success: '#17734a',
  successBg: '#e7f6ee',
  warning: '#8a5a10',
  warningBg: '#fdf1dd',
  danger: '#a32a26',
  dangerBg: '#fbeae9',
  info: '#2c5f73',
  infoBg: '#e6f1f5',
  neutral: '#5f6b66',
  neutralBg: '#f0ede5',
};

export const darkColors: ThemeColors = {
  bg: palette.charcoal[950],
  bgSubtle: palette.charcoal[900],
  surface: palette.charcoal[900],
  surfaceRaised: palette.charcoal[850],
  surfaceSunken: palette.charcoal[800],
  border: '#262d2a',
  borderStrong: '#38403d',
  fg: '#ecefed',
  fgMuted: '#9aa6a1',
  fgSubtle: '#6f7a76',
  accent: palette.emerald[500],
  accentFg: '#04150d',
  accentSoft: 'rgba(34, 161, 101, 0.14)',
  accentSoftFg: palette.emerald[300],
  gold: palette.gold[500],
  goldSoft: 'rgba(200, 169, 81, 0.14)',
  navBg: '#080b0a',
  navFg: '#c6d3cd',
  navFgMuted: '#7f8c87',
  navActiveBg: 'rgba(255, 255, 255, 0.08)',
  navActiveFg: '#ffffff',
  ring: palette.emerald[400],
  success: '#5fd39a',
  successBg: 'rgba(34, 161, 101, 0.16)',
  warning: '#e0b464',
  warningBg: 'rgba(200, 169, 81, 0.16)',
  danger: '#f28b86',
  dangerBg: 'rgba(200, 70, 62, 0.18)',
  info: '#86c0d4',
  infoBg: 'rgba(90, 150, 175, 0.16)',
  neutral: '#9aa6a1',
  neutralBg: 'rgba(255, 255, 255, 0.06)',
};

/** Spacing, in points. The mobile application uses these directly. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  card: 14,
  pill: 999,
} as const;

/**
 * The smallest a tappable control may be, in points. Both Apple and Google ask
 * for at least 44; nothing interactive in the mobile application is smaller.
 */
export const MIN_TOUCH_TARGET = 44;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
} as const;
