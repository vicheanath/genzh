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
  PhoneIcon,
  PhoneOffIcon,
  RadioIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { type RoomType, type RoomWithPermissions, type Uuid } from '@/lib/api'
import {
  useJoinedRoomQuery,
  useRoomParticipantsQuery,
  useSetPersonaMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useVoiceRoom } from '@/lib/media'
import { useAppStore } from '@/lib/store'
import { useCall } from '@/lib/useCall'
import { useIsMobile } from '@/lib/useMediaQuery'
import { usePresence } from '@/lib/usePresence'
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

  // Joining is how presence and the anonymous identity are established, so it
  // is the read that opens the screen rather than an effect beside it.
  const room = useJoinedRoomQuery(roomId)

  if (room.isLoading) return <LoadingPanel />
  if (room.error) {
    return (
      <div className={styles.errorPage}>
        <Callout tone="danger">{errorText(room.error, 'Could not open this room')}</Callout>
      </div>
    )
  }
  if (!room.data) return null

  return <RoomView key={roomId} room={room.data} />
}

function RoomView({ room }: { room: RoomWithPermissions }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { isOnline } = usePresence()
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
  const participants = useRoomParticipantsQuery(room.id)

  const otherParticipant = participants.data?.find((p) => p.user_id !== user?.id)
  const partnerId = otherParticipant?.user_id ?? (room.owner_id !== user?.id ? room.owner_id : null)
  const lookup = useProfiles(partnerId ? [partnerId] : [])
  const partner = partnerId ? lookup(partnerId) : null

  // A direct conversation is its own call: the media session belongs to this
  // room, so calling somebody is joining the room you are already reading.
  const setPersona = useSetPersonaMutation(room.id)
  const voice = useVoiceRoom(room.id)
  const call = useCall()
  const inCall = isDM && voice.isCurrent && voice.status !== 'idle'
  const ringing = call.outgoing?.roomId === room.id

  async function startCall(video: boolean) {
    if (!partnerId) return
    try {
      await call.start(room.id, partnerId, partner?.display_name ?? 'Friend', video)
    } catch {
      // `start` already backed the call out; the ring simply never went.
    }
  }

  async function hangUp() {
    // Cancelling tells the other side to stop ringing; once they have picked
    // up there is nobody to tell, and leaving is the whole of it.
    if (ringing) {
      await call.cancel()
      return
    }
    await voice.leave()
  }

  async function handleTogglePersona(nextIsAnon: boolean) {
    setIsAnonymous(nextIsAnon)
    try {
      await setPersona.mutateAsync(nextIsAnon)
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
                presence={partnerId && isOnline(partnerId) ? 'online' : 'offline'}
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

          {isDM && partnerId && (
            <div className={styles.callControls}>
              {inCall ? (
                <Tooltip content={ringing ? 'Stop calling' : 'Leave the call'}>
                  <button
                    type="button"
                    className={cx(styles.headerButton, styles.headerButtonDanger)}
                    onClick={() => void hangUp()}
                    aria-label={ringing ? 'Stop calling' : 'Leave call'}
                  >
                    <PhoneOffIcon size={17} />
                  </button>
                </Tooltip>
              ) : (
                <>
                  <Tooltip content={`Call ${partner?.display_name ?? 'them'}`}>
                    <button
                      type="button"
                      className={styles.headerButton}
                      onClick={() => void startCall(false)}
                      aria-label="Start a voice call"
                    >
                      <PhoneIcon size={17} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Start a video call">
                    <button
                      type="button"
                      className={styles.headerButton}
                      onClick={() => void startCall(true)}
                      aria-label="Start a video call"
                    >
                      <VideoIcon size={17} />
                    </button>
                  </Tooltip>
                </>
              )}
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
            {/* A call in a direct conversation sits above the transcript rather
                than replacing it — the messages are usually what it is about. */}
            {inCall && (
              <div className={styles.dmCallStage}>
                <VoicePanel room={room} />
              </div>
            )}

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
