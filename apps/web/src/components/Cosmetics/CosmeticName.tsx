import type { CSSProperties, ReactNode } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { animationClass, paintOf, safePaint } from './sanitizers'

export interface CosmeticNameProps {
  children: ReactNode
  /** The name-colour item, if one is worn. */
  item?: StoreItem | null
  /** The name-font item, if one is worn. */
  fontItem?: StoreItem | null
  className?: string
  /** The accent to fall back to when nothing is worn. */
  fallbackColor?: string | null
}

/**
 * Display name renderer supporting custom Google typography, letter-spacing,
 * flowing animated color gradients, and multi-layer neon bloom.
 */
export function CosmeticName({
  children,
  item,
  fontItem,
  className,
  fallbackColor,
}: CosmeticNameProps) {
  const paint = item ? paintOf(item.style_config) : null
  const shadow = item ? safePaint(item.style_config?.textShadow) : null

  // Typography styling
  const fontFamily = safePaint(fontItem?.style_config?.fontFamily)
  const letterSpacing = safePaint(fontItem?.style_config?.letterSpacing)
  const textTransform = safePaint(fontItem?.style_config?.textTransform)
  const fontWeight = safePaint(fontItem?.style_config?.fontWeight)
  const fontStyle = safePaint(fontItem?.style_config?.fontStyle)

  const fontInline = {
    '--name-font-family': fontFamily ?? undefined,
    '--name-letter-spacing': letterSpacing ?? undefined,
    '--name-transform': textTransform ?? undefined,
    '--name-weight': fontWeight ?? undefined,
    '--name-style': fontStyle ?? undefined,
  } as CSSProperties

  if (!paint) {
    return (
      <span
        className={cx(styles.name, className)}
        style={
          {
            ...fontInline,
            '--name-flat': fallbackColor ?? undefined,
          } as CSSProperties
        }
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={cx(styles.name, styles.nameGradient, className, animationClass(item?.style_config))}
      style={
        {
          ...fontInline,
          '--name-paint': paint,
          '--name-flat': safePaint(item?.style_config?.color) ?? 'var(--color-text)',
          '--name-shadow': shadow ?? 'none',
        } as CSSProperties
      }
    >
      {children}
    </span>
  )
}
