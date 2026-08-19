import { Slider as BaseSlider } from '@base-ui/react/slider'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Slider.module.css'

export interface SliderProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseSlider.Root>, 'className'> {
  label?: ReactNode
  className?: string
}

/** A single-value slider with an optional label and live value readout. */
export function Slider({ label, className, ...props }: SliderProps) {
  return (
    <BaseSlider.Root {...props} className={cx(styles.root, className)}>
      {label !== undefined && (
        <div className={styles.header}>
          <BaseSlider.Label className={styles.label}>{label}</BaseSlider.Label>
          <BaseSlider.Value className={styles.value} />
        </div>
      )}

      <BaseSlider.Control className={styles.control}>
        <BaseSlider.Track className={styles.track}>
          <BaseSlider.Indicator className={styles.indicator} />
          <BaseSlider.Thumb className={styles.thumb} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}
