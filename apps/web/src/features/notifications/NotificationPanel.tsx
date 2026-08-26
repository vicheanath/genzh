import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { AtSignIcon, BellIcon, MessageSquareIcon, UserPlusIcon } from '@/components/Icons'
import { ScrollArea } from '@/components/ScrollArea'
import { Spinner } from '@/components/Spinner'
import { describeNotification, type AppNotification, type NotificationKind } from '@/lib/api'
import { cx } from '@/lib/cx'
import { formatRelative } from '@/lib/time'
import { useNotifications } from '@/lib/useNotifications'
import { useProfiles } from '@/lib/useProfiles'

import styles from './notifications.module.css'

const ICONS: Record<NotificationKind, typeof BellIcon> = {
  mention: AtSignIcon,
  everyone: AtSignIcon,
  direct_message: MessageSquareIcon,
  friend_request: UserPlusIcon,
  friend_accepted: UserPlusIcon,
}

/**
 * The unread count, as a badge.
 *
 * Shared by every trigger, so the desktop bell and the mobile tab can never
 * disagree about how many there are.
 */
export function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className={styles.badge} aria-label={`${count} unread`}>
      {count > 9 ? '9+' : count}
    </span>
  )
}

/**
 * The list of notifications, without any chrome around it.
 *
 * The one piece both platforms share. Desktop hangs it in a popover off the
 * user bar; mobile renders it as a whole page. Which container it lands in is
 * the caller's decision, and the only thing that differs between them.
 */
export function NotificationPanel({ showHeader = true }: { showHeader?: boolean }) {
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
    <>
      {showHeader && (
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
      )}

      <ScrollArea className={styles.list} fade>
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
                <span className={styles.line}>
                  {describeNotification(item.kind, actor, item.count)}
                </span>
                {item.preview && <span className={styles.preview}>{item.preview}</span>}
                <span className={styles.when}>{formatRelative(item.updated_at)}</span>
              </span>

              {!item.read_at && <span className={styles.dot} aria-hidden />}
            </button>
          )
        })}
      </ScrollArea>
    </>
  )
}
