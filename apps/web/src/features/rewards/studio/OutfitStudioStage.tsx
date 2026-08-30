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
import styles from '../rewards.module.css'

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
    <section className={styles.stageCard}>
      <div className={styles.stageBanner}>
        <CosmeticBanner item={studioWorn.banner} />
      </div>

      <div className={styles.stageIdentity}>
        <DecoratedAvatar
          name={displayName}
          src={avatarUrl}
          size="xl"
          cosmetics={previewLoadout}
          showBadge
          className={styles.stageAvatar}
        />

        <div className={styles.stageNameColumn}>
          <div className={styles.stageNameRow}>
            <span className={styles.stageDisplayName}>
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

          <span className={styles.stageHandle}>
            {handle ? `@${handle} · ` : ''}Real-time Outfit Stage
          </span>
        </div>

        <div className={styles.stageControls}>
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
