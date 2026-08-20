import { Avatar } from '@/components/Avatar'
import { MessageSquareIcon } from '@/components/Icons'
import type { UserRoom } from '@/lib/api'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import { NavItem } from './NavItem'
import styles from './shell.module.css'

/**
 * The caller's direct conversations, each shown as the person it is with.
 *
 * A DM's stored name is fixed to whoever opened it ("DM: @bob"), so rendering
 * it names the wrong person for the other half of every conversation — Bob's
 * own sidebar would list a chat with Bob. The server resolves the peer per
 * caller as `dm_peer_id`; this looks up that profile for the avatar and the
 * display name, and falls back to the stored name only when a room predates
 * the field or the profile has not loaded yet.
 */
export function DirectMessageList({ rooms }: { rooms: UserRoom[] }) {
  const peerIds = rooms.flatMap((room) => (room.dm_peer_id ? [room.dm_peer_id] : []))
  const lookup = useProfiles(peerIds)
  const { isOnline } = usePresence()

  return (
    <>
      {rooms.map((dm) => {
        const peer = dm.dm_peer_id ? lookup(dm.dm_peer_id) : null
        const label = peer?.display_name ?? dm.name.replace(/^DM:\s*/, '')

        return (
          <NavItem
            key={dm.id}
            to={`/rooms/${dm.id}`}
            label={label}
            leading={
              peer ? (
                <Avatar
                  name={peer.display_name}
                  src={peer.avatar_url}
                  color={peer.accent_color}
                  size="xs"
                  presence={
                    dm.dm_peer_id && isOnline(dm.dm_peer_id) ? 'online' : 'offline'
                  }
                />
              ) : (
                <MessageSquareIcon size={16} className={styles.navIcon} />
              )
            }
          />
        )
      })}
    </>
  )
}
