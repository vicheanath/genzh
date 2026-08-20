import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowLeftIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  LockIcon,
  MessageSquareIcon,
  MicIcon,
  PaletteIcon,
  RadioIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { rooms as roomsApi, type RoomType, type RoomWithPermissions, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useProfiles } from '@/lib/useProfiles'

import { ActivityExperience } from '@/features/experiences/ActivityExperience'
import { ConfessionExperience } from '@/features/experiences/ConfessionExperience'
import { DebateExperience } from '@/features/experiences/DebateExperience'
import { GameExperience } from '@/features/experiences/GameExperience'
import { PollExperience } from '@/features/experiences/PollExperience'
import { QuickChatExperience } from '@/features/experiences/QuickChatExperience'

import { Chat } from './Chat'
import { MemberList } from './MemberList'
import { ProfileDialog } from './ProfileDialog'
import { VoicePanel } from './VoicePanel'
import styles from './RoomRoute.module.css'

const ROOM_ICONS: Record<RoomType, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  stage: RadioIcon,
  activity: PaletteIcon,
  poll: VoteIcon,
  debate: FlameIcon,
  game: GamepadIcon,
  confession: LockIcon,
  quick_chat: ZapIcon,
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
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault)
  const anonymousAlias = useAppStore((s) => s.anonymousAlias)
  const [isAnonymous, setIsAnonymous] = useState(room.is_anonymous || isAnonymousByDefault)
  const [profileUserId, setProfileUserId] = useState<Uuid | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const [voiceChatOpen, setVoiceChatOpen] = useState(false)
  const isMediaRoom = room.room_type === 'voice' || room.room_type === 'video' || room.room_type === 'stage'
  const isDM = room.category === 'dm'
  // Only the non-DM header uses this; a DM is headed by an avatar.
  const Icon = ROOM_ICONS[room.room_type] ?? HashIcon

  // Resolve DM partner
  const participants = useAsync(
    async () => roomsApi.participants(await getToken(), room.id),
    [getToken, room.id],
  )

  const otherParticipant = participants.data?.find((p) => p.user_id !== user?.id)
  const partnerId = otherParticipant?.user_id ?? (room.owner_id !== user?.id ? room.owner_id : null)
  const lookup = useProfiles(partnerId ? [partnerId] : [])
  const partner = partnerId ? lookup(partnerId) : null

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

          {isDM ? (
            // A DM is titled by the person, never by the room: the stored name
            // is fixed to whoever opened it, so falling back to it would show
            // the recipient their own handle while the profile loads.
            <button
              type="button"
              className={styles.dmHeader}
              onClick={() => {
                if (partnerId) {
                  setProfileUserId(partnerId)
                  setProfileOpen(true)
                }
              }}
              disabled={!partnerId}
              title={partner ? `View ${partner.display_name}'s profile` : undefined}
            >
              <Avatar
                name={partner?.display_name ?? '?'}
                src={partner?.avatar_url}
                color={partner?.accent_color}
                size="md"
                presence="online"
              />
              <div className={styles.headerText}>
                <h1 className={styles.roomName}>
                  {partner?.display_name ?? 'Direct message'}
                </h1>
                {partner && <p className={styles.topic}>@{partner.handle}</p>}
              </div>
            </button>
          ) : (
            <>
              <Icon size={18} className={styles.headerIcon} />
              <div className={styles.headerText}>
                <h1 className={styles.roomName}>{room.name}</h1>
                {room.topic && <p className={styles.topic}>{room.topic}</p>}
              </div>
            </>
          )}

          {/* User Persona Switcher: Anonymous vs Public Choice */}
          {!isDM && (
            <div className={styles.personaSwitch}>
              <button
                type="button"
                className={cx(styles.personaBtn, isAnonymous && styles.personaBtnActive)}
                onClick={() => void handleTogglePersona(true)}
                title="Post anonymously with masked alias"
              >
                <LockIcon size={12} />
                <span>{room.anonymous_identity?.alias_name || anonymousAlias || 'Anonymous'}</span>
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
          )}

          {isMediaRoom && (
            <Badge tone="mint" dot>
              {room.room_type}
            </Badge>
          )}

          {isMediaRoom && !isMobile && (
            <Tooltip content={voiceChatOpen ? 'Hide text chat' : 'Show text chat'}>
              <button
                type="button"
                className={cx(styles.headerButton, voiceChatOpen && styles.headerButtonActive)}
                onClick={() => setVoiceChatOpen((o) => !o)}
                aria-label="Toggle text chat"
              >
                <MessageSquareIcon size={17} />
              </button>
            </Tooltip>
          )}

          {!isMobile && !isDM && (
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

        {isMediaRoom ? (
          <div className={styles.mediaStageContainer}>
            <VoicePanel
              room={room}
              onToggleChat={() => setVoiceChatOpen((o) => !o)}
              isChatOpen={voiceChatOpen}
            />
            {voiceChatOpen && (
              <div className={styles.voiceSideChat}>
                <Chat
                  room={room}
                  isAnonymousPersona={isDM ? false : isAnonymous}
                  onTogglePersona={(next) => void handleTogglePersona(next)}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Experience Type Interactive feature engines */}
            {room.room_type === 'debate' && <DebateExperience room={room} />}
            {room.room_type === 'poll' && <PollExperience room={room} />}
            {room.room_type === 'game' && <GameExperience room={room} />}
            {room.room_type === 'confession' && <ConfessionExperience room={room} />}
            {room.room_type === 'quick_chat' && <QuickChatExperience room={room} />}
            {room.room_type === 'activity' && <ActivityExperience room={room} />}

            <Chat
              room={room}
              isAnonymousPersona={isDM ? false : isAnonymous}
              onTogglePersona={(next) => void handleTogglePersona(next)}
            />
          </>
        )}
      </div>

      {!isMobile && membersOpen && !isDM && (
        <aside className={styles.members}>
          <MemberList communityId={room.community_id} roomId={room.id} />
        </aside>
      )}

      {profileUserId && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          targetUserId={profileUserId}
        />
      )}
    </div>
  )
}
