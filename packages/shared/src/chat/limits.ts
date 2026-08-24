import { parseMentions } from './mentions'

/**
 * The caps the server enforces, mirrored so the composer can say so first.
 *
 * These are a courtesy, not the defence: `genzh_domain::spam` decides, and a
 * client that skipped these checks would simply be refused a moment later. The
 * point is *when* the person finds out — before they press Enter, not after
 * their message has vanished into a toast.
 *
 * Keep the numbers in step with `crates/domain/src/spam.rs`. Being stricter
 * here than the server would refuse messages the server would take; being
 * looser only costs a round trip.
 */

/** `spam::MAX_MENTIONS_PER_MESSAGE`. */
export const MAX_MENTIONS = 10

/** `spam::MAX_LINKS_PER_MESSAGE`. */
export const MAX_LINKS = 5

/** `message::MESSAGE_MAX_LEN`. */
export const MAX_LENGTH = 4000

/**
 * Why this draft would be refused, or `null` if it would not be.
 *
 * One string rather than a list: the composer has one line to say it in, and a
 * draft that breaks two rules at once is fixed one rule at a time anyway.
 */
export function contentProblem(content: string): string | null {
  const mentions = parseMentions(content).length
  if (mentions > MAX_MENTIONS) {
    return `That is ${mentions} mentions — at most ${MAX_MENTIONS} people can be named in one message.`
  }

  const links = countLinks(content)
  if (links > MAX_LINKS) {
    return `That is ${links} links — at most ${MAX_LINKS} fit in one message.`
  }

  return null
}

/** Links counted by scheme, the way the server counts them. */
function countLinks(content: string): number {
  return (content.toLowerCase().match(/https?:\/\//g) ?? []).length
}
