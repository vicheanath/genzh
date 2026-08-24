/**
 * The emoji this app offers, in one place.
 *
 * Shared by the reaction picker and the composer rather than listed twice:
 * they are the same set by intent — what a room reaches for — and two copies
 * would drift the moment one of them gained a face.
 *
 * Small on purpose. A searchable thousand-emoji grid is a different feature.
 */

/** Offered in a message's hover bar without opening the picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂']

/** The picker's full set. */
export const EMOJI = [
  '👍', '👎', '❤️', '🔥', '😂', '🥲', '😮', '😢',
  '🎉', '👀', '🙏', '💯', '✅', '❌', '🤔', '🤝',
  '😎', '🫡', '🧠', '⚡', '🌙', '☕', '🍕', '🎧',
]
