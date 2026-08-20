import { NotificationPanel } from '@/features/notifications'
import { useNotifications } from '@/lib/useNotifications'

import styles from './MobilePages.module.css'

/**
 * Notifications as a screen.
 *
 * Mobile's answer to the desktop popover. A list that can run to dozens of
 * rows, each with a preview, does not belong in a panel hanging off a button —
 * on a phone it is a destination, with the room to scroll that implies.
 */
export function NotificationsRoute() {
  const { unread, markAllRead } = useNotifications()

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Notifications</h1>
          <p className={styles.pageSubtitle}>
            {unread > 0 ? `${unread} unread` : 'You are all caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button type="button" className={styles.headerAction} onClick={() => void markAllRead()}>
            Mark all read
          </button>
        )}
      </header>

      <div className={styles.pageBody}>
        {/* The panel's own header would repeat the page's. */}
        <NotificationPanel showHeader={false} />
      </div>
    </div>
  )
}
