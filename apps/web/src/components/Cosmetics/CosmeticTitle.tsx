import type { CSSProperties } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { safePaint } from './sanitizers'

export interface CosmeticTitleProps {
  item: StoreItem | null | undefined
  className?: string
}

/**
 * Prestige title tag with frosted glass backdrop, moving light shimmer glint,
 * and glowing gradient borders.
 */
export function CosmeticTitle({ item, className }: CosmeticTitleProps) {
  if (!item) return null

  const text = (typeof item.style_config?.text === 'string' && item.style_config.text.trim()) || item.name
  const color = safePaint(item.style_config?.color)
  const bg = safePaint(item.style_config?.background)
  const border = safePaint(item.style_config?.borderColor)
  const glow = safePaint(item.style_config?.glow)
  const gradient = safePaint(item.style_config?.gradient)

  const inlineStyle = {
    '--title-color': color ?? undefined,
    '--title-bg': bg ?? undefined,
    '--title-border': border ?? undefined,
    '--title-glow': glow ?? undefined,
    '--title-gradient': gradient ?? undefined,
  } as CSSProperties

  return (
    <span
      className={cx(styles.titleTag, gradient && styles.titleTagGradient, className)}
      style={inlineStyle}
      title={`Prestige Title: ${item.name}`}
    >
      <span>{text}</span>
    </span>
  )
}
