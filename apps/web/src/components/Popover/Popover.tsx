import { Popover as BasePopover } from '@base-ui/react/popover'
import type { ReactElement, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Popover.module.css'

export interface PopoverProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  children: ReactNode
  title?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  /** Draws the little pointer at the anchor edge. */
  arrow?: boolean
  className?: string
}

/**
 * A panel anchored to a trigger.
 *
 * Three call sites — the emoji picker, the mention list, the notification bell
 * — each built this Portal → Positioner → Popup chain themselves, and each had
 * picked its own offset, its own radius and its own idea of whether the popup
 * should be allowed to flip. This is that chain, once.
 *
 * Distinct from `Menu`: a menu is a list of commands with roving focus, a
 * popover is arbitrary content with normal tab order inside it.
 */
export function Popover({
  trigger,
  children,
  title,
  open,
  onOpenChange,
  align = 'center',
  side = 'bottom',
  sideOffset = 8,
  arrow,
  className,
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} />

      <BasePopover.Portal>
        <BasePopover.Positioner
          className={styles.positioner}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <BasePopover.Popup className={cx(styles.popup, className)}>
            {arrow && (
              <BasePopover.Arrow className={styles.arrow}>
                <ArrowSvg />
              </BasePopover.Arrow>
            )}
            {title && <BasePopover.Title className={styles.title}>{title}</BasePopover.Title>}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

/**
 * A control inside a popover that dismisses it on activation.
 *
 * Re-exported rather than left to call sites reaching for
 * `@base-ui/react/popover` themselves — the whole point of this wrapper is
 * that a call site never has to know which library the popover came from.
 */
export const PopoverClose = BasePopover.Close

/** Two paths: the fill, then the border stroke, so the arrow joins the popup's
    outline instead of sitting on top of it as a solid triangle. */
function ArrowSvg() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden>
      <path d="M9.66 1.79 4.3 7.36A4 4 0 0 1 1.42 8.6H0v1.4h20V8.6h-1.42a4 4 0 0 1-2.88-1.23l-5.37-5.58a1 1 0 0 0-1.67 0Z" className={styles.arrowFill} />
      <path d="M10.5 1.1 15.86 6.67A5 5 0 0 0 18.58 8.1H20" className={styles.arrowStroke} />
      <path d="M0 8.1h1.42A5 5 0 0 0 4.14 6.67L9.5 1.1" className={styles.arrowStroke} />
    </svg>
  )
}
