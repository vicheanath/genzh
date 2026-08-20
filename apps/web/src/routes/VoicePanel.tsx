import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CrownIcon,
  HandIcon,
  HeadphonesIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  PhoneOffIcon,
  RadioIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  UsersIcon,
} from '@/components/Icons'
import { Tooltip } from '@/components/Tooltip'
import type { RoomWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useVoiceRoom } from '@/lib/media'
import { can } from '@/lib/permissions'

import styles from './VoicePanel.module.css'

interface StageRequest {
  userId: string
  displayName: string
  avatar?: string | null
}

interface VoicePanelProps {
  room: RoomWithPermissions
  onToggleChat?: () => void
  isChatOpen?: boolean
}

export function VoicePanel({ room, onToggleChat, isChatOpen }: VoicePanelProps) {
  const { user } = useAuth()
  const voice = useVoiceRoom(room.id)

  const isStage = room.room_type === 'stage'
  const canSpeak = can(room.your_permissions, 'speak')
  const canModerate = can(room.your_permissions, 'manage_room')
  const isCurrentRoom = voice.isCurrent
  const connected = isCurrentRoom && voice.status === 'connected'
  const pending = isCurrentRoom && (voice.status === 'connecting' || voice.status === 'reconnecting')
  const inOtherRoom = Boolean(voice.activeRoomId && voice.activeRoomId !== room.id)
  const headcount = isCurrentRoom ? voice.participants.length + 1 : 0

  const [theaterMode, setTheaterMode] = useState(false)
  const [stageRequests, setStageRequests] = useState<StageRequest[]>([])
  const [stageRole, setStageRole] = useState<'host' | 'speaker' | 'audience'>(() => {
    if (room.owner_id === user?.id) return 'host'
    if (canModerate) return 'host'
    if (isStage) return 'audience'
    return 'speaker'
  })

  // Raised hands simulation / state
  function handleToggleRaiseHand() {
    const nextHand = !voice.handRaised
    voice.raiseHand(nextHand)
    if (nextHand && user) {
      setStageRequests((prev) => [
        ...prev.filter((r) => r.userId !== user.id),
        {
          userId: user.id,
          displayName: user.profile.display_name,
          avatar: user.profile.avatar_url,
        },
      ])
    } else if (user) {
      setStageRequests((prev) => prev.filter((r) => r.userId !== user.id))
    }
  }

  function handleApproveSpeaker(req: StageRequest) {
    setStageRequests((prev) => prev.filter((r) => r.userId !== req.userId))
    if (req.userId === user?.id) {
      setStageRole('speaker')
      voice.setStageRole('speaker')
    }
  }

  // Find if any participant or self is screen sharing
  const activeScreenParticipant = voice.participants.find((p) => p.screenSharing && p.screenStream)
  const activeScreenStream = voice.isScreenSharing
    ? voice.screenStream
    : activeScreenParticipant?.screenStream

  // Separate speakers and audience for Discord-like Stage
  const isUserSpeaker = stageRole === 'host' || stageRole === 'speaker'
  const speakerParticipants = voice.participants.filter(
    (p) => !isStage || p.stageRole === 'speaker' || p.stageRole === 'host' || p.screenSharing,
  )
  const audienceParticipants = voice.participants.filter(
    (p) => isStage && p.stageRole === 'audience' && !p.screenSharing,
  )

  // ── INVITATION / DISCONNECTED STATE (DISCORD LOBBY) ──
  if (!connected && !pending) {
    return (
      <section className={styles.lobbyPanel}>
        <div className={styles.lobbyCard}>
          <div className={styles.lobbyIconWrap}>
            {isStage ? <RadioIcon size={36} /> : <HeadphonesIcon size={36} />}
          </div>

          <h2 className={styles.lobbyTitle}>
            {inOtherRoom
              ? `Connected in ${voice.activeRoomName || 'another room'}`
              : isStage
                ? 'Live Stage Channel'
                : 'Voice & Screen Channel'}
          </h2>

          <p className={styles.lobbySubtitle}>
            {inOtherRoom
              ? 'Click below to switch your voice connection to this room.'
              : isStage
                ? 'Join the audience to listen in, or request to speak and share your screen on stage.'
                : 'Hang out with voice, video, and crisp screen sharing with zero latency.'}
          </p>

          <Button
            size="lg"
            onClick={() => void voice.join(room.name, room.community_id ?? undefined)}
            className={styles.joinBtn}
          >
            <MicIcon size={18} />
            <span>{inOtherRoom ? 'Switch to this room' : isStage ? 'Join Stage' : 'Join Voice'}</span>
          </Button>

          {isCurrentRoom && voice.error && <Callout tone="danger">{voice.error}</Callout>}
        </div>
      </section>
    )
  }

  // ── CONNECTED LIVE STAGE / VOICE ROOM VIEWPORT ──
  return (
    <section className={cx(styles.stageViewport, theaterMode && styles.theaterFullscreen)}>
      {/* ── TOP STAGE HEADER BAR ── */}
      <div className={styles.viewportHeader}>
        <div className={styles.viewportHeaderLeft}>
          <Badge tone={connected ? 'mint' : 'neutral'} dot={connected}>
            {connected ? (isStage ? 'STAGE LIVE' : 'VOICE CONNECTED') : 'CONNECTING'}
          </Badge>

          <span className={styles.headcount}>
            <UsersIcon size={13} />
            {headcount} {headcount === 1 ? 'participant' : 'participants'}
          </span>

          {isStage && (
            <span className={styles.stageTopicTag}>
              <RadioIcon size={13} />
              {room.topic || room.name}
            </span>
          )}
        </div>

        <div className={styles.viewportHeaderRight}>
          {activeScreenStream && (
            <Tooltip content={theaterMode ? 'Exit Fullscreen' : 'Fullscreen / Theater'}>
              <button
                type="button"
                className={styles.headerIconBtn}
                onClick={() => setTheaterMode((t) => !t)}
                aria-label="Toggle Fullscreen"
              >
                {theaterMode ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
              </button>
            </Tooltip>
          )}

          {onToggleChat && (
            <Tooltip content={isChatOpen ? 'Hide Text Chat' : 'Show Text Chat'}>
              <button
                type="button"
                className={cx(styles.headerIconBtn, isChatOpen && styles.headerIconBtnActive)}
                onClick={onToggleChat}
                aria-label="Toggle Chat"
              >
                <MessageSquareIcon size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {voice.error && <Callout tone="danger">{voice.error}</Callout>}

      {/* ── STAGE VIEWPORT CONTENT ── */}
      <div className={styles.viewportBody}>
        {/* 1. SCREEN SHARE PRESENTATION THEATER */}
        {activeScreenStream ? (
          <div className={styles.presentationView}>
            <div className={styles.screenVideoCard}>
              <div className={styles.liveTagOverlay}>
                <span className={styles.liveTag}>LIVE</span>
                <span className={styles.liveSpeakerName}>
                  {voice.isScreenSharing
                    ? 'Your Screen'
                    : `${activeScreenParticipant?.displayName ?? 'Speaker'}'s Screen`}
                </span>
              </div>
              <ScreenVideo stream={activeScreenStream} />
            </div>

            {/* Thumbnail Participant Strip under Screen Share */}
            <div className={styles.participantStrip}>
              {isUserSpeaker && (
                <DiscordVoiceTile
                  name={user?.profile.display_name ?? 'You'}
                  avatar={user?.profile.avatar_url}
                  accent={user?.profile.accent_color}
                  speaking={voice.speaking}
                  muted={voice.muted}
                  screenSharing={voice.isScreenSharing}
                  compact
                  you
                />
              )}
              {speakerParticipants.map((p) => (
                <DiscordVoiceTile
                  key={p.id}
                  name={p.displayName}
                  speaking={p.speaking}
                  muted={p.muted}
                  screenSharing={Boolean(p.screenSharing)}
                  compact
                >
                  <RemoteAudio stream={p.stream} />
                </DiscordVoiceTile>
              ))}
            </div>
          </div>
        ) : (
          /* 2. REGULAR DISCORD VOICE GRID & STAGE PODIUM */
          <div className={styles.stageGridArea}>
            {/* Moderator Raised Hand Approvals */}
            {isStage && (stageRole === 'host' || canModerate) && stageRequests.length > 0 && (
              <div className={styles.requestsCard}>
                <div className={styles.requestsTitle}>
                  <HandIcon size={14} />
                  <span>Raised Hands Queue ({stageRequests.length})</span>
                </div>
                <div className={styles.requestsList}>
                  {stageRequests.map((req) => (
                    <div key={req.userId} className={styles.requestItem}>
                      <Avatar name={req.displayName} src={req.avatar} size="xs" />
                      <span className={styles.requestName}>{req.displayName}</span>
                      <Button size="sm" onClick={() => handleApproveSpeaker(req)}>
                        Invite to Stage
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Speakers / Active Voice Grid */}
            <div className={styles.gridSection}>
              {isStage && (
                <div className={styles.sectionHeader}>
                  <span>🎙️ Speakers on Stage ({(isUserSpeaker ? 1 : 0) + speakerParticipants.length})</span>
                </div>
              )}

              <div className={styles.voiceGrid}>
                {isUserSpeaker && (
                  <DiscordVoiceTile
                    name={user?.profile.display_name ?? 'You'}
                    avatar={user?.profile.avatar_url}
                    accent={user?.profile.accent_color}
                    speaking={voice.speaking}
                    muted={voice.muted}
                    role={stageRole}
                    screenSharing={voice.isScreenSharing}
                    you
                    onStepDown={
                      isStage && stageRole !== 'host'
                        ? () => {
                            setStageRole('audience')
                            voice.setStageRole('audience')
                          }
                        : undefined
                    }
                  />
                )}

                {speakerParticipants.map((p) => (
                  <DiscordVoiceTile
                    key={p.id}
                    name={p.displayName}
                    speaking={p.speaking}
                    muted={p.muted}
                    role={p.stageRole ?? 'speaker'}
                    screenSharing={Boolean(p.screenSharing)}
                  >
                    <RemoteAudio stream={p.stream} />
                  </DiscordVoiceTile>
                ))}
              </div>
            </div>

            {/* Audience Section (Stage rooms) */}
            {isStage && (
              <div className={styles.audienceSection}>
                <div className={styles.sectionHeader}>
                  <span>👥 Audience ({(!isUserSpeaker ? 1 : 0) + audienceParticipants.length})</span>
                </div>

                <div className={styles.audienceGrid}>
                  {!isUserSpeaker && (
                    <div className={cx(styles.audienceTile, styles.audienceTileYou)}>
                      <Avatar
                        name={user?.profile.display_name ?? 'You'}
                        src={user?.profile.avatar_url}
                        color={user?.profile.accent_color}
                        size="md"
                      />
                      <span className={styles.audienceName}>You</span>
                      {voice.handRaised && <span className={styles.handBadge}>✋</span>}
                    </div>
                  )}

                  {audienceParticipants.map((p) => (
                    <div key={p.id} className={styles.audienceTile}>
                      <Avatar name={p.displayName} size="md" />
                      <span className={styles.audienceName}>{p.displayName}</span>
                      {p.handRaised && <span className={styles.handBadge}>✋</span>}
                      <RemoteAudio stream={p.stream} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DISCORD FLOATING CONTROLS CAPSULE BAR ── */}
      <div className={styles.floatingControlsContainer}>
        <div className={styles.floatingControlsPill}>
          {/* Mute Mic */}
          <Tooltip content={voice.muted ? 'Unmute Microphone' : 'Mute Microphone'}>
            <button
              type="button"
              className={cx(styles.controlBtn, voice.muted && styles.controlBtnDanger)}
              onClick={voice.toggleMute}
              disabled={!connected || (!canSpeak && !isUserSpeaker)}
              aria-label="Toggle Microphone"
            >
              {voice.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
          </Tooltip>

          {/* Screen Share (1-Click toggle, NO auto-share) */}
          <Tooltip content={voice.isScreenSharing ? 'Stop Sharing Screen' : 'Share Your Screen'}>
            <button
              type="button"
              className={cx(styles.controlBtn, voice.isScreenSharing && styles.controlBtnActive)}
              onClick={() => void voice.toggleScreenShare()}
              disabled={!connected}
              aria-label="Share Screen"
            >
              {voice.isScreenSharing ? (
                <ScreenShareOffIcon size={20} />
              ) : (
                <ScreenShareIcon size={20} />
              )}
            </button>
          </Tooltip>

          {/* Stage Raise Hand (Stage channels) */}
          {isStage && (
            <Tooltip content={voice.handRaised ? 'Lower Hand' : 'Raise Hand to Speak'}>
              <button
                type="button"
                className={cx(styles.controlBtn, voice.handRaised && styles.controlBtnActive)}
                onClick={handleToggleRaiseHand}
                aria-label="Raise Hand"
              >
                <HandIcon size={20} />
              </button>
            </Tooltip>
          )}

          {/* Text Chat Drawer Toggle */}
          {onToggleChat && (
            <Tooltip content={isChatOpen ? 'Hide Chat' : 'Show Chat'}>
              <button
                type="button"
                className={cx(styles.controlBtn, isChatOpen && styles.controlBtnActive)}
                onClick={onToggleChat}
                aria-label="Toggle Chat"
              >
                <MessageSquareIcon size={20} />
              </button>
            </Tooltip>
          )}

          {/* Red Disconnect Button */}
          <Tooltip content="Disconnect">
            <button
              type="button"
              className={cx(styles.controlBtn, styles.controlBtnDisconnect)}
              onClick={() => void voice.leave()}
              aria-label="Disconnect"
            >
              <PhoneOffIcon size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
    </section>
  )
}

function DiscordVoiceTile({
  name,
  avatar,
  accent,
  speaking,
  muted,
  role,
  screenSharing,
  compact,
  you,
  onStepDown,
  children,
}: {
  name: string
  avatar?: string | null
  accent?: string | null
  speaking: boolean
  muted: boolean
  role?: 'host' | 'speaker' | 'audience'
  screenSharing?: boolean
  compact?: boolean
  you?: boolean
  onStepDown?: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      className={cx(
        styles.voiceTile,
        speaking && styles.voiceTileSpeaking,
        compact && styles.voiceTileCompact,
      )}
    >
      <div className={styles.avatarWrap}>
        <Avatar
          name={name}
          src={avatar}
          color={accent}
          size={compact ? 'lg' : 'xl'}
          speaking={speaking}
        />
        {speaking && <div className={styles.speakingWaveRing} />}
      </div>

      <div className={styles.tileNameTag}>
        <span className={styles.tileNameText}>{you ? `${name} (You)` : name}</span>
        {role === 'host' && (
          <span className={styles.crownTag} title="Stage Host">
            <CrownIcon size={11} />
          </span>
        )}
        {screenSharing && (
          <span className={styles.livePill}>LIVE</span>
        )}
        {muted && (
          <span className={styles.mutedPill}>
            <MicOffIcon size={12} />
          </span>
        )}
      </div>

      {you && onStepDown && (
        <button type="button" className={styles.stepDownLink} onClick={onStepDown}>
          Step Down
        </button>
      )}

      {children}
    </div>
  )
}

function ScreenVideo({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {})
    return () => {
      video.srcObject = null
    }
  }, [stream])

  if (!stream) return null
  return <video ref={videoRef} autoPlay playsInline muted className={styles.screenVideoElement} />
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !stream) return
    element.srcObject = stream
    void element.play().catch(() => {})
    return () => {
      element.srcObject = null
    }
  }, [stream])

  if (!stream) return null
  return <audio ref={ref} autoPlay playsInline />
}
