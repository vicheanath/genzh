import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactElement, ReactNode } from 'react'

import { Button } from '@/components/Button'

import styles from './Dialog.module.css'

export interface DialogProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Label for the confirming action. Omit for an informational dialog. */
  confirmLabel?: string
  onConfirm?: () => void
  cancelLabel?: string
}

/**
 * A modal dialog.
 *
 * Base UI handles the hard parts — focus trapping, restoring focus to the
 * trigger, `aria-labelledby` wiring, scroll locking, and staying mounted
 * through the exit animation. All that is left here is appearance.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
}: DialogProps) {
  return (
    <BaseDialog.Root>
      <BaseDialog.Trigger render={trigger} />

      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>

          {description && (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          )}

          {children}

          <div className={styles.actions}>
            <BaseDialog.Close
              render={<Button variant="secondary">{cancelLabel}</Button>}
            />
            {confirmLabel && (
              <BaseDialog.Close
                render={
                  <Button variant="primary" onClick={onConfirm}>
                    {confirmLabel}
                  </Button>
                }
              />
            )}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
