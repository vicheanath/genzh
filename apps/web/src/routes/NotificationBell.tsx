import { Popover } from '@base-ui/react/popover'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { AtSignIcon, BellIcon, MessageSquareIcon, UserPlusIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import type { AppNotification, NotificationKind } from '@/lib/api'
import { cx } from '@/lib/cx'
import { formatRelative } from '@/lib/time'
import { useNotifications } from '@/lib/useNotifications'
import { useProfiles } from '@/lib/useProfiles'

import styles from './NotificationBell.module.css'

const ICONS: Record<NotificationKind, typeof BellIcon> = {
  mention: AtSignIcon,
  everyone: AtSignIcon,
  direct_message: MessageSquareIcon,
  friend_request: UserPlusIcon,
  friend_accepted: UserPlusIcon,
}

/** What the row says, given who caused it. */
function describe(kind: NotificationKind, actor: string): string {
  switch (kind) {
    case 'mention':
      return `${actor} mentioned you`
    case 'everyone':
      return `${actor} notified everyone`
    case 'direct_message':
      return `${actor} sent you a message`
    case 'friend_request':
      return `${actor} wants to be friends`
    case 'friend_accepted':
      return `${actor} accepted your friend request`
  }
}

export function NotificationBell() {
  const { items, unread, loading, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  const actorIds = items.flatMap((item) => (item.actor_id ? [item.actor_id] : []))
  const lookup = useProfiles(actorIds)

  function open(item: AppNotification) {
    void markRead(item.id)
    if (item.room_id) {
      void navigate(`/rooms/${item.room_id}`)
    } else if (item.kind === 'friend_request' || item.kind === 'friend_accepted') {
      void navigate('/friends')
    }
  }

  return (
    <Popover.Root>
      <Tooltip content="Notifications">
        <Popover.Trigger className={styles.trigger} aria-label="Notifications">
          <BellIcon size={16} />
          {unread > 0 && (
            <span className={styles.badge} aria-label={`${unread} unread`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <header className={styles.header}>
              <span className={styles.title}>Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  className={styles.markAll}
                  onClick={() => void markAllRead()}
                >
                  Mark all read
                </button>
              )}
            </header>

            <div className={styles.list}>
              {loading && items.length === 0 && (
                <div className={styles.empty}>
                  <Spinner />
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className={styles.empty}>
                  <BellIcon size={26} />
                  <p>Nothing yet. Mentions and messages land here.</p>
                </div>
              )}

              {items.map((item) => {
                const Icon = ICONS[item.kind]
                const profile = item.actor_id ? lookup(item.actor_id) : null
                // A notification from an anonymous message carries no actor by
                // design, so it is described without naming anyone.
                const actor = profile?.display_name ?? 'Someone'

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(styles.item, !item.read_at && styles.itemUnread)}
                    onClick={() => open(item)}
                  >
                    <span className={styles.avatarSlot}>
                      {profile ? (
                        <Avatar
                          name={profile.display_name}
                          src={profile.avatar_url}
                          color={profile.accent_color}
                          size="sm"
                        />
                      ) : (
                        <span className={styles.iconFallback}>
                          <Icon size={16} />
                        </span>
                      )}
                    </span>

                    <span className={styles.body}>
                      <span className={styles.line}>{describe(item.kind, actor)}</span>
                      {item.preview && <span className={styles.preview}>{item.preview}</span>}
                      <span className={styles.when}>{formatRelative(item.created_at)}</span>
                    </span>

                    {!item.read_at && <span className={styles.dot} aria-hidden />}
                  </button>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
