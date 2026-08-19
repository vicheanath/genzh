import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Callout.module.css'

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'danger'
  children: ReactNode
}) {
  return (
    <div className={cx(styles.callout, styles[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      {children}
    </div>
  )
}

/** Shown where a list would be, when the list is empty. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>
}
