import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentPropsWithoutRef } from 'react'

import { cx } from '@/lib/cx'

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseButton>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/**
 * Base UI's Button with this app's styling applied.
 *
 * Wrapping it — rather than passing `className` at every call site — is what
 * keeps variant names as the vocabulary of the app instead of a pile of ad-hoc
 * class strings, and gives one place to change when a variant is redesigned.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cx(styles.button, styles[variant], styles[size], className)}
    />
  )
}
