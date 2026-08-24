import { MonitorIcon, MoonIcon, SunIcon } from '@/components/Icons'
import { Radio, RadioGroup } from '@/components/RadioGroup'
import { useTheme, type Theme } from '@/lib/useTheme'

import styles from './settings.module.css'

const THEMES: ReadonlyArray<{
  value: Theme
  label: string
  hint: string
  icon: typeof SunIcon
}> = [
  { value: 'dark', label: 'Dark', hint: 'Low light, warm espresso ground', icon: MoonIcon },
  { value: 'light', label: 'Light', hint: 'Bright, warm bone ground', icon: SunIcon },
  { value: 'system', label: 'System', hint: 'Follow your OS setting', icon: MonitorIcon },
]

export function AppearanceTab() {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <h2 className={styles.panelTitle}>Appearance</h2>
      <p className={styles.panelDescription}>How genzh looks on this device.</p>

      {/*
        This was three `role="radio"` buttons with `aria-checked`, which looks
        right in the accessibility tree and behaves wrongly: each button was its
        own tab stop and neither arrow key did anything, so a keyboard user
        could reach every option and select none of them. A real radio group is
        one tab stop that arrow keys move through.
      */}
      <RadioGroup
        variant="cards"
        aria-label="Theme"
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
