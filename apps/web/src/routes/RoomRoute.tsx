import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Callout } from '@/components/Callout'
import { HashIcon, MicIcon, SparkleIcon, UsersIcon, VideoIcon } from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { rooms as roomsApi, type RoomType, type RoomWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'

import { Chat } from './Chat'
import { MemberList } from './MemberList'
import { VoicePanel } from './VoicePanel'

import styles from './RoomRoute.module.css'

const ROOM_ICONS: Record<RoomType, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  activity: SparkleIcon,
}

export function RoomRoute() {
  const { roomId = '' } = useParams<{ roomId: string }>()
  const { getToken } = useAuth()

  const room = useAsync(
    async () => roomsApi.get(await getToken(), roomId),
    [getToken, roomId],
  )

  if (room.loading) return <LoadingPanel />
  if (room.error) {
    return (
      <div className={styles.errorPage}>
        <Callout tone="danger">{room.error}</Callout>
      </div>
    )
  }
  if (!room.data) return null

  // Keyed on the room id so switching rooms resets chat and voice state
  // rather than carrying it across.
  return <RoomView key={roomId} room={room.data} />
}

function RoomView({ room }: { room: RoomWithPermissions }) {
  const isMobile = useIsMobile()
  const [membersOpen, setMembersOpen] = useState(false)

  const isMediaRoom = room.room_type !== 'text'
  const Icon = ROOM_ICONS[room.room_type] ?? HashIcon

  return (
    <div className={styles.room}>
      <div className={styles.main}>
        <header className={styles.header}>
          <Icon size={18} className={styles.headerIcon} />

          <div className={styles.headerText}>
            <h1 className={styles.roomName}>{room.name}</h1>
            {room.topic && <p className={styles.topic}>{room.topic}</p>}
          </div>

          {isMediaRoom && (
            <Badge tone="mint" dot>
              {room.room_type}
            </Badge>
          )}

          {!isMobile && (
            <Tooltip content={membersOpen ? 'Hide members' : 'Show members'}>
              <button
                type="button"
                className={cx(styles.headerButton, membersOpen && styles.headerButtonActive)}
                onClick={() => setMembersOpen((open) => !open)}
                aria-pressed={membersOpen}
                aria-label="Toggle member list"
              >
                <UsersIcon size={17} />
              </button>
            </Tooltip>
          )}
        </header>

        {isMediaRoom && <VoicePanel room={room} />}

        <Chat room={room} />
      </div>

      {/* Desktop only: on a phone the member list would take the whole screen,
          and it belongs to the community page there instead. */}
      {!isMobile && membersOpen && (
        <aside className={styles.members}>
          <MemberList communityId={room.community_id} />
        </aside>
      )}
    </div>
  )
}
