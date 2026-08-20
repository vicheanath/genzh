import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Sheet.module.css'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Announced to screen readers; the panel itself is visually chromeless. */
  title: string
  /**
   * Which edge it comes from.
   *
   * `start` for navigation, which is where a back-and-forth between places
   * belongs. `bottom` for something you glance at and dismiss — it lands next
   * to the thumb rather than across the whole screen.
   */
  side?: 'start' | 'bottom'
  children: ReactNode
}

/**
 * A panel that slides in from the edge, for narrow screens.
 *
 * Built on Dialog rather than a bespoke overlay because it *is* a modal: it
 * needs the focus trap, the scroll lock, and Escape to close. Only the entrance
 * differs, and that is a transform.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  side = 'start',
  children,
}: SheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup
          className={cx(styles.popup, side === 'bottom' && styles.popupBottom)}
        >
          <BaseDialog.Title className={styles.srOnly}>{title}</BaseDialog.Title>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
