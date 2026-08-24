import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useId } from 'react'

import { CheckIcon } from '@/components/Icons'
import { cx } from '@/lib/cx'

import styles from './Checkbox.module.css'

export interface CheckboxProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseCheckbox.Root>, 'className' | 'children'> {
  /** Rendered beside the box and wired as its label. Omit and pass `aria-label`. */
  label?: ReactNode
  /** Second line under the label, for the consequence of ticking it. */
  hint?: ReactNode
  className?: string
}

/**
 * A checkbox.
 *
 * Base UI's root is a `<button role="checkbox">` with a hidden native input
 * behind it, which is what makes the box stylable without the
 * `appearance: none` plus pseudo-element trick — and what makes the
 * indeterminate state a real state rather than a class.
 */
export function Checkbox({ label, hint, className, ...props }: CheckboxProps) {
  const labelId = useId()

  const control = (
    <BaseCheckbox.Root
      {...props}
      aria-labelledby={label ? labelId : props['aria-labelledby']}
      className={cx(styles.root, !label && className)}
    >
      <BaseCheckbox.Indicator className={styles.indicator}>
        <CheckIcon size={12} strokeWidth={3.5} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )

  if (!label) return control

  return (
    <label className={cx(styles.field, className)}>
      {control}
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
    </label>
  )
}
