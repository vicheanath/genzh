import { useEffect, useMemo, useRef, useState } from 'react'

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
  MonitorIcon,
  PhoneOffIcon,
  RadioIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  UsersIcon,
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

/** One screen currently being shared into the room. */
interface Presentation {
  /** The presenter's participant id, or `self` for this user's own share. */
  key: string
  name: string
  isSelf: boolean
  /** Null while the flag has arrived but the SFU is still wiring up the track. */
  stream: MediaStream | null
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
  const canShare = can(room.your_permissions, 'screen_share')
  const canModerate = can(room.your_permissions, 'manage_room')
  const isCurrentRoom = voice.isCurrent
  const connected = isCurrentRoom && voice.status === 'connected'
  const pending = isCurrentRoom && (voice.status === 'connecting' || voice.status === 'reconnecting')
  const inOtherRoom = Boolean(voice.activeRoomId && voice.activeRoomId !== room.id)
  const headcount = isCurrentRoom ? voice.participants.length + 1 : 0

  const [theaterRequested, setTheaterRequested] = useState(false)
  const [stageRequests, setStageRequests] = useState<StageRequest[]>([])
  const [stageRole, setStageRole] = useState<'host' | 'speaker' | 'audience'>(() => {
    if (room.owner_id === user?.id) return 'host'
    if (canModerate) return 'host'
    if (isStage) return 'audience'
    return 'speaker'
  })

  // Which share is on the big screen. Null means "whichever started first",
  // so a room with one presenter never asks the user to choose.
  const [pinnedPresenter, setPinnedPresenter] = useState<string | null>(null)

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

  // Everyone presenting right now, this user included. More than one person can
  // share at once — the SFU has no notion of "the" presenter — so the panel
  // shows one and offers the rest as a switcher rather than picking silently.
  const presentations = useMemo<Presentation[]>(() => {
    const list: Presentation[] = []
    if (voice.isScreenSharing) {
      list.push({ key: 'self', name: 'Your screen', isSelf: true, stream: voice.screenStream })
    }
    for (const participant of voice.participants) {
      if (!participant.screenSharing) continue
      list.push({
        key: participant.id,
        name: `${participant.displayName}'s screen`,
        isSelf: false,
        stream: participant.screenStream ?? null,
      })
    }
    return list
  }, [voice.isScreenSharing, voice.screenStream, voice.participants])

  const activePresentation =
    presentations.find((item) => item.key === pinnedPresenter) ?? presentations[0] ?? null

  // Derived rather than stored, so the last share ending drops the user out of
  // theater mode instead of stranding them fullscreen on nothing.
  const theaterMode = theaterRequested && activePresentation !== null

  // Separate speakers and audience for the stage layout
  const isUserSpeaker = stageRole === 'host' || stageRole === 'speaker'
  const speakerParticipants = voice.participants.filter(
    (p) => !isStage || p.stageRole === 'speaker' || p.stageRole === 'host' || p.screenSharing,
  )
  const audienceParticipants = voice.participants.filter(
    (p) => isStage && p.stageRole === 'audience' && !p.screenSharing,
  )

  // ── NOT CONNECTED: THE DOOR ──
  if (!connected && !pending) {
    return (
      <section className={styles.lobbyPanel}>
        <div className={styles.lobbyCard}>
          <div className={styles.lobbyIconWrap}>
            {isStage ? <RadioIcon size={34} /> : <HeadphonesIcon size={34} />}
          </div>

          <h2 className={styles.lobbyTitle}>
            {inOtherRoom
              ? `You're in ${voice.activeRoomName || 'another room'}`
              : isStage
                ? 'Live stage'
                : 'Voice & screen'}
          </h2>

          <p className={styles.lobbySubtitle}>
            {inOtherRoom
              ? 'Joining here moves your connection over from the room you are in now.'
              : isStage
                ? 'Listen in from the audience, or raise a hand to join the speakers and present.'
                : 'Drop in for voice, and share a screen when you have something to show.'}
          </p>

          <Button
            size="lg"
            onClick={() => void voice.join(room.name, room.community_id ?? undefined)}
            className={styles.joinBtn}
          >
            <MicIcon size={18} />
            <span>{inOtherRoom ? 'Move me here' : isStage ? 'Join stage' : 'Join voice'}</span>
          </Button>

          {isCurrentRoom && voice.error && <Callout tone="danger">{voice.error}</Callout>}
        </div>
      </section>
    )
  }

  // ── CONNECTED: THE STAGE ──
  return (
    <section className={cx(styles.stageViewport, theaterMode && styles.theaterFullscreen)}>
      <div className={styles.viewportHeader}>
        <div className={styles.viewportHeaderLeft}>
          <Badge tone={connected ? 'mint' : 'neutral'} dot={connected}>
            {connected ? (isStage ? 'On air' : 'Connected') : 'Connecting'}
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
        </div>

        <div className={styles.viewportHeaderRight}>
          {activePresentation && (
            <Tooltip content={theaterMode ? 'Exit theater' : 'Theater mode'}>
              <button
                type="button"
                className={styles.headerIconBtn}
                onClick={() => setTheaterRequested((t) => !t)}
                aria-label="Toggle theater mode"
                aria-pressed={theaterMode}
              >
                {theaterMode ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
              </button>
            </Tooltip>
          )}

          {onToggleChat && (
            <Tooltip content={isChatOpen ? 'Hide chat' : 'Show chat'}>
              <button
                type="button"
                className={cx(styles.headerIconBtn, isChatOpen && styles.headerIconBtnActive)}
                onClick={onToggleChat}
                aria-label="Toggle chat"
                aria-pressed={isChatOpen}
              >
                <MessageSquareIcon size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {voice.error && (
        <div className={styles.errorSlot}>
          <Callout tone="danger">{voice.error}</Callout>
        </div>
      )}

      <div className={styles.viewportBody}>
        {activePresentation ? (
          <div className={styles.presentationView}>
            {presentations.length > 1 && (
              <div className={styles.presenterSwitcher} role="tablist" aria-label="Shared screens">
                {presentations.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={item.key === activePresentation.key}
                    className={cx(
                      styles.presenterChip,
                      item.key === activePresentation.key && styles.presenterChipActive,
                    )}
                    onClick={() => setPinnedPresenter(item.key)}
                  >
                    <MonitorIcon size={13} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className={styles.screenVideoCard}>
              <div className={styles.liveTagOverlay}>
                <span className={styles.liveTag}>Live</span>
                <span className={styles.liveSpeakerName}>{activePresentation.name}</span>
              </div>

              {activePresentation.stream ? (
                <ScreenVideo stream={activePresentation.stream} />
              ) : (
                // The `screen_share` flag beats the media to the client, so
                // this covers the second or two before the first frame.
                <div className={styles.screenPending}>
                  <Spinner />
                  <span>Waiting for {activePresentation.name.toLowerCase()}…</span>
                </div>
              )}
            </div>

            <div className={styles.participantStrip}>
              {isUserSpeaker && (
                <VoiceTile
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
                <VoiceTile
                  key={p.id}
                  name={p.displayName}
                  speaking={p.speaking}
                  muted={p.muted}
                  screenSharing={Boolean(p.screenSharing)}
                  compact
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.stageGridArea}>
            {isStage && (stageRole === 'host' || canModerate) && stageRequests.length > 0 && (
              <div className={styles.requestsCard}>
                <div className={styles.requestsTitle}>
                  <HandIcon size={14} />
                  <span>Hands up ({stageRequests.length})</span>
                </div>
                <div className={styles.requestsList}>
                  {stageRequests.map((req) => (
                    <div key={req.userId} className={styles.requestItem}>
                      <Avatar name={req.displayName} src={req.avatar} size="xs" />
                      <span className={styles.requestName}>{req.displayName}</span>
                      <Button size="sm" onClick={() => handleApproveSpeaker(req)}>
                        Bring up
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.gridSection}>
              {isStage && (
                <div className={styles.sectionHeader}>
                  <span>
                    On stage ({(isUserSpeaker ? 1 : 0) + speakerParticipants.length})
                  </span>
                </div>
              )}

              <div className={styles.voiceGrid}>
                {isUserSpeaker && (
                  <VoiceTile
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
                  <VoiceTile
                    key={p.id}
                    name={p.displayName}
                    speaking={p.speaking}
                    muted={p.muted}
                    role={p.stageRole ?? 'speaker'}
                    screenSharing={Boolean(p.screenSharing)}
                  />
                ))}
              </div>
            </div>

            {isStage && (
              <div className={styles.audienceSection}>
                <div className={styles.sectionHeader}>
                  <span>Listening ({(!isUserSpeaker ? 1 : 0) + audienceParticipants.length})</span>
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The controls float over the stage rather than sitting in a bar, so the
          shared screen keeps the full height of the viewport. */}
      <div className={styles.floatingControlsContainer}>
        <div className={styles.floatingControlsPill}>
          <Tooltip content={voice.muted ? 'Unmute' : 'Mute'}>
            <button
              type="button"
              className={cx(styles.controlBtn, voice.muted && styles.controlBtnDanger)}
              onClick={voice.toggleMute}
              disabled={!connected || (!canSpeak && !isUserSpeaker)}
              aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
              aria-pressed={!voice.muted}
            >
              {voice.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
          </Tooltip>

          <Tooltip
            content={
              !canShare
                ? 'You do not have permission to share here'
                : voice.isScreenSharing
                  ? 'Stop sharing'
                  : 'Share your screen'
            }
          >
            {/* Wrapped so the tooltip still fires while the button is disabled —
                "why can't I click this" is the case that needs the explanation. */}
            <span className={styles.controlSlot}>
              <button
                type="button"
                className={cx(styles.controlBtn, voice.isScreenSharing && styles.controlBtnActive)}
                onClick={() => void voice.toggleScreenShare()}
                disabled={!connected || !canShare}
                aria-label="Share your screen"
                aria-pressed={voice.isScreenSharing}
              >
                {voice.isScreenSharing ? (
                  <ScreenShareOffIcon size={20} />
                ) : (
                  <ScreenShareIcon size={20} />
                )}
              </button>
            </span>
          </Tooltip>

          {isStage && (
            <Tooltip content={voice.handRaised ? 'Lower hand' : 'Raise hand'}>
              <button
                type="button"
                className={cx(styles.controlBtn, voice.handRaised && styles.controlBtnActive)}
                onClick={handleToggleRaiseHand}
                aria-label="Raise hand"
                aria-pressed={voice.handRaised}
              >
                <HandIcon size={20} />
              </button>
            </Tooltip>
          )}

          {onToggleChat && (
            <Tooltip content={isChatOpen ? 'Hide chat' : 'Show chat'}>
              <button
                type="button"
                className={cx(styles.controlBtn, isChatOpen && styles.controlBtnActive)}
                onClick={onToggleChat}
                aria-label="Toggle chat"
                aria-pressed={isChatOpen}
              >
                <MessageSquareIcon size={20} />
              </button>
            </Tooltip>
          )}

          <Tooltip content="Leave">
            <button
              type="button"
              className={cx(styles.controlBtn, styles.controlBtnDisconnect)}
              onClick={() => void voice.leave()}
              aria-label="Leave the room"
            >
              <PhoneOffIcon size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
    </section>
  )
}

/**
 * One person in the room.
 *
 * Deliberately not a video tile: audio playback lives in one place at the app
 * root (`GlobalAudioOutputs`) so it survives navigation, and a second `<audio>`
 * here would play every remote stream twice.
 */
function VoiceTile({
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
        <span className={styles.tileNameText}>{you ? `${name} (you)` : name}</span>
        {role === 'host' && (
          <span className={styles.crownTag} title="Host">
            <CrownIcon size={11} />
          </span>
        )}
        {screenSharing && <span className={styles.livePill}>Live</span>}
        {muted && (
          <span className={styles.mutedPill} title="Muted">
            <MicOffIcon size={12} />
          </span>
        )}
      </div>

      {you && onStepDown && (
        <button type="button" className={styles.stepDownLink} onClick={onStepDown}>
          Step down
        </button>
      )}
    </div>
  )
}

function ScreenVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    // Autoplay can still be refused; the element stays in the DOM with its
    // controls so the viewer can start it by hand.
    void video.play().catch(() => {})
    return () => {
      video.srcObject = null
    }
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      // A shared screen carries no audio on this SFU, and an unmuted video
      // element would block autoplay for no benefit.
      muted
      className={styles.screenVideoElement}
    />
  )
}
