import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowLeftIcon,
  HashIcon,
  LockIcon,
  MicIcon,
  SparkleIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/Icons'
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
  stage: VideoIcon,
  poll: SparkleIcon,
  debate: SparkleIcon,
  game: SparkleIcon,
  confession: LockIcon,
  quick_chat: HashIcon,
}

export function RoomRoute() {
  const { roomId = '' } = useParams<{ roomId: string }>()
  const { getToken } = useAuth()

  const room = useAsync(
    async () => {
      const token = await getToken()
      // Automatically join room to establish presence and anonymous identity
      const joined = await roomsApi.join(token, roomId)
      return joined
    },
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

  return <RoomView key={roomId} room={room.data} />
}

function RoomView({ room }: { room: RoomWithPermissions }) {
  const { user, getToken } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [membersOpen, setMembersOpen] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(room.is_anonymous)

  const isMediaRoom = room.room_type === 'voice' || room.room_type === 'video' || room.room_type === 'stage' || room.room_type === 'activity'
  const Icon = ROOM_ICONS[room.room_type] ?? HashIcon

  async function handleTogglePersona(nextIsAnon: boolean) {
    setIsAnonymous(nextIsAnon)
    try {
      await roomsApi.setPersona(await getToken(), room.id, nextIsAnon)
    } catch {
      // transient failures keep local choice
    }
  }

  return (
    <div className={styles.room}>
      <div className={styles.main}>
        <header className={styles.header}>
          {!room.community_id && (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              onClick={() => void navigate('/')}
              aria-label="Back to Playground"
            >
              <ArrowLeftIcon size={16} />
            </Button>
          )}

          <Icon size={18} className={styles.headerIcon} />

          <div className={styles.headerText}>
            <h1 className={styles.roomName}>{room.name}</h1>
            {room.topic && <p className={styles.topic}>{room.topic}</p>}
          </div>

          {/* User Persona Switcher: Anonymous vs Public Choice */}
          <div className={styles.personaSwitch}>
            <button
              type="button"
              className={cx(styles.personaBtn, isAnonymous && styles.personaBtnActive)}
              onClick={() => void handleTogglePersona(true)}
              title="Post anonymously with masked alias"
            >
              <LockIcon size={12} />
              <span>{room.anonymous_identity?.alias_name ?? 'Anonymous'}</span>
            </button>
            <button
              type="button"
              className={cx(styles.personaBtn, !isAnonymous && styles.personaBtnActive)}
              onClick={() => void handleTogglePersona(false)}
              title="Post as your public profile"
            >
              <UsersIcon size={12} />
              <span>{user?.profile.display_name ?? 'Public'}</span>
            </button>
          </div>

          {isMediaRoom && (
            <Badge tone="mint" dot>
              {room.room_type}
            </Badge>
          )}

          {room.community_id && !isMobile && (
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

        <Chat
          room={room}
          isAnonymousPersona={isAnonymous}
          onTogglePersona={(next) => void handleTogglePersona(next)}
        />
      </div>

      {room.community_id && !isMobile && membersOpen && (
        <aside className={styles.members}>
          <MemberList communityId={room.community_id} />
        </aside>
      )}
    </div>
  )
}
