import { SparklesIcon } from '@/components/Icons'

import type { OutfitPreset } from './presets'
import { OUTFIT_PRESETS } from './presets'

export interface PresetThemesGridProps {
  onApplyPreset: (preset: OutfitPreset) => void
}

/**
 * Curated theme grid allowing 1-click application of complete aesthetic styles.
 */
export function PresetThemesGrid({ onApplyPreset }: PresetThemesGridProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <SparklesIcon size={16} /> Curated Theme Outfits
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {OUTFIT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              padding: 'var(--space-3)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md, 0.5rem)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'border-color var(--duration-fast), transform var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>
              {preset.emoji} {preset.name}
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              {preset.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
