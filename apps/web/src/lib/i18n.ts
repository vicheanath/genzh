/**
 * i18n configuration for the web app.
 *
 * Two namespaces are supported today:
 *   - `common`  – shared strings (nav, auth, settings, generic UI)
 *
 * Translations live as static JSON in `src/locales/<lang>/<ns>.json` and are
 * imported directly so Vite tree-shakes them into the bundle rather than
 * requiring a runtime HTTP fetch.  Adding a new language means adding a JSON
 * file and a case in the `resources` map below — nothing else.
 *
 * Language detection order (first match wins):
 *   1. The value stored in `localStorage` under `locale` (set by the language
 *      picker in Settings).
 *   2. The user's browser language (`navigator.language`).
 *   3. The `html[lang]` attribute.
 *   4. Falls back to `'en'` when nothing matches a supported locale.
 */

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enCommon from '../locales/en/common.json'
import kmCommon from '../locales/km/common.json'

export const SUPPORTED_LOCALES = ['en', 'km'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_STORAGE_KEY = 'locale'

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  km: 'ភាសាខ្មែរ (Khmer)',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Supported resources — add a new locale here and in src/locales/.
    resources: {
      en: { common: enCommon },
      km: { common: kmCommon },
    },

    // The default namespace so callers can write `t('common:key')` or the
    // shorter `t('key')` when the ns is omitted.
    defaultNS: 'common',
    ns: ['common'],

    // Language detection: localStorage key first, then browser language.
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },

    // Supported languages; unknown locales fall back to 'en'.
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: 'en',

    interpolation: {
      // React already escapes values before injecting them into the DOM.
      escapeValue: false,
    },
  })

export { i18n }
