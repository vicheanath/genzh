import { DEFAULT_ACCENT, ACCENT_SWATCHES } from '@genzh/shared';

/**
 * Citrine Design Tokens for Mobile
 * Mirroring apps/web/src/styles/tokens.css
 *
 * Identity Rules:
 * 1. INK ON LIGHT: Primary buttons are Acid Lime (#bae310) with near-black ink text (#0f1202).
 * 2. WARM GROUND: Warm espresso & paper undertones (#181815, #1f1f1b, #262621), never cold slate.
 * 3. LIGHT IS DEPTH: Subtle border highlights and elevated slab surfaces.
 * 4. PILLS ON SLABS: Controls are full pills (radius 9999); cards are soft slabs (radius 18-24).
 */

export const Colors = {
  // Surfaces
  sunken: '#121210',
  bg: '#181815',
  surface: '#1f1f1b',
  surfaceRaised: '#262621',
  surfaceHover: '#2e2e27',
  surfaceActive: '#36362d',
  surfaceMuted: '#22221d',

  // Interactive washes
  hover: 'rgba(255, 255, 255, 0.07)',
  active: 'rgba(186, 227, 16, 0.16)',

  // Typography
  text: '#f6f6f2',
  textMuted: '#c8c8bd',
  textSubtle: '#949488',
  textDim: '#68685e',
  textInverted: '#181815',

  // Borders
  border: '#33332a',
  borderStrong: '#4a4a3e',
  borderSubtle: '#262620',
  borderHover: '#424237',

  // Accent & Signatures
  accent: DEFAULT_ACCENT,
  accentHover: '#cbf018',
  accentActive: '#a6cc0b',
  accentSubtle: 'rgba(186, 227, 16, 0.16)',
  accentSubtleHover: 'rgba(186, 227, 16, 0.26)',
  accentText: '#bae310',
  accentContrast: '#0f1202', // Ink text for primary lime buttons

  // Live & Secondary Highlights
  live: '#00d2e5',
  liveSubtle: 'rgba(0, 210, 229, 0.16)',
  mint: '#00d2e5',

  // Status
  danger: '#ff4d4f',
  // Web reaches this with `filter: brightness(1.08)`; RN has no filter, so the
  // lit and pressed steps of the danger fill are named instead.
  dangerHover: '#ff6b6d',
  dangerActive: '#e8393b',
  dangerSubtle: 'rgba(255, 77, 79, 0.16)',
  success: '#52c41a',
  successSubtle: 'rgba(82, 196, 26, 0.16)',
  warning: '#faad14',

  // Presence
  online: '#bae310',
  idle: '#facc15',
  dnd: '#ff4d4f',
  offline: '#68685e',

  swatches: ACCENT_SWATCHES,
};

export const Radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  pill: 9999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/**
 * Elevation — rule 3, as far as React Native can carry it.
 *
 * The web pairs `--shadow-*` with `--edge-highlight`, an inset top line that
 * makes a surface look lit from above. RN has no inset shadow, so the highlight
 * is spent as a light `borderTopColor` where a component has a border to give,
 * and these presets carry the rest. Values are matched to the dark palette in
 * tokens.css, where a shadow is a genuine black rather than a warm tint.
 */
export const Elevation = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 12,
  },
  /** The bar sits *above* the page, so its shadow is thrown upward. */
  bar: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 16,
  },
  /** `--glow-accent`: "active" reads as a glow rather than a heavier fill. */
  accentGlow: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 8,
  },
  dangerGlow: {
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
