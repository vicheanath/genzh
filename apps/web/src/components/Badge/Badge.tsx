import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'mint'

/** A small inline label: a room type, a permission count, a live indicator. */
export function Badge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: BadgeTone
  /** Draws a leading dot — used where the badge means "right now". */
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  )
}
