import { useState } from 'react'

import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import type { CurrentUser } from '@/lib/api'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'

import { PRESET_COLORS } from './tabs'
import styles from './settings.module.css'

const RANDOM_ALIASES = [
  'Shadow Fox',
  'Neon Phantom',
  'Cyber Panda',
  'Midnight Owl',
  'Pixel Knight',
  'Cosmic Voyager',
  'Stealth Tiger',
  'Quantum Hawk',
  'Nebula Dragon',
  'Mystic Wolf',
  'Astral Lynx',
  'Echo Viper',
  'Solar Falcon',
  'Zero Spectrum',
]

const MASK_SYMBOLS = ['🎭', '🕶️', '🦊', '👻', '🤖', '🦉', '🐺', '🐼', '⚡', '🔮', '👾', '🛸']

export function AnonymousTab({ user }: { user: CurrentUser }) {
  const toast = useToast()

  const anonymousAlias = useAppStore((s) => s.anonymousAlias)
  const anonymousAccent = useAppStore((s) => s.anonymousAccent)
  const anonymousAvatarSeed = useAppStore((s) => s.anonymousAvatarSeed)
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault)
  const setAnonymousSettings = useAppStore((s) => s.setAnonymousSettings)

  // Draft state: the persona is only committed on save, so abandoning the tab
  // leaves the stored identity untouched.
  const [alias, setAlias] = useState(anonymousAlias)
  const [accent, setAccent] = useState(anonymousAccent)
  const [symbol, setSymbol] = useState(anonymousAvatarSeed)
  const [byDefault, setByDefault] = useState(isAnonymousByDefault)

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setAnonymousSettings({
      alias: alias.trim() || 'Anonymous Phantom',
      accent,
      avatarSeed: symbol,
      isAnonymousByDefault: byDefault,
    })
    toast.success('Anonymous persona saved', 'Your masked identity is ready for rooms.')
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>Anonymous persona</h2>
      <p className={styles.panelDescription}>
        Your masked alias, icon, and default posting state. Your real account stays private
        behind it.
      </p>

      <div className={styles.toggleCard}>
        <div className={styles.toggleInfo}>
          <div className={styles.toggleTitle}>Post anonymously by default</div>
          <div className={styles.toggleSubtitle}>
            In rooms that permit anonymity, start in your masked persona rather than as
            yourself.
          </div>
        </div>
        <Switch
          checked={byDefault}
          onCheckedChange={setByDefault}
          aria-label="Post anonymously by default"
        />
      </div>

      <div className={styles.profilePreviewCard}>
        <div
          className={styles.previewBanner}
          style={{ '--banner-color': accent } as React.CSSProperties}
        />
        <div className={styles.previewBody}>
          <div className={styles.previewAvatarWrap}>
            <div className={styles.maskAvatar} style={{ backgroundColor: accent }}>
              {symbol}
            </div>
          </div>
          <div className={styles.previewName}>{alias || 'Anonymous Persona'}</div>
          <div className={styles.previewHandle}>Masked persona · hidden profile</div>
          <div className={styles.previewBio}>
            Your handle (@{user.handle}) and avatar are hidden from others while you speak
            under this persona.
          </div>
        </div>
      </div>

      <form className={styles.formGrid} onSubmit={handleSave}>
        <div>
          <div className={styles.labelRow}>
            <span className={styles.fieldLabel}>Alias</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setAlias(
                  RANDOM_ALIASES[Math.floor(Math.random() * RANDOM_ALIASES.length)] ??
                    'Shadow Fox',
                )
              }
            >
              Randomise
            </Button>
          </div>
          <Input
            label="Anonymous alias"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="e.g. Shadow Fox"
            maxLength={32}
            required
          />
        </div>

        <div>
          <span className={styles.fieldLabel}>Mask</span>
          <div className={styles.anonSymbolChips}>
            {MASK_SYMBOLS.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(
                  styles.anonSymbolChip,
                  symbol === option && styles.anonSymbolChipActive,
                )}
                onClick={() => setSymbol(option)}
                aria-label={`Mask ${option}`}
                aria-pressed={symbol === option}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={styles.fieldLabel}>Persona accent colour</span>
          <div className={styles.colorSwatches}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cx(
                  styles.colorSwatch,
                  accent === color && styles.colorSwatchActive,
                )}
                style={{ backgroundColor: color }}
                onClick={() => setAccent(color)}
                aria-label={`Accent colour ${color}`}
                aria-pressed={accent === color}
              />
            ))}
            <Input
              label="Custom hex"
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              placeholder="#a855f7"
            />
          </div>
        </div>

        <div className={styles.formActions}>
          <Button type="submit">Save persona</Button>
        </div>
      </form>
    </div>
  )
}
