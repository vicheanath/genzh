import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowLeftIcon,
  LockIcon,
  MessageSquareIcon,
  PhoneIcon,
  PhoneOffIcon,
  PinIcon,
  SearchIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { type RoomWithPermissions, type Uuid } from '@/lib/api'
import { roomTypeIcon } from '@/lib/roomTypes'
import {
  useJoinedRoomQuery,
  useMarkRoomReadMutation,
  useRoomParticipantsQuery,
  useRoomPinsQuery,
  useSetPersonaMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { can } from '@/lib/permissions'
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
import { PinnedMessagesDialog } from '@/features/chat/PinnedMessagesDialog'
import { SearchMessagesDialog } from '@/features/chat/SearchMessagesDialog'

import { Chat } from './Chat'
import { MemberList } from './MemberList'
import { ProfileDialog } from './ProfileDialog'
import { VoicePanel } from './VoicePanel'
import styles from './RoomRoute.module.css'

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
  const [pinsOpen, setPinsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault)
  const anonymousAlias = useAppStore((s) => s.anonymousAlias)
  const [isAnonymous, setIsAnonymous] = useState(room.is_anonymous || isAnonymousByDefault)
  const [profileUserId, setProfileUserId] = useState<Uuid | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const markRead = useMarkRoomReadMutation()
  const pinsQuery = useRoomPinsQuery(room.id)
  const canModerate = can(room.your_permissions, 'manage_room')
  const pinsCount = pinsQuery.data?.length ?? 0

  useEffect(() => {
    markRead.mutate(room.id)
  }, [room.id])

  const [voiceChatOpen, setVoiceChatOpen] = useState(false)
  const isMediaRoom = room.room_type === 'voice' || room.room_type === 'video' || room.room_type === 'stage'
  const isDM = room.category === 'dm'
  // Only the non-DM header uses this; a DM is headed by an avatar. Read from
  // the shared table so this room wears the same glyph here as it did on the
  // card the visitor clicked to get here.
  const Icon = roomTypeIcon(room.room_type)

  function handleJumpToMessage(messageId: Uuid) {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('messageHighlighted')
      void el.offsetWidth
      el.classList.add('messageHighlighted')
    }
  }

  // Resolve DM partner
  const participants = useRoomParticipantsQuery(room.id)

  const otherParticipant = participants.data?.find((p) => p.user_id !== user?.id)
  const partnerId = otherParticipant?.user_id ?? (room.owner_id !== user?.id ? room.owner_id : null)
  const lookup = useProfiles(partnerId ? [partnerId] : [])
  const partner = partnerId ? lookup(partnerId) : null

  // A direct conversation is its own call: the media session belongs to this
  // room, so calling somebody is joining the room you are already reading.
  const setPersona = useSetPersonaMutation(room.id)
  const voice = useVoiceRoom()
  const call = useCall()
  const inCall = isDM && voice.activeRoomId === room.id && voice.status !== 'idle'
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

  /**
   * Out of a throwaway room, back to where you were in the feed.
   *
   * `navigate(-1)` rather than `navigate('/')` when there is history to go
   * back to: the feed's topic is in its URL and its scroll position is the
   * browser's, so stepping back restores both. Pushing `/` threw away the
   * filter *and* dropped the reader at the top of the column, which after
   * scrolling through nine rooms is a long way from where they left.
   *
   * A room opened from a shared link has nothing behind it, so that falls
   * through to the feed's front door.
   */
  function backToFeed() {
    if (window.history.length > 1) void navigate(-1)
    else void navigate('/')
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
              onClick={backToFeed}
              aria-label="Back to the playground"
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

          {!isMobile && (
            <>
              <Tooltip content="Search messages">
                <button
                  type="button"
                  className={cx(styles.headerButton, searchOpen && styles.headerButtonActive)}
                  onClick={() => setSearchOpen(true)}
                >
                  <SearchIcon size={17} />
                </button>
              </Tooltip>

              <Tooltip content={pinsCount > 0 ? `Pinned messages (${pinsCount})` : 'Pinned messages'}>
                <button
                  type="button"
                  className={cx(styles.headerButton, pinsOpen && styles.headerButtonActive)}
                  onClick={() => setPinsOpen(true)}
                  style={{ position: 'relative' }}
                >
                  <PinIcon size={17} />
                  {pinsCount > 0 && <span className={styles.pinBadge}>{pinsCount}</span>}
                </button>
              </Tooltip>
            </>
          )}

          {isMediaRoom && !isMobile && (
            <Tooltip content={voiceChatOpen ? 'Hide text chat' : 'Show text chat'}>
              <button
                type="button"
                className={cx(styles.headerButton, voiceChatOpen && styles.headerButtonActive)}
                onClick={() => setVoiceChatOpen((o) => !o)}
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
            {(room.room_type === 'game' ||
              room.room_type === 'truth_or_dare' ||
              room.room_type === 'would_you_rather' ||
              room.room_type === 'hot_takes' ||
              room.room_type === 'trivia' ||
              room.room_type === 'guess_who') && <GameExperience room={room} />}
            {(room.room_type === 'confession' || room.room_type === 'anonymous_chat') && (
              <ConfessionExperience room={room} />
            )}
            {(room.room_type === 'quick_chat' ||
              room.room_type === 'random_chat' ||
              room.room_type === 'match_interest' ||
              room.room_type === 'friend_finder' ||
              room.room_type === 'topic_room') && <QuickChatExperience room={room} />}
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

      <PinnedMessagesDialog
        open={pinsOpen}
        onOpenChange={setPinsOpen}
        roomId={room.id}
        canModerate={canModerate}
        onJumpToMessage={handleJumpToMessage}
      />

      <SearchMessagesDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        roomId={room.id}
        roomName={room.name}
        onJumpToMessage={handleJumpToMessage}
      />
    </div>
  )
}
