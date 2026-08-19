import { Toast as BaseToast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

import { CheckIcon, XIcon } from '@/components/Icons'

import styles from './Toast.module.css'

/**
 * Transient confirmations.
 *
 * The app has a lot of small side effects — an invite copied, a message
 * deleted, a friend request sent — that are invisible if nothing says they
 * happened. A callout in the layout would push content around for two seconds;
 * a toast lives outside the flow, so nothing reflows.
 *
 * Base UI owns the hard parts: the ARIA live region, the hover-to-pause timer,
 * swipe-to-dismiss, and keeping a toast mounted through its exit animation.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className={styles.viewport}>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  )
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager()

  return toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} className={styles.toast}>
      <BaseToast.Content className={styles.content}>
        <span className={styles.icon} aria-hidden>
          {toast.type === 'error' ? <XIcon size={14} /> : <CheckIcon size={14} />}
        </span>
        <div className={styles.text}>
          <BaseToast.Title className={styles.title} />
          {toast.description && (
            <BaseToast.Description className={styles.description} />
          )}
        </div>
        <BaseToast.Close className={styles.close} aria-label="Dismiss">
          <XIcon size={14} />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ))
}
