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
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  PhoneOffIcon,
  RadioIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  UsersIcon,
  Volume2Icon,
} from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
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

export function VoicePanel({ room }: { room: RoomWithPermissions }) {
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

  // Screen share & Stage states
  const [autoShareScreen, setAutoShareScreen] = useState(false)
  const [theaterMode, setTheaterMode] = useState(false)
  const [stageRequests, setStageRequests] = useState<StageRequest[]>([])
  const [stageRole, setStageRole] = useState<'host' | 'speaker' | 'audience'>(() => {
    if (room.owner_id === user?.id) return 'host'
    if (canModerate) return 'host'
    if (isStage) return 'audience'
    return 'speaker'
  })

  // Auto screen-share on connect if enabled
  useEffect(() => {
    if (connected && autoShareScreen && !voice.isScreenSharing) {
      void voice.startScreenShare()
    }
  }, [connected, autoShareScreen, voice])

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

  // ── INVITATION / DISCONNECTED STATE ──
  if (!connected && !pending) {
    return (
      <section className={styles.panel}>
        <div className={styles.invite}>
          <span className={styles.inviteMark} aria-hidden>
            {isStage ? <RadioIcon size={20} /> : <HeadphonesIcon size={20} />}
          </span>
          <div className={styles.inviteText}>
            <div className={styles.inviteTitle}>
              {inOtherRoom
                ? `Currently connected in ${voice.activeRoomName || 'another room'}`
                : isCurrentRoom && voice.status === 'failed'
                  ? 'Voice disconnected'
                  : isStage
                    ? 'Discord-Style Live Stage'
                    : 'Voice & Screen Share Hangout'}
            </div>
            <p className={styles.inviteHint}>
              {inOtherRoom
                ? 'Joining this room will switch your voice connection here.'
                : isStage
                  ? 'Listen in as audience, or request to speak and share your screen on stage.'
                  : canSpeak
                    ? 'Join to talk, broadcast audio, or share your screen.'
                    : 'You can listen in this room, but not speak.'}
            </p>
          </div>

          <div className={styles.inviteActions}>
            <label className={styles.autoShareCheck}>
              <input
                type="checkbox"
                checked={autoShareScreen}
                onChange={(e) => setAutoShareScreen(e.target.checked)}
              />
              <span>Auto-Share Screen on Join</span>
            </label>

            <Button
              onClick={() => void voice.join(room.name, room.community_id ?? undefined)}
              style={{ background: inOtherRoom ? 'var(--color-accent)' : undefined }}
            >
              <MicIcon size={16} />
              {inOtherRoom ? 'Switch to this room' : isStage ? 'Join Stage' : 'Join Voice'}
            </Button>
          </div>
        </div>

        {isCurrentRoom && voice.error && <Callout tone="danger">{voice.error}</Callout>}
      </section>
    )
  }

  // ── CONNECTED LIVE STAGE / VOICE ROOM ──
  return (
    <section className={cx(styles.panel, styles.live, isStage && styles.stageMode)}>
      {/* Stage Top Status Bar */}
      <div className={styles.bar}>
        <Badge tone={connected ? 'mint' : 'neutral'} dot={connected}>
          {connected ? (isStage ? 'Stage Live' : 'Live') : statusLabel(voice.status)}
        </Badge>

        <span className={styles.headcount}>
          <UsersIcon size={13} />
          {headcount} {headcount === 1 ? 'person' : 'people'}
        </span>

        {isStage && (
          <span className={styles.stageTopicTag}>
            <RadioIcon size={13} />
            {room.topic || room.name}
          </span>
        )}

        {pending && <Spinner />}

        <div className={styles.spacer} />

        {/* Mute Mic Button */}
        <Tooltip content={voice.muted ? 'Unmute Mic' : 'Mute Mic'}>
          <Button
            variant={voice.muted ? 'danger' : 'secondary'}
            size="sm"
            round
            onClick={voice.toggleMute}
            disabled={!connected || (!canSpeak && !isUserSpeaker)}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={voice.muted}
          >
            {voice.muted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
            <span>{voice.muted ? 'Muted' : 'Unmuted'}</span>
          </Button>
        </Tooltip>

        {/* Screen Share Button */}
        <Tooltip content={voice.isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}>
          <Button
            variant={voice.isScreenSharing ? 'primary' : 'secondary'}
            size="sm"
            round
            onClick={() => void voice.toggleScreenShare()}
            disabled={!connected}
            aria-label="Toggle screen share"
          >
            {voice.isScreenSharing ? <ScreenShareOffIcon size={15} /> : <ScreenShareIcon size={15} />}
            <span>{voice.isScreenSharing ? 'Sharing Screen' : 'Share Screen'}</span>
          </Button>
        </Tooltip>

        {/* Stage Raise Hand button (for audience or speaker) */}
        {isStage && (
          <Tooltip content={voice.handRaised ? 'Lower Hand' : 'Raise Hand to Speak'}>
            <Button
              variant={voice.handRaised ? 'primary' : 'secondary'}
              size="sm"
              round
              onClick={handleToggleRaiseHand}
            >
              <HandIcon size={15} />
              <span>{voice.handRaised ? 'Hand Raised ✋' : 'Raise Hand'}</span>
            </Button>
          </Tooltip>
        )}

        {/* Theater view toggle if screen is active */}
        {activeScreenStream && (
          <Tooltip content={theaterMode ? 'Exit Theater Mode' : 'Theater Mode'}>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              round
              onClick={() => setTheaterMode((t) => !t)}
              aria-label="Toggle theater mode"
            >
              {theaterMode ? <MinimizeIcon size={15} /> : <MaximizeIcon size={15} />}
            </Button>
          </Tooltip>
        )}

        {/* Leave Button */}
        <Tooltip content={isStage ? 'Leave Stage' : 'Leave Voice'}>
          <Button
            variant="danger"
            size="sm"
            iconOnly
            round
            onClick={() => void voice.leave()}
            aria-label="Disconnect"
          >
            <PhoneOffIcon size={15} />
          </Button>
        </Tooltip>
      </div>

      {!canSpeak && !isUserSpeaker && (
        <Callout>You are in the audience. Raise your hand to request speaking on stage.</Callout>
      )}
      {voice.error && <Callout tone="danger">{voice.error}</Callout>}

      {/* ── STAGE PRESENTATION SCREEN VIEWER ── */}
      {activeScreenStream && (
        <div className={cx(styles.screenViewerCard, theaterMode && styles.theaterScreen)}>
          <div className={styles.screenViewerHeader}>
            <div className={styles.screenViewerTitle}>
              <ScreenShareIcon size={15} />
              <span>
                {voice.isScreenSharing
                  ? 'You are sharing your screen'
                  : `${activeScreenParticipant?.displayName ?? 'Speaker'}'s Screen`}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              onClick={() => setTheaterMode((t) => !t)}
            >
              {theaterMode ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
            </Button>
          </div>

          <div className={styles.videoWrap}>
            <ScreenVideo stream={activeScreenStream} />
          </div>
        </div>
      )}

      {/* ── MODERATOR RAISED HANDS QUEUE (FOR STAGE HOSTS) ── */}
      {isStage && (stageRole === 'host' || canModerate) && stageRequests.length > 0 && (
        <div className={styles.requestsCard}>
          <div className={styles.requestsTitle}>
            <HandIcon size={15} />
            <span>Raised Hands ({stageRequests.length})</span>
          </div>
          <div className={styles.requestsList}>
            {stageRequests.map((req) => (
              <div key={req.userId} className={styles.requestItem}>
                <Avatar name={req.displayName} src={req.avatar} size="sm" />
                <span className={styles.requestName}>{req.displayName}</span>
                <Button size="sm" onClick={() => handleApproveSpeaker(req)}>
                  Invite to Stage
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DISCORD-LIKE STAGE PODIUM / SPEAKERS AREA ── */}
      <div className={styles.stageSection}>
        <div className={styles.sectionHeading}>
          <span>{isStage ? '🎙️ Speakers on Stage' : 'Active Participants'}</span>
          <Badge tone="mint">
            {(isUserSpeaker ? 1 : 0) + speakerParticipants.length}
          </Badge>
        </div>

        <div className={styles.stageGrid}>
          {isUserSpeaker && (
            <SpeakerTile
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

          {speakerParticipants.map((participant) => (
            <SpeakerTile
              key={participant.id}
              name={participant.displayName}
              speaking={participant.speaking}
              muted={participant.muted}
              role={participant.stageRole ?? 'speaker'}
              screenSharing={Boolean(participant.screenSharing)}
            >
              <RemoteAudio stream={participant.stream} />
            </SpeakerTile>
          ))}

          {!isUserSpeaker && speakerParticipants.length === 0 && (
            <p className={styles.alone}>The stage is currently quiet.</p>
          )}
        </div>
      </div>

      {/* ── AUDIENCE SECTION (FOR STAGE ROOMS) ── */}
      {isStage && (
        <div className={styles.audienceSection}>
          <div className={styles.sectionHeading}>
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
                <span className={styles.audienceName}>You (Audience)</span>
                {voice.handRaised && <span className={styles.handBadge}>✋</span>}
              </div>
            )}

            {audienceParticipants.map((participant) => (
              <div key={participant.id} className={styles.audienceTile}>
                <Avatar name={participant.displayName} size="md" />
                <span className={styles.audienceName}>{participant.displayName}</span>
                {participant.handRaised && <span className={styles.handBadge}>✋</span>}
                <RemoteAudio stream={participant.stream} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function SpeakerTile({
  name,
  avatar,
  accent,
  speaking,
  muted,
  role,
  screenSharing,
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
  you?: boolean
  onStepDown?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className={cx(styles.speakerCard, speaking && styles.speakerSpeaking)}>
      <div className={styles.avatarWrapper}>
        <Avatar name={name} src={avatar} color={accent} size="xl" speaking={speaking} />
        {speaking && <div className={styles.speakingWaveRing} />}
      </div>

      <div className={styles.speakerDetails}>
        <div className={styles.speakerNameRow}>
          <span className={styles.speakerName}>{you ? `${name} (You)` : name}</span>
          {role === 'host' && (
            <span className={styles.roleBadge} title="Stage Host">
              <CrownIcon size={12} />
              Host
            </span>
          )}
          {screenSharing && (
            <span className={styles.sharingTag} title="Sharing screen">
              <ScreenShareIcon size={11} />
              Live
            </span>
          )}
        </div>

        <div className={styles.speakerStatusRow}>
          {muted ? (
            <span className={styles.mutedTag}>
              <MicOffIcon size={11} />
              Muted
            </span>
          ) : speaking ? (
            <span className={styles.speakingTag}>
              <Volume2Icon size={11} />
              Speaking
            </span>
          ) : (
            <span className={styles.idleTag}>Listening</span>
          )}
        </div>

        {you && onStepDown && (
          <button type="button" className={styles.stepDownBtn} onClick={onStepDown}>
            Move to Audience
          </button>
        )}
      </div>

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
  return <video ref={videoRef} autoPlay playsInline muted className={styles.videoElement} />
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

function statusLabel(status: string): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'failed':
      return 'Disconnected'
    default:
      return 'Not connected'
  }
}
