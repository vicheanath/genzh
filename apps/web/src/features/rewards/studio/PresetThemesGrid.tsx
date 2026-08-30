import { SparklesIcon } from '@/components/Icons'

import type { OutfitPreset } from './presets'
import { OUTFIT_PRESETS } from './presets'
import styles from '../rewards.module.css'

export interface PresetThemesGridProps {
  onApplyPreset: (preset: OutfitPreset) => void
}

/**
 * Curated theme grid allowing 1-click application of complete aesthetic styles.
 */
export function PresetThemesGrid({ onApplyPreset }: PresetThemesGridProps) {
  return (
    <section className={styles.sectionStack}>
      <h3 className={styles.panelTitle}>
        <SparklesIcon size={16} /> Curated Theme Outfits
      </h3>
      <div className={styles.presetGrid}>
        {OUTFIT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset)}
            className={styles.presetCard}
          >
            <span className={styles.presetName}>
              {preset.emoji} {preset.name}
            </span>
            <span className={styles.presetDescription}>{preset.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
