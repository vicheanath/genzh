import type { ReactNode } from 'react'

import { Skeleton } from '@/components/Skeleton'

import styles from './communitySettings.module.css'

/**
 * The list every panel ends in — roles, members, channels.
 *
 * Three panels drew the same stack of cards with three near-identical class
 * names and three different answers to "what if there is nothing here" (all of
 * them: draw nothing). One list, one empty state.
 */
export function PanelList({
  children,
  empty,
  emptyText,
}: {
  children: ReactNode
  empty: boolean
  emptyText: string
}) {
  if (empty) return <p className={styles.empty}>{emptyText}</p>
  return <ul className={styles.list}>{children}</ul>
}

/** Placeholder rows, so a slow fetch does not read as an empty server. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.list} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.listItem}>
          <Skeleton circle width="2rem" height="2rem" />
          <div className={styles.listText}>
            <Skeleton width="8rem" height="0.8rem" />
            <Skeleton width="12rem" height="0.7rem" />
          </div>
        </div>
      ))}
    </div>
  )
}
