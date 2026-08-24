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
  accentText: '#bae310',
  accentContrast: '#0f1202', // Ink text for primary lime buttons

  // Live & Secondary Highlights
  live: '#00d2e5',
  liveSubtle: 'rgba(0, 210, 229, 0.16)',
  mint: '#00d2e5',

  // Status
  danger: '#ff4d4f',
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
