import { Progress as BaseProgress } from '@base-ui/react/progress'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Progress.module.css'

export interface ProgressProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseProgress.Root>, 'className'> {
  label?: ReactNode
  /** Shows the percentage on the trailing side of the label row. */
  showValue?: boolean
  /** `accent` for the app's own work, `live` for something happening in a room. */
  tone?: 'accent' | 'live'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A determinate bar — a poll result, an upload, a quota.
 *
 * Pass `value={null}` for indeterminate; Base UI sets `data-indeterminate` and
 * drops `aria-valuenow`, and the stylesheet takes over with a travelling
 * sweep. That distinction matters more than it looks: a bar sitting at 0%
 * because nothing is known is indistinguishable from a stalled upload.
 */
export function Progress({
  label,
  showValue,
  tone = 'accent',
  size = 'md',
  className,
  ...props
}: ProgressProps) {
  return (
    <BaseProgress.Root {...props} className={cx(styles.root, className)}>
      {(label || showValue) && (
        <div className={styles.header}>
          {label && <BaseProgress.Label className={styles.label}>{label}</BaseProgress.Label>}
          {showValue && <BaseProgress.Value className={styles.value} />}
        </div>
      )}

      <BaseProgress.Track className={cx(styles.track, styles[size])}>
        <BaseProgress.Indicator className={cx(styles.indicator, styles[tone])} />
      </BaseProgress.Track>
    </BaseProgress.Root>
  )
}
