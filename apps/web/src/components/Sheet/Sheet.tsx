import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

import styles from './Sheet.module.css'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Announced to screen readers; the panel itself is visually chromeless. */
  title: string
  children: ReactNode
}

/**
 * A panel that slides in from the edge, for narrow screens.
 *
 * Built on Dialog rather than a bespoke overlay because it *is* a modal: it
 * needs the focus trap, the scroll lock, and Escape to close. Only the entrance
 * differs, and that is a transform.
 */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <BaseDialog.Title className={styles.srOnly}>{title}</BaseDialog.Title>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
