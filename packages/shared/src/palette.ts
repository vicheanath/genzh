/**
 * The user-choosable accent palette.
 *
 * Three places used to carry their own list of swatches — profile settings,
 * the anonymous persona picker, and community roles — and they had drifted:
 * one was the Discord brand palette, one was a generic rainbow, one was a
 * subset of the old violet identity. A user could pick a colour for their
 * profile that did not exist as an option for their role.
 *
 * These are hex rather than `oklch()` because they round-trip through the API
 * and through `<input type="color">`, which speaks hex and nothing else. They
 * were generated from OKLCH though, which is why they read as one family: the
 * lightness sits in a narrow band (0.64–0.86) and the chroma is high across the
 * board, so no swatch looks muddy or washed out beside another, and none of
 * them fights the app's own accent.
 */

/** The app accent. A user who has expressed no preference gets this. */
export const DEFAULT_ACCENT = '#bae310'

export interface Swatch {
  value: string
  name: string
}

export const ACCENT_SWATCHES: ReadonlyArray<Swatch> = [
  { value: DEFAULT_ACCENT, name: 'Lime' },
  { value: '#00d2e5', name: 'Cyan' },
  { value: '#4886fe', name: 'Cobalt' },
  { value: '#a361fb', name: 'Violet' },
  { value: '#f24bba', name: 'Magenta' },
  { value: '#ff5f5b', name: 'Coral' },
  { value: '#ff8e29', name: 'Tangerine' },
  { value: '#f4c423', name: 'Gold' },
  { value: '#38d080', name: 'Jade' },
  { value: '#a89d8a', name: 'Slate' },
]

/** Just the values, for callers that render swatches and nothing else. */
export const ACCENT_COLORS: ReadonlyArray<string> = ACCENT_SWATCHES.map((s) => s.value)

/**
 * A stable hue for a name, as a bare number of degrees.
 *
 * Deterministic rather than random: the same handle gets the same hue in every
 * session and in every other user's browser, which is the whole point — an
 * unstable identity colour is worse than no identity colour.
 *
 * There were three copies of this — one in `Avatar`, one in `ExploreRoute`,
 * one in `CommunityRoute` — and two of them returned a bare number while the
 * third returned a whole `oklch()` string, so the same community could be one
 * hue on its own page and another in the directory listing it.
 *
 * Returned as degrees rather than a colour so the caller decides lightness and
 * chroma: an avatar needs a fill that ink or white can sit on, a banner needs
 * something far darker, and baking either choice in here forced the other one
 * to override it.
 */
export function hueFor(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 360
}
