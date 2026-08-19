import { Field } from '@base-ui/react/field'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Input.module.css'

export interface InputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'className'> {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
  className?: string
}

/**
 * A labelled text input.
 *
 * Built on Base UI's Field so the label, description and error are wired to the
 * control with the right `id`/`aria-describedby` automatically — the part that
 * is easy to get subtly wrong by hand.
 */
export function Input({ label, description, error, className, ...props }: InputProps) {
  return (
    <Field.Root className={cx(styles.field, className)} invalid={Boolean(error)}>
      <Field.Label className={styles.label}>{label}</Field.Label>
      <Field.Control {...props} className={styles.control} />
      {description && (
        <Field.Description className={styles.description}>
          {description}
        </Field.Description>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </Field.Root>
  )
}
