import type { CustomEmoji } from '../api/types'

/**
 * Drawing `:shortcode:` glyphs inside message text.
 *
 * This is the client half of a rule the server also enforces, in
 * `genzh_domain::emoji`. The two must agree about what a shortcode *is*: the
 * server refuses to store a name this scanner would not find, so a glyph that
 * exists is always one that renders. Any change here needs the same change
 * there — the Rust file says so too.
 *
 * The rules, in full:
 *   - a shortcode is `:` + 2–32 of `[A-Za-z0-9_]` + `:`
 *   - it is matched case-insensitively and resolved lower-case
 *   - an all-digit run is never a shortcode, which is what keeps `12:30:45`
 *     from becoming artwork
 *   - the `:` that closes one shortcode may open the next, so `:a::b:` is two
 */

/** Mirrors `EMOJI_NAME_MIN_LEN`. */
export const EMOJI_NAME_MIN_LEN = 2
/** Mirrors `EMOJI_NAME_MAX_LEN`. */
export const EMOJI_NAME_MAX_LEN = 32

/** A community's emoji, indexed by the name a shortcode carries. */
export type EmojiIndex = ReadonlyMap<string, CustomEmoji>

/** Build the lookup a renderer needs from the list the API returns. */
export function indexEmoji(emoji: readonly CustomEmoji[]): EmojiIndex {
  return new Map(emoji.map((entry) => [entry.name, entry]))
}

/**
 * One piece of a message body: either text to print, or a glyph to draw.
 *
 * Segments rather than HTML, because the three renderers that need this draw
 * very different things — a `<span>` on the web, an `<Image>` on React Native,
 * a plain-text fallback in a notification — and none of them should have to
 * parse a string a second time to find out what it holds.
 */
export type EmojiSegment =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; emoji: CustomEmoji; shortcode: string }

/** Whether `char` may appear inside a shortcode name. */
function isNameChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char)
}

/**
 * Every distinct shortcode named in `content`, lower-cased.
 *
 * Deduplicated, like the mention parser: writing the same glyph twice uses it
 * once. Resolution against a community's set is a separate question — this
 * only answers "what does this text *claim* are shortcodes".
 */
export function parseShortcodes(content: string): string[] {
  const found: string[] = []

  for (let index = 0; index < content.length; index++) {
    if (content[index] !== ':') continue

    const start = index + 1
    let end = start
    while (
      end < content.length &&
      isNameChar(content[end]!) &&
      end - start < EMOJI_NAME_MAX_LEN
    ) {
      end++
    }

    const candidate = content.slice(start, end)
    if (
      content[end] === ':' &&
      candidate.length >= EMOJI_NAME_MIN_LEN &&
      !/^\d+$/.test(candidate)
    ) {
      const name = candidate.toLowerCase()
      if (!found.includes(name)) found.push(name)
      // Resume *at* the closing colon: it may open the next shortcode.
      index = end - 1
    }
  }

  return found
}

/**
 * Split `content` into text and the glyphs it resolves to.
 *
 * A shortcode with no matching emoji stays text, deliberately: it is what the
 * author typed, and a community that removes an emoji should leave old
 * messages reading `:blob:` rather than showing a broken image. Text segments
 * are merged as they are produced, so a caller never receives two adjacent
 * ones to join.
 */
export function splitEmoji(content: string, index: EmojiIndex): EmojiSegment[] {
  // Nothing to resolve against — skip the scan entirely. This is the common
  // case for direct messages, which have no community and so no glyphs.
  if (index.size === 0) return content ? [{ kind: 'text', text: content }] : []

  const segments: EmojiSegment[] = []
  let cursor = 0

  const pushText = (text: string) => {
    if (!text) return
    const last = segments[segments.length - 1]
    if (last?.kind === 'text') last.text += text
    else segments.push({ kind: 'text', text })
  }

  for (let position = 0; position < content.length; position++) {
    if (content[position] !== ':') continue

    const start = position + 1
    let end = start
    while (
      end < content.length &&
      isNameChar(content[end]!) &&
      end - start < EMOJI_NAME_MAX_LEN
    ) {
      end++
    }

    const candidate = content.slice(start, end)
    if (
      content[end] !== ':' ||
      candidate.length < EMOJI_NAME_MIN_LEN ||
      /^\d+$/.test(candidate)
    ) {
      continue
    }

    const emoji = index.get(candidate.toLowerCase())
    if (!emoji) continue

    pushText(content.slice(cursor, position))
    segments.push({ kind: 'emoji', emoji, shortcode: content.slice(position, end + 1) })

    cursor = end + 1
    // `end` is the closing colon, and the loop's own `position++` steps past
    // it — so a colon that closes one glyph can still open the next.
    position = end - 1
  }

  pushText(content.slice(cursor))
  return segments
}

/**
 * Whether a message is *only* custom emoji.
 *
 * Worth knowing because a message that is nothing but glyphs is drawn large,
 * the way a lone unicode emoji is in every chat product — it reads as a
 * gesture rather than as text.
 */
export function isEmojiOnly(segments: readonly EmojiSegment[]): boolean {
  return (
    segments.length > 0 &&
    segments.some((segment) => segment.kind === 'emoji') &&
    segments.every(
      (segment) => segment.kind === 'emoji' || segment.text.trim() === '',
    )
  )
}
