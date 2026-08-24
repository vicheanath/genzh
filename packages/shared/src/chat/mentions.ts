import type { PublicProfile, Uuid } from '../api/types'

/**
 * The `@mention` grammar, shared by the composer's autocomplete.
 *
 * It has to agree with `genzh_domain::mention` on the server, which is what
 * actually decides who gets notified: a picker that offered completions the
 * parser would not recognise would insert text that silently notifies nobody.
 * So the same three rules are enforced here — an `@` may only begin a word,
 * a handle is `[a-z0-9_.]`, and a trailing `.` is not part of it.
 */

/** Characters a handle is made of. */
const HANDLE_CHAR = /[a-z0-9_.]/i

/**
 * A completed mention inside message text.
 *
 * `(^|[^\w.])` is the server's "must begin a word" rule, which keeps
 * `a@b.com` from being a mention, and the trailing `[a-z0-9_]` stops a
 * sentence-final dot being captured. Shared by the transcript, which
 * highlights these, and by the composer, which counts them — two readings of
 * the same text that must not disagree.
 */
export const MENTION = /(^|[^\w.])@([a-z0-9_.]*[a-z0-9_])/gi

/**
 * Every distinct handle a message names, lower-cased, `everyone` included.
 *
 * Deduplicated like the server's parser: writing "@ana @ana" mentions Ana
 * once, and is not twice as much of a mention flood.
 */
export function parseMentions(content: string): string[] {
  const found = new Set<string>()
  for (const match of content.matchAll(MENTION)) {
    const handle = match[2]
    if (handle) found.add(handle.toLowerCase())
  }
  return [...found]
}

/**
 * How far back from the caret to look for the opening `@`.
 *
 * Handles are short, and without a ceiling every keystroke in a long paragraph
 * of unbroken handle characters would rescan it.
 */
const MAX_QUERY = 32

/** The special mention that addresses the whole room. */
export const EVERYONE = 'everyone'

/** A person (or `@everyone`) the composer can complete to. */
export interface MentionCandidate {
  /** The user's id, or `everyone` for the room-wide mention. */
  key: string
  /** What gets typed after the `@`. Always lower-case, as handles are stored. */
  handle: string
  /** What the row shows: a nickname, a display name, or "Everyone". */
  name: string
  /** Secondary line — a nickname's underlying display name, or the blurb. */
  detail?: string
  avatarUrl?: string | null
  accent?: string | null
  online?: boolean
  /** `@everyone` is drawn differently: it is a broadcast, not a person. */
  everyone?: boolean
}

/** The `@…` run the caret is sitting in. */
export interface MentionQuery {
  /** Index of the `@` itself. */
  start: number
  /** Index just past the last typed character — the caret. */
  end: number
  /** What has been typed after the `@`, possibly empty. */
  text: string
}

/**
 * The mention being typed at `caret`, if any.
 *
 * Scans backwards over handle characters to the nearest `@`, then applies the
 * server's "must begin a word" rule so `name@example.com` never opens the
 * picker mid-address.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  for (let index = caret; index > 0 && caret - index <= MAX_QUERY; index--) {
    const char = text[index - 1] ?? ''

    if (char === '@') {
      const before = index >= 2 ? text[index - 2] : undefined
      if (before !== undefined && HANDLE_CHAR.test(before)) return null
      return { start: index - 1, end: caret, text: text.slice(index, caret) }
    }

    if (!HANDLE_CHAR.test(char)) return null
  }

  return null
}

/**
 * Candidates that match `query`, best first, capped at `limit`.
 *
 * Ranked rather than merely filtered: with a room of a hundred people, typing
 * `an` should put `@ana` above `@brian`, and a prefix of the handle you are
 * actually typing should beat a substring buried in someone's display name.
 * Online members win ties — they are the ones who can answer.
 */
export function rankCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 8,
): MentionCandidate[] {
  const needle = query.toLowerCase()

  const scored: Array<{ candidate: MentionCandidate; score: number }> = []

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, needle)
    if (score === null) continue
    scored.push({ candidate, score })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    // `?? false` matters: `Number(undefined)` is NaN, and a NaN comparator
    // silently drops the tiebreak instead of ordering anything.
    const presence = Number(b.candidate.online ?? false) - Number(a.candidate.online ?? false)
    if (presence !== 0) return presence
    return a.candidate.name.localeCompare(b.candidate.name)
  })

  return scored.slice(0, limit).map((entry) => entry.candidate)
}

/** Lower is better; `null` means "does not match at all". */
function scoreCandidate(candidate: MentionCandidate, needle: string): number | null {
  if (needle === '') return candidate.everyone ? 0 : 1

  const handle = candidate.handle.toLowerCase()
  const name = candidate.name.toLowerCase()

  if (handle.startsWith(needle)) return 0
  // A word start inside the name — "de" should find "Ana **De**lgado", which a
  // plain `startsWith` on the whole string would miss.
  if (name.split(/\s+/).some((word) => word.startsWith(needle))) return 1
  if (handle.includes(needle)) return 2
  if (name.includes(needle)) return 3

  return null
}

/**
 * Replace the `@…` run with a completed mention.
 *
 * Returns the new text and where the caret belongs, because the two have to be
 * applied together — setting the value alone drops the caret to the end of the
 * message, which is wrong for a mention typed mid-sentence.
 */
export function applyMention(
  text: string,
  query: MentionQuery,
  handle: string,
): { text: string; caret: number } {
  // The trailing space is what lets you keep typing, and it also terminates the
  // handle for the parser. Not added twice if one is already there — but the
  // caret still steps over that existing space, or the next keystroke would
  // land inside the handle and un-mention the person.
  const spaced = text[query.end] === ' '
  const inserted = `@${handle}${spaced ? '' : ' '}`

  return {
    text: text.slice(0, query.start) + inserted + text.slice(query.end),
    caret: query.start + inserted.length + (spaced ? 1 : 0),
  }
}

/** A room member, as the candidate list sees them before profiles resolve. */
export interface MentionMember {
  userId: Uuid
  nickname?: string | null
}

/** Build one candidate from a member and whatever is known about them. */
export function toCandidate(
  member: MentionMember,
  profile: PublicProfile | null,
  online: boolean,
): MentionCandidate | null {
  // A member whose profile has not arrived yet has no handle to insert, so
  // offering the row would complete to nothing.
  if (!profile) return null

  const name = member.nickname ?? profile.display_name

  return {
    key: profile.id,
    handle: profile.handle,
    name,
    detail: name === profile.display_name ? undefined : profile.display_name,
    avatarUrl: profile.avatar_url,
    accent: profile.accent_color,
    online,
  }
}

/** The room-wide broadcast, offered alongside the people. */
export const EVERYONE_CANDIDATE: MentionCandidate = {
  key: EVERYONE,
  handle: EVERYONE,
  name: 'everyone',
  detail: 'Notify everyone in this room',
  everyone: true,
}
