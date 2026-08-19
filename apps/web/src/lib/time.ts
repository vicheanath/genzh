/**
 * Time formatting for the chat transcript.
 *
 * All of it is `Intl`-backed rather than hand-rolled, so a user in Phnom Penh
 * and one in Berlin each read their own locale's clock without the app knowing
 * anything about either.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** `14:32` — the timestamp beside a message. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `Today` / `Yesterday` / `Tue, 12 Aug` — the divider between message days. */
export function formatDayDivider(iso: string): string {
  const date = new Date(iso)
  const days = daysBetween(date, new Date())

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'

  return date.toLocaleDateString([], {
    weekday: days < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
    // Only name the year once it is not the current one; "12 Aug 2026" in
    // August 2026 is noise on every single divider.
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

/** `just now`, `4m ago`, `3h ago`, `2d ago` — for hover titles and lists. */
export function formatRelative(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`

  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** The full date and time, for a `title` attribute. */
export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** True when two timestamps fall on different local calendar days. */
export function isNewDay(previous: string, current: string): boolean {
  return new Date(previous).toDateString() !== new Date(current).toDateString()
}

/**
 * Whether two consecutive messages from the same author should be grouped.
 *
 * Five minutes is the window every chat product converges on: long enough that
 * a burst of typing stays one block, short enough that picking a conversation
 * back up after lunch gets its own header.
 */
export function withinGroupingWindow(previous: string, current: string): boolean {
  return new Date(current).getTime() - new Date(previous).getTime() < 5 * MINUTE
}

/** Whole calendar days between two dates, ignoring the time of day. */
function daysBetween(earlier: Date, later: Date): number {
  const a = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate())
  const b = new Date(later.getFullYear(), later.getMonth(), later.getDate())
  return Math.round((b.getTime() - a.getTime()) / DAY)
}
