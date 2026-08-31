/**
 * useLocale — reads and writes the current display language.
 *
 * The locale is stored server-side in the user's preferences so it follows
 * them across devices, with localStorage as the immediate / offline store
 * (i18next-browser-languagedetector already reads that key on startup).
 *
 * Side-effect: keeps `html[lang]` in sync so that `css :lang(km)` selectors
 * (the Khmer font overrides in tokens.css) activate automatically.
 *
 * Usage:
 *   const { locale, setLocale } = useLocale()
 *   setLocale('km')  // persists immediately; UI updates on next render
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from './i18n'

function readStoredLocale(): SupportedLocale {
  if (typeof localStorage === 'undefined') return 'en'
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  return (SUPPORTED_LOCALES as readonly string[]).includes(stored ?? '')
    ? (stored as SupportedLocale)
    : 'en'
}

export function useLocale() {
  const { i18n } = useTranslation()
  const [locale, setLocaleState] = useState<SupportedLocale>(readStoredLocale)

  // Keep html[lang] in sync so CSS :lang() selectors stay accurate.
  // Runs on mount (initial locale) and on every locale change.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      setLocaleState(next)
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
      document.documentElement.lang = next
      void i18n.changeLanguage(next)
    },
    [i18n],
  )

  return { locale, setLocale }
}
