import { NumberField as BaseNumberField } from '@base-ui/react/number-field'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './NumberField.module.css'

export interface NumberFieldProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseNumberField.Root>, 'className'> {
  label?: ReactNode
  /** Explanation under the control. */
  hint?: ReactNode
  /** Unit shown inside the field — "min", "members", "sec". */
  suffix?: ReactNode
  className?: string
}

/**
 * A number input with steppers.
 *
 * `<input type="number">` is the thing this replaces, and it is worth the swap:
 * it silently accepts `1e5` and `--3`, its spinners are unstyleable and absent
 * on mobile entirely, and a scroll over a focused one changes the value — which
 * is how a slow-mode setting becomes 300 seconds while someone scrolls past it.
 *
 * Base UI's version clamps to `min`/`max` on blur, steps with the arrow keys,
 * and adds a scrub area: dragging the label changes the value, which is the
 * fastest way to set a number on a touchscreen.
 */
export function NumberField({
  label,
  hint,
  suffix,
  className,
  ...props
}: NumberFieldProps) {
  return (
    <BaseNumberField.Root {...props} className={cx(styles.root, className)}>
      {label && (
        <BaseNumberField.ScrubArea className={styles.scrubArea}>
          <span className={styles.label}>{label}</span>
          <BaseNumberField.ScrubAreaCursor className={styles.scrubCursor} />
        </BaseNumberField.ScrubArea>
      )}

      <BaseNumberField.Group className={styles.group}>
        <BaseNumberField.Decrement className={styles.step} aria-label="Decrease">
          &minus;
        </BaseNumberField.Decrement>

        <BaseNumberField.Input className={styles.input} />
        {suffix && <span className={styles.suffix}>{suffix}</span>}

        <BaseNumberField.Increment className={styles.step} aria-label="Increase">
          +
        </BaseNumberField.Increment>
      </BaseNumberField.Group>

      {hint && <p className={styles.hint}>{hint}</p>}
    </BaseNumberField.Root>
  )
}
