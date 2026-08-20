import { Popover } from '@base-ui/react/popover'

import { BellIcon } from '@/components/Icons'
import { Tooltip } from '@/components/Tooltip'
import { useNotifications } from '@/lib/useNotifications'

import { NotificationBadge, NotificationPanel } from './NotificationPanel'
import styles from './notifications.module.css'

/**
 * The desktop trigger: a bell in the user bar, opening a popover over it.
 *
 * Desktop only, deliberately. On a phone the user bar lives inside the
 * navigation drawer, and a popover in a drawer is the wrong shape for a list
 * this long — mobile gets `/notifications` as a page instead.
 */
export function NotificationBell() {
  const { unread } = useNotifications()

  return (
    <Popover.Root>
      <Tooltip content="Notifications">
        <Popover.Trigger className={styles.trigger} aria-label="Notifications">
          <BellIcon size={16} />
          <NotificationBadge count={unread} />
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <NotificationPanel />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
