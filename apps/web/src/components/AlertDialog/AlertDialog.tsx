import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'
import type { ReactElement, ReactNode } from 'react'

import { Button, type ButtonVariant } from '@/components/Button'
import { cx } from '@/lib/cx'

import styles from './AlertDialog.module.css'

export interface AlertDialogProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for anything that destroys data. */
  tone?: 'default' | 'danger'
  onConfirm?: () => void
  className?: string
}

/**
 * A dialog that interrupts to ask something you cannot undo.
 *
 * Distinct from `Dialog` in the one way that matters: it has no dismiss path
 * other than the two buttons. Base UI's alert-dialog does not close on a
 * backdrop click or on Escape, and it moves focus to the popup rather than
 * offering it — which is the entire reason to use it for "delete this
 * community" instead of a regular dialog with scarier words in it.
 */
export function AlertDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  className,
}: AlertDialogProps) {
  const confirmVariant: ButtonVariant = tone === 'danger' ? 'danger' : 'primary'

  return (
    <BaseAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <BaseAlertDialog.Trigger render={trigger} />}

      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className={styles.backdrop} />
        <BaseAlertDialog.Popup className={cx(styles.popup, className)}>
          <BaseAlertDialog.Title className={styles.title}>{title}</BaseAlertDialog.Title>

          {description && (
            <BaseAlertDialog.Description className={styles.description}>
              {description}
            </BaseAlertDialog.Description>
          )}

          {children}

          <div className={styles.actions}>
            <BaseAlertDialog.Close render={<Button variant="secondary">{cancelLabel}</Button>} />
            <BaseAlertDialog.Close
              render={
                <Button variant={confirmVariant} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              }
            />
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  )
}
