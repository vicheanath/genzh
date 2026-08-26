import type { CSSProperties } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { animationClass, paintOf, safeAsset, safePaint } from './sanitizers'

export interface CosmeticFrameProps {
  item: StoreItem | null | undefined
  className?: string
}

/**
 * Avatar frame layer with procedural multi-layered shaders:
 * ambient bloom glow, rotating specular glint, cyber corner reticles, and celestial star flares.
 */
export function CosmeticFrame({ item, className }: CosmeticFrameProps) {
  if (!item) return null

  const asset = safeAsset(item.asset_url)
  const animation = animationClass(item.style_config)

  if (asset) {
    return (
      <span className={cx(styles.frame, animation, className)} aria-hidden>
        <img src={asset} alt="" className={styles.frameImage} />
      </span>
    )
  }

  const paint = paintOf(item.style_config)
  const glow = safePaint(item.style_config?.glow)
  if (!paint && !glow) return null

  const isCyber =
    item.sku.includes('cyber') ||
    item.sku.includes('neon') ||
    item.style_config?.variant === 'cyber'
  const isCelestial =
    item.sku.includes('halo') ||
    item.sku.includes('gold') ||
    item.sku.includes('cosmic') ||
    item.rarity === 'legendary'

  return (
    <span className={cx(styles.frame, animation, className)} aria-hidden>
      <span className={styles.frameWrapper}>
        <span
          className={styles.frameBloom}
          style={{ '--frame-paint': paint ?? 'var(--color-accent)' } as CSSProperties}
        />
        <span
          className={styles.frameRing}
          style={
            {
              '--frame-paint': paint ?? 'var(--color-accent)',
              '--frame-glow': glow ?? 'transparent',
            } as CSSProperties
          }
        />
        <span className={styles.frameGlint} />
        {isCyber && <span className={styles.frameCyberAccents} />}
        {isCelestial && (
          <span className={styles.frameCelestialAccents}>
            <span className={styles.celestialOrb} />
            <span className={styles.celestialOrb} />
            <span className={styles.celestialOrb} />
            <span className={styles.celestialOrb} />
          </span>
        )}
      </span>
    </span>
  )
}
