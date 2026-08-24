import { Separator as BaseSeparator } from '@base-ui/react/separator'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Separator.module.css'

export interface SeparatorProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseSeparator>, 'className' | 'children'> {
  /** Text sitting in a gap in the rule — "OR WITH PASSWORD", a date divider. */
  label?: ReactNode
  /**
   * `plain` sets the label in small caps directly in the gap.
   * `chip` puts it in a bordered pill — for a rule crossing content rather
   *  than empty space, where bare text would collide with what is behind it.
   */
  labelVariant?: 'plain' | 'chip'
  className?: string
}

/**
 * A rule between groups.
 *
 * With a `label` it becomes the divider pattern this app had written out by
 * hand in four places — a line, a word, a line — each with its own flex
 * incantation and its own idea of the type size.
 */
export function Separator({
  label,
  labelVariant = 'plain',
  className,
  ...props
}: SeparatorProps) {
  if (label) {
    return (
      <div className={cx(styles.labelled, className)} role="separator">
        <span className={styles.rule} aria-hidden="true" />
        <span className={labelVariant === 'chip' ? styles.chip : styles.label}>{label}</span>
        <span className={styles.rule} aria-hidden="true" />
      </div>
    )
  }

  return <BaseSeparator {...props} className={cx(styles.root, className)} />
}
