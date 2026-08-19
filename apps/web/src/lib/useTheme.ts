import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

function readStored(): Theme {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/**
 * Theme selection, persisted to localStorage.
 *
 * `system` removes the attribute entirely rather than resolving the OS
 * preference to a literal value. That matters: with the attribute absent the
 * `prefers-color-scheme` block in tokens.css takes over, so the page keeps
 * following the OS if the user changes it while the tab is open.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
      localStorage.removeItem(STORAGE_KEY)
    } else {
      root.setAttribute('data-theme', theme)
      localStorage.setItem(STORAGE_KEY, theme)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])

  return { theme, setTheme }
}
