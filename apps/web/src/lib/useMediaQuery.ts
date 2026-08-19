import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query from JavaScript.
 *
 * Layout belongs in CSS, and almost all of this app's responsiveness is there.
 * This exists for the cases CSS cannot express: the sidebar is a *drawer* on a
 * phone and a *column* on a desktop, which is a difference in which elements
 * exist, not in how they are painted.
 *
 * `useSyncExternalStore` rather than an effect: the match is external state, and
 * this reads it during render instead of painting once with the wrong answer.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot. There is no SSR here, but React calls this during
    // hydration checks and returning `false` keeps the desktop layout the
    // default rather than flashing the mobile one.
    () => false,
  )
}

/** The one breakpoint the app switches layout on. Matches the CSS. */
export const MOBILE_QUERY = '(max-width: 900px)'

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)
