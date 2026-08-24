import { Meter as BaseMeter } from '@base-ui/react/meter'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Meter.module.css'

export interface MeterProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseMeter.Root>, 'className'> {
  label?: ReactNode
  /** Segmented, for a live signal like microphone input. */
  variant?: 'bar' | 'segments'
  /**
   * `muted` is for a gauge that is wired up but not currently reading
   * anything — a colourful level meter at rest claims a live signal.
   */
  tone?: 'accent' | 'live' | 'muted'
  className?: string
}

/**
 * A reading, not a task.
 *
 * The distinction from `Progress` is semantic and it is the whole reason both
 * exist: progress goes one way and ends, a meter is a gauge of something right
 * now. Microphone level is the app's case — it goes up and down forever and
 * never completes, so announcing it as progress would be a lie to a screen
 * reader. Base UI renders `role="meter"` accordingly.
 */
export function Meter({ label, variant = 'bar', tone = 'accent', className, ...props }: MeterProps) {
  return (
    <BaseMeter.Root {...props} className={cx(styles.root, className)}>
      {label && <BaseMeter.Label className={styles.label}>{label}</BaseMeter.Label>}

      <BaseMeter.Track className={cx(styles.track, variant === 'segments' && styles.segmented)}>
        <BaseMeter.Indicator className={cx(styles.indicator, styles[tone])} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  )
}
