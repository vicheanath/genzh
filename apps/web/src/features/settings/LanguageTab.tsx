import { useTranslation } from 'react-i18next'

import { Radio, RadioGroup } from '@/components/RadioGroup'
import { useToast } from '@/components/Toast'
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/lib/i18n'
import { useLocale } from '@/lib/useLocale'

import styles from './settings.module.css'

export function LanguageTab() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const toast = useToast()

  function handleChange(next: SupportedLocale) {
    setLocale(next)
    toast.success(
      t('settings.language.saved'),
      t('settings.language.savedDescription', { language: LOCALE_LABELS[next] }),
    )
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>{t('settings.language.title')}</h2>
      <p className={styles.panelDescription}>{t('settings.language.description')}</p>

      <RadioGroup
        variant="cards"
        aria-label={t('settings.language.title')}
        value={locale}
        onValueChange={(value) => handleChange(value as SupportedLocale)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <Radio key={code} value={code} label={LOCALE_LABELS[code]} />
        ))}
      </RadioGroup>
    </div>
  )
}
