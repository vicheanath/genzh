import { Button } from '@/components/Button'
import {
  CosmeticBadge,
  CosmeticBanner,
  CosmeticName,
  CosmeticTitle,
  DecoratedAvatar,
} from '@/components/Cosmetics'
import { PaletteIcon } from '@/components/Icons'

import type { EquippedCosmetics, StoreItem } from '../api'

export interface OutfitStudioStageProps {
  displayName: string
  handle?: string
  avatarUrl?: string | null
  accentColor?: string | null
  previewLoadout: EquippedCosmetics
  studioWorn: {
    frame: StoreItem | null
    avatar_effect: StoreItem | null
    name_color: StoreItem | null
    name_font: StoreItem | null
    title: StoreItem | null
    badge: StoreItem | null
    chat_bubble: StoreItem | null
    banner: StoreItem | null
  }
  onRandomize: () => void
  onReset: () => void
}

/**
 * The primary stage preview showcasing the user's avatar, banner, name, and flairs in real-time.
 */
export function OutfitStudioStage({
  displayName,
  handle,
  avatarUrl,
  accentColor,
  previewLoadout,
  studioWorn,
  onRandomize,
  onReset,
}: OutfitStudioStageProps) {
  return (
    <section
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-lg, 1rem)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-md, 0 10px 30px rgba(0, 0, 0, 0.2))',
      }}
    >
      {/* Banner Backdrop */}
      <div style={{ width: '100%', height: '8.5rem', position: 'relative' }}>
        <CosmeticBanner item={studioWorn.banner} />
      </div>

      {/* Avatar & Identity Stage */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-5)',
          flexWrap: 'wrap',
          marginTop: '-3.5rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <DecoratedAvatar
          name={displayName}
          src={avatarUrl}
          size="xl"
          cosmetics={previewLoadout}
          showBadge
          style={{ boxShadow: '0 0 0 4px var(--color-surface), 0 8px 24px rgba(0,0,0,0.4)' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minWidth: '14rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 750 }}>
              <CosmeticName
                item={studioWorn.name_color}
                fontItem={studioWorn.name_font}
                fallbackColor={accentColor}
              >
                {displayName}
              </CosmeticName>
            </span>
            <CosmeticBadge item={studioWorn.badge} />
            {studioWorn.title && <CosmeticTitle item={studioWorn.title} />}
          </div>

          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {handle ? `@${handle} · ` : ''}Real-time Outfit Stage
          </span>
        </div>

        {/* Quick Stage Controls */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={onRandomize}>
            <PaletteIcon size={14} /> Randomize Look
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Reset to Current
          </Button>
        </div>
      </div>
    </section>
  )
}
