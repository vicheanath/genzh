import type { CSSProperties } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { animationClass, glyphOf, safeAsset, safePaint } from './sanitizers'

export interface CosmeticBadgeProps {
  item: StoreItem | null | undefined
  className?: string
}

export function CosmeticBadge({ item, className }: CosmeticBadgeProps) {
  if (!item) return null
  return (
    <span className={cx(styles.badge, className)} title={item.name}>
      <BadgeArt item={item} />
    </span>
  )
}

export function BadgeArt({ item }: { item: StoreItem }) {
  const asset = safeAsset(item.asset_url)
  const glow = safePaint(item.style_config?.glow)
  const animation = animationClass(item.style_config)
  const style = { '--badge-glow': glow ?? 'transparent' } as CSSProperties

  if (asset) {
    return (
      <img src={asset} alt="" className={cx(styles.badgeImage, animation)} style={style} />
    )
  }

  const glyph = glyphOf(item.style_config)
  return (
    <span className={animation} style={style} aria-hidden>
      {glyph ?? '●'}
    </span>
  )
}
