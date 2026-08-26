import type { CSSProperties, ReactNode } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'
import { safePaint } from './sanitizers'

export interface CosmeticChatBubbleProps {
  item: StoreItem | null | undefined
  children: ReactNode
  className?: string
}

/**
 * Custom chat message container with neon accent indicator,
 * frosted glass styling, and glowing borders.
 */
export function CosmeticChatBubble({
  item,
  children,
  className,
}: CosmeticChatBubbleProps) {
  if (!item) {
    return <div className={className}>{children}</div>
  }

  const bg = safePaint(item.style_config?.background) ?? safePaint(item.style_config?.gradient)
  const border = safePaint(item.style_config?.borderColor) ?? safePaint(item.style_config?.color)
  const glow = safePaint(item.style_config?.glow)

  return (
    <div
      className={cx(styles.chatBubble, className)}
      style={
        {
          '--bubble-bg': bg ?? undefined,
          '--bubble-border': border ?? undefined,
          '--bubble-glow': glow ?? undefined,
        } as CSSProperties
      }
    >
      <div className={styles.chatBubbleContent}>{children}</div>
    </div>
  )
}
