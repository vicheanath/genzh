/**
 * Recognising a GIF a message is carrying.
 *
 * Sending a GIF posts its URL as the message body — there is no attachment
 * column, no upload, and nothing to migrate. That choice is what makes this
 * module necessary: a client has to decide whether a message is a link
 * somebody typed or a picture somebody picked, and it has only the text.
 *
 * The rule is deliberately narrow. A message counts as a GIF *only* when its
 * entire body is one URL from a host on the list below. A URL with a sentence
 * around it stays a link, because inlining an image into someone's sentence
 * changes what they wrote.
 */

/**
 * Hosts whose images are rendered inline.
 *
 * An allowlist, not a file-extension check, and that is the security boundary:
 * without it any member could make every other member's browser issue a request
 * to a server of their choosing simply by posting a link — which leaks IP
 * addresses, and is the classic way a chat room is turned into a tracker.
 *
 * Matched against the *whole* host or a dot-suffix of it, so
 * `media.tenor.com` matches `tenor.com` while `tenor.com.evil.test` does not.
 */
const GIF_HOSTS: readonly string[] = [
  // What the picker posts. GIPHY serves images from `media0.giphy.com` through
  // `media4.giphy.com` and `i.giphy.com`, all of which the dot-suffix covers.
  'giphy.com',
  // Kept although nothing produces them any more: these are links people paste
  // by hand, and a message that rendered as a picture yesterday should not
  // become a bare URL today because the picker changed provider.
  'tenor.com',
  'gfycat.com',
]

/** A GIF a message resolved to. */
export interface GifEmbed {
  /** The image to draw. */
  url: string
  /** Which host it came from, for the attribution the picker owes GIPHY. */
  host: string
}

/** Whether `host` is the allowlisted domain `allowed`, or a subdomain of it. */
function hostMatches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`)
}

/**
 * The GIF this message *is*, or `null` if it is anything else.
 *
 * `null` for a message with text around the link, for a non-GIF host, and for
 * anything that is not `https`. Every one of those stays ordinary text, which
 * is the safe default: the worst outcome is a link that was not inlined.
 */
export function gifEmbedOf(content: string): GifEmbed | null {
  const trimmed = content.trim()

  // One token, no spaces: the whole message has to be the URL.
  if (!trimmed || /\s/.test(trimmed)) return null
  if (!trimmed.toLowerCase().startsWith('https://')) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  const allowed = GIF_HOSTS.find((candidate) => hostMatches(host, candidate))
  if (!allowed) return null

  return { url: trimmed, host }
}

/** Whether this message body should render as a GIF rather than as text. */
export function isGifMessage(content: string): boolean {
  return gifEmbedOf(content) !== null
}
