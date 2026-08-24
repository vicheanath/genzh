import { Radio as BaseRadio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useId } from 'react'

import { cx } from '@/lib/cx'

import styles from './RadioGroup.module.css'

export interface RadioGroupProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseRadioGroup>, 'className'> {
  /**
   * `list` — a stack of dot-and-label rows. The default.
   * `cards` — each option is a pressable tile. For a small set of choices that
   *           each need an icon and a line of explanation, like the theme picker.
   */
  variant?: 'list' | 'cards'
  className?: string
}

export interface RadioProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseRadio.Root>, 'className' | 'children'> {
  label?: ReactNode
  hint?: ReactNode
  /** Shown above the label in the `cards` variant. */
  icon?: ReactNode
  className?: string
}

/**
 * A single-choice group.
 *
 * The reason to take this from Base UI rather than keep the hand-rolled
 * version: a radio group is one tab stop, and arrow keys move *and select*
 * within it. Hand-rolled `role="radio"` buttons — which is what this app had —
 * are each their own tab stop and answer to neither arrow key, so a keyboard
 * user tabs through every option and cannot change the value at all.
 */
export function RadioGroup({ variant = 'list', className, ...props }: RadioGroupProps) {
  return (
    <BaseRadioGroup {...props} className={cx(styles.group, styles[variant], className)} />
  )
}

export function Radio({ label, hint, icon, className, ...props }: RadioProps) {
  const labelId = useId()

  return (
    <label className={cx(styles.option, className)}>
      <BaseRadio.Root
        {...props}
        aria-labelledby={label ? labelId : props['aria-labelledby']}
        className={styles.control}
      >
        <BaseRadio.Indicator className={styles.indicator} />
      </BaseRadio.Root>

      {icon && <span className={styles.icon}>{icon}</span>}

      {(label || hint) && (
        <span className={styles.text}>
          {label && <span id={labelId} className={styles.label}>{label}</span>}
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
      )}
    </label>
  )
}
