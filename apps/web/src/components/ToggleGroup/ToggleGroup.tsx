import { Toggle as BaseToggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import type { ComponentPropsWithoutRef } from 'react'

import { cx } from '@/lib/cx'

import styles from './ToggleGroup.module.css'

export interface ToggleGroupProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseToggleGroup>, 'className'> {
  size?: 'sm' | 'md'
  /**
   * `contained` — one lozenge holding the whole set. A segmented control.
   * `loose` — freestanding pills with no container, for a filter row that
   *   scrolls and has no fixed width to be contained by.
   */
  variant?: 'contained' | 'loose'
  className?: string
}

export interface ToggleProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseToggle>, 'className'> {
  className?: string
}

/**
 * A row of pressed/unpressed buttons.
 *
 * Distinct from `Tabs` and from `RadioGroup`, and the difference is what the
 * control *does*: tabs swap which panel is shown, a radio group sets one value
 * out of a set, a toggle group flips one or more independent switches that
 * happen to sit together — bold/italic, or which overlays are on in the voice
 * stage. Base UI reports each as `aria-pressed`, not `aria-selected`.
 *
 * Pass `multiple` for the independent case; leave it off and the group behaves
 * as a single-choice segmented control where pressing the pressed one clears
 * the selection.
 */
export function ToggleGroup({
  size = 'md',
  variant = 'contained',
  className,
  ...props
}: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      {...props}
      className={cx(styles.group, styles[size], styles[variant], className)}
    />
  )
}

export function Toggle({ className, ...props }: ToggleProps) {
  return <BaseToggle {...props} className={cx(styles.toggle, className)} />
}
