import { useTranslation } from 'react-i18next'

import { MonitorIcon, MoonIcon, SunIcon } from '@/components/Icons'
import { Radio, RadioGroup } from '@/components/RadioGroup'
import { useTheme, type Theme } from '@/lib/useTheme'

import styles from './settings.module.css'

export function AppearanceTab() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  const THEMES: ReadonlyArray<{
    value: Theme
    label: string
    hint: string
    icon: typeof SunIcon
  }> = [
    { value: 'dark', label: t('settings.appearance.themes.dark'), hint: t('settings.appearance.themes.darkHint'), icon: MoonIcon },
    { value: 'light', label: t('settings.appearance.themes.light'), hint: t('settings.appearance.themes.lightHint'), icon: SunIcon },
    { value: 'system', label: t('settings.appearance.themes.system'), hint: t('settings.appearance.themes.systemHint'), icon: MonitorIcon },
  ]

  return (
    <div>
      <h2 className={styles.panelTitle}>{t('settings.appearance.title')}</h2>
      <p className={styles.panelDescription}>{t('settings.appearance.description')}</p>

      {/*
        This was three `role="radio"` buttons with `aria-checked`, which looks
        right in the accessibility tree and behaves wrongly: each button was its
        own tab stop and neither arrow key did anything, so a keyboard user
        could reach every option and select none of them. A real radio group is
        one tab stop that arrow keys move through.
      */}
      <RadioGroup
        variant="cards"
        aria-label={t('settings.appearance.title')}
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
      >
        {THEMES.map(({ value, label, hint, icon: Icon }) => (
          <Radio key={value} value={value} label={label} hint={hint} icon={<Icon size={26} />} />
        ))}
      </RadioGroup>
    </div>
  )
}
