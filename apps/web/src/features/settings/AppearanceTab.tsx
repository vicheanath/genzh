import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from '@/components/Icons'
import { cx } from '@/lib/cx'
import { useTheme, type Theme } from '@/lib/useTheme'

import styles from './settings.module.css'

const THEMES: ReadonlyArray<{
  value: Theme
  label: string
  hint: string
  icon: typeof SunIcon
}> = [
  { value: 'dark', label: 'Dark', hint: 'Low light, violet ground', icon: MoonIcon },
  { value: 'light', label: 'Light', hint: 'Bright, high contrast', icon: SunIcon },
  { value: 'system', label: 'System', hint: 'Follow your OS setting', icon: MonitorIcon },
]

export function AppearanceTab() {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <h2 className={styles.panelTitle}>Appearance</h2>
      <p className={styles.panelDescription}>How genzh looks on this device.</p>

      <div className={styles.themeCards} role="radiogroup" aria-label="Theme">
        {THEMES.map(({ value, label, hint, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={cx(styles.themeCard, theme === value && styles.themeCardActive)}
            onClick={() => setTheme(value)}
          >
            <Icon size={28} />
            <span className={styles.themeName}>{label}</span>
            <span className={styles.themeHint}>{hint}</span>
            {theme === value && <CheckIcon size={16} className={styles.themeCheck} />}
          </button>
        ))}
      </div>
    </div>
  )
}
