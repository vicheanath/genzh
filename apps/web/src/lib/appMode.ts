import { useLocation } from 'react-router-dom'

/**
 * Which half of the product a URL belongs to.
 *
 * The two are not features of one app that happen to sit on different screens.
 * They are opposite promises:
 *
 * - `playground` — rooms you drop into and leave. Nothing there is yours, none
 *   of it is still around tomorrow, and the surface is a column of moments.
 * - `servers` — communities you belong to. Channels, roles, history, people who
 *   are still there next week.
 *
 * Derived from the route rather than stored, unlike the phone app, which has to
 * keep it because a tab bar has no address. On the web the URL already says
 * which half you are in — and a stored mode that disagreed with the address
 * would make a shared link open the wrong shell.
 */
export type AppMode = 'playground' | 'servers'

/** Where each mode's front door is. */
export const MODE_HOME: Record<AppMode, string> = {
  playground: '/',
  servers: '/servers',
}

/** What each mode is called and promises, for the switch control. */
export const MODE_COPY: Record<AppMode, { label: string; tagline: string }> = {
  playground: { label: 'Playground', tagline: 'Rooms you leave' },
  servers: { label: 'Servers', tagline: 'Places you stay' },
}

/**
 * Paths that belong to the playground, longest-prefix first.
 *
 * Everything else in the signed-in shell is the community side, which is the
 * safer default: the servers shell is the full one, so a route this list has
 * not heard of renders with its navigation rather than without it.
 */
const PLAYGROUND_PREFIXES = ['/browse', '/rooms/']

export function modeForPath(pathname: string): AppMode {
  if (pathname === '/') return 'playground'
  return PLAYGROUND_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ? 'playground'
    : 'servers'
}

export function useAppMode(): {
  mode: AppMode
  other: AppMode
  /** Where the switch goes. */
  otherHome: string
} {
  const { pathname } = useLocation()
  const mode = modeForPath(pathname)
  const other: AppMode = mode === 'playground' ? 'servers' : 'playground'

  return { mode, other, otherHome: MODE_HOME[other] }
}
