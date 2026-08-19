import { cx } from '@/lib/cx'

import styles from './Skeleton.module.css'

export interface SkeletonProps {
  width?: string
  height?: string
  circle?: boolean
  className?: string
}

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * Preferred over a spinner wherever the layout is known in advance: the page
 * does not jump when the data lands, because the space was already the right
 * size. Spinners stay for actions, where there is no shape to promise.
 */
export function Skeleton({ width, height = '1rem', circle, className }: SkeletonProps) {
  return (
    <span
      className={cx(styles.skeleton, circle && styles.circle, className)}
      style={{ width, height }}
      aria-hidden
    />
  )
}

/** A stand-in for a list of rows — a sidebar's channels, a member list. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.stack} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height="0.85rem"
          // Ragged widths read as text; identical bars read as a loading bug.
          width={`${[92, 74, 84, 63, 88][index % 5]}%`}
        />
      ))}
    </div>
  )
}
