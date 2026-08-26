import type { CSSProperties } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { animationClass, paintOf, safeAsset, safePaint } from './sanitizers'

export interface CosmeticBannerProps {
  item: StoreItem | null | undefined
  className?: string
}

/**
 * Profile header banner supporting custom uploaded art, animated auroras,
 * synthwave horizons, and glowing gradients.
 */
export function CosmeticBanner({ item, className }: CosmeticBannerProps) {
  if (!item) return null

  const asset = safeAsset(item.asset_url)
  if (asset) {
    return <img src={asset} alt="" className={cx(styles.bannerImage, className)} />
  }

  const paint = paintOf(item.style_config) ?? safePaint(item.style_config?.background)
  if (!paint) return null

  return (
    <div
      className={cx(styles.banner, className, animationClass(item.style_config))}
      style={{ '--banner-paint': paint } as CSSProperties}
      aria-hidden
    />
  )
}
