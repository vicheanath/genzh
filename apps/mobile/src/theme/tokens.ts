import { DEFAULT_ACCENT, ACCENT_SWATCHES } from '@genzh/shared';

/**
 * Citrine Design Tokens for Mobile
 * Mirroring apps/web/src/styles/tokens.css
 *
 * Identity Rules:
 * 1. INK ON LIGHT: Primary buttons are Acid Lime (#bae310) with near-black ink text (#0f1202).
 * 2. WARM GROUND: Warm espresso & paper undertones, never cold slate.
 * 3. LIGHT IS DEPTH: Subtle border highlights and elevated slab surfaces.
 * 4. PILLS ON SLABS: Controls are full pills (radius 9999); cards are soft slabs (radius 18-24).
 *
 * ── Two palettes ────────────────────────────────────────────────────────────
 *
 * The web keeps light in `:root` and overrides it in a `prefers-color-scheme`
 * block; React Native has no cascade, so the same two sets are plain objects
 * with an identical key set, and `ThemeContext` picks one.
 *
 * The light values are the web's `:root` tokens converted from oklch to sRGB
 * hex — RN's colour parser has no oklch. The conversion is exact where the
 * colour is in gamut: the web's `oklch(0.855 0.205 122)` accent round-trips to
 * `#bae310`, which is the hex this file already used.
 *
 * Because the key sets match, `Palette` is derived from the dark object rather
 * than declared twice — a token added to one and forgotten in the other is a
 * type error rather than a colour that silently falls back.
 */

export type ThemeName = 'light' | 'dark';

export const DarkColors = {
  // Surfaces
  sunken: '#121210',
  bg: '#181815',
  surface: '#1f1f1b',
  surfaceRaised: '#262621',
  surfaceHover: '#2e2e27',
  surfaceActive: '#36362d',
  surfaceMuted: '#22221d',
  overlay: 'rgba(10, 10, 8, 0.62)',

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

/**
 * The shape every palette must fill.
 *
 * Derived from the dark object so the two can never drift apart: adding a
 * token to `DarkColors` makes `LightColors` fail to typecheck until it has one
 * too. `swatches` is the profile accent list rather than a UI colour, so it is
 * shared rather than themed.
 */
export type Palette = typeof DarkColors;

export const LightColors: Palette = {
  // Surfaces — warm bone and paper, per rule 2. Not white-on-grey.
  sunken: '#f1eee6',
  bg: '#faf7f1',
  surface: '#fffdfa',
  surfaceRaised: '#ffffff',
  surfaceHover: '#f7f2e9',
  surfaceActive: '#f1ebdf',
  surfaceMuted: '#f4f1e9',
  overlay: 'rgba(37, 30, 21, 0.42)',

  // Interactive washes — tinted toward the accent rather than grey, so a
  // pressed row feels connected to the identity instead of just darker.
  hover: 'rgba(149, 179, 56, 0.12)',
  active: 'rgba(142, 173, 32, 0.20)',

  // Typography — warm ink. Never a pure black, never a cool grey.
  text: '#231d15',
  textMuted: '#625b52',
  textSubtle: '#8c877e',
  textDim: '#a29e95',
  textInverted: '#fcfaf6',

  // Borders
  border: '#e3ded6',
  borderStrong: '#c7c2b6',
  borderSubtle: '#eeebe4',
  borderHover: '#d5d0c6',

  /*
   * Rule 1 is why `accent` does not change between the themes.
   *
   * The lime is the identity, and it carries near-black ink in both. What does
   * change is `accentText`: lime on a bone background fails contrast as a text
   * colour, so light mode drops to a deep olive for accent-coloured *text*
   * while the accent *fill* stays bright.
   */
  accent: DEFAULT_ACCENT,
  accentHover: '#add400',
  accentActive: '#a0c500',
  accentSubtle: 'rgba(186, 227, 16, 0.22)',
  accentSubtleHover: 'rgba(186, 227, 16, 0.34)',
  accentText: '#486a00',
  accentContrast: '#131806',

  live: '#00c0de',
  liveSubtle: 'rgba(0, 192, 222, 0.16)',
  mint: '#00c0de',

  danger: '#e22c3f',
  dangerHover: '#f1424e',
  dangerActive: '#cc1d34',
  dangerSubtle: 'rgba(226, 44, 63, 0.14)',
  success: '#27af57',
  successSubtle: 'rgba(39, 175, 87, 0.16)',
  warning: '#ef9a26',

  online: '#85d437',
  idle: '#f2ab35',
  dnd: '#ec3747',
  offline: '#a29e95',

  swatches: ACCENT_SWATCHES,
};

export const Palettes: Record<ThemeName, Palette> = {
  light: LightColors,
  dark: DarkColors,
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
 * and these presets carry the rest.
 *
 * The two sets are not the same shadow at different opacities. On a dark ground
 * a shadow is genuine black and can be heavy; on a bone ground the same shadow
 * reads as dirt, so light mode uses a warm brown at a fraction of the opacity —
 * which is exactly the split `tokens.css` makes between its two shadow blocks.
 */
export const DarkElevation = {
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
    shadowColor: DEFAULT_ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 8,
  },
  dangerGlow: {
    shadowColor: '#ff4d4f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
  },
};

export type ElevationSet = typeof DarkElevation;

const LIGHT_SHADOW = '#342d23';

export const LightElevation: ElevationSet = {
  sm: {
    shadowColor: LIGHT_SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: LIGHT_SHADOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: LIGHT_SHADOW,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 12,
  },
  bar: {
    shadowColor: LIGHT_SHADOW,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  accentGlow: {
    shadowColor: DEFAULT_ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 8,
  },
  dangerGlow: {
    shadowColor: '#e22c3f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const Elevations: Record<ThemeName, ElevationSet> = {
  light: LightElevation,
  dark: DarkElevation,
};

/**
 * The stage — the call viewport.
 *
 * The one screen that does not use the page palette, and the one that does not
 * change with the theme. A call is a place you entered: it keeps its own dark
 * ground in light mode too, which is what `--stage-*` does in tokens.css (the
 * stage tokens sit in `:root` and are *not* overridden in the dark block).
 * Video looks wrong on bone, and every other call app agrees.
 *
 * If the call screen needs a colour that is not here, add it here rather than
 * inlining a hex — that is how the last version ended up with four different
 * greens in it.
 */
export const Stage = {
  bg: '#141412',
  surface: '#20201c',
  surfaceRaised: '#2a2a24',
  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#f7f7f3',
  textSubtle: '#9b9b8f',
  textDim: 'rgba(255, 255, 255, 0.45)',

  /** A control on the stage: a light wash, not a filled surface. */
  control: 'rgba(255, 255, 255, 0.08)',
  controlPressed: 'rgba(255, 255, 255, 0.18)',

  /** Panels floating over the stage — the dock, a name tag on a video. */
  glass: 'rgba(23, 23, 20, 0.78)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',

  /* Two off-centre pools of colour behind the tiles — lime warm-side, cyan
     cold-side. The one thing that stops a dark grid reading flat. */
  auroraAccent: 'rgba(186, 227, 16, 0.13)',
  auroraLive: 'rgba(0, 210, 229, 0.14)',
} as const;

/**
 * The feed — the full-screen playground card.
 *
 * The second surface in the app that does not use the page palette, and a
 * sibling of `Stage` above rather than a copy of it. Both are grounds the theme
 * does not reach: a call keeps its own dark room, and a moment card paints a
 * gradient generated from the room's id. Text sits on that gradient, so it is
 * light in both themes and nothing here has a light variant.
 *
 * They are separate sets because they sit on different grounds. `Stage` is ink
 * on a flat near-black; this is ink on a *coloured* one, which is why the
 * scrims below are darker than the stage's washes — a translucent white chip
 * that reads fine on charcoal disappears over a saturated blue.
 *
 * The same rule as `Stage` applies, and this group exists because it was being
 * broken: the card inlined nine different whites and its own copy of the lime.
 * A colour the card needs goes here, not in a style sheet.
 */
export const Feed = {
  /** The bottom stop of every card gradient, and the ring behind a face. */
  ground: '#0d0d0b',

  ink: '#ffffff',
  inkStrong: 'rgba(255, 255, 255, 0.92)',
  inkMuted: 'rgba(255, 255, 255, 0.86)',
  inkSubtle: 'rgba(255, 255, 255, 0.78)',
  inkDim: 'rgba(255, 255, 255, 0.66)',

  /** A chip over the gradient: dark enough to read on any hue behind it. */
  scrim: 'rgba(12, 12, 10, 0.5)',
  scrimBorder: 'rgba(255, 255, 255, 0.18)',

  /** The one thing on a card allowed to shout — that people are in there. */
  live: DEFAULT_ACCENT,
  liveInk: '#0f1202',
} as const;
