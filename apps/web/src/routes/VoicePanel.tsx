import { useEffect, useRef } from 'react'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { HeadphonesIcon, MicIcon, MicOffIcon, PhoneOffIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import type { RoomWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useVoiceRoom } from '@/lib/media'
import { can } from '@/lib/permissions'

import styles from './VoicePanel.module.css'

/**
 * The live half of a voice or video room.
 *
 * Two states, and they look nothing alike: an invitation to join, and a stage
 * of participants. Collapsing both into one persistent control strip is what
 * makes most voice UIs feel like a settings panel.
 */
export function VoicePanel({ room }: { room: RoomWithPermissions }) {
  const { user } = useAuth()
  const voice = useVoiceRoom(room.id)

  const canSpeak = can(room.your_permissions, 'speak')
  const connected = voice.status === 'connected'
  const pending = voice.status === 'connecting' || voice.status === 'reconnecting'
  const headcount = voice.participants.length + 1

  if (!connected && !pending) {
    return (
      <section className={styles.panel}>
        <div className={styles.invite}>
          <span className={styles.inviteMark} aria-hidden>
            <HeadphonesIcon size={20} />
          </span>
          <div className={styles.inviteText}>
            <div className={styles.inviteTitle}>
              {voice.status === 'failed' ? 'Voice disconnected' : 'Voice is open here'}
            </div>
            <p className={styles.inviteHint}>
              {canSpeak
                ? 'Join to talk with everyone in this room.'
                : 'You can listen in this room, but not speak.'}
            </p>
          </div>
          <Button onClick={() => void voice.join()}>
            <MicIcon size={16} />
            Join voice
          </Button>
        </div>

        {voice.error && <Callout tone="danger">{voice.error}</Callout>}
      </section>
    )
  }

  return (
    <section className={cx(styles.panel, styles.live)}>
      <div className={styles.bar}>
        <Badge tone={connected ? 'success' : 'neutral'} dot={connected}>
          {connected ? 'Live' : statusLabel(voice.status)}
        </Badge>
        <span className={styles.headcount}>
          {headcount} {headcount === 1 ? 'person' : 'people'}
        </span>
        {pending && <Spinner />}

        <div className={styles.spacer} />

        <Tooltip content={voice.muted ? 'Unmute' : 'Mute'}>
          <Button
            variant={voice.muted ? 'danger' : 'secondary'}
            size="sm"
            iconOnly
            round
            onClick={voice.toggleMute}
            disabled={!connected || !canSpeak}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={voice.muted}
          >
            {voice.muted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
          </Button>
        </Tooltip>

        <Tooltip content="Leave voice">
          <Button
            variant="danger"
            size="sm"
            iconOnly
            round
            onClick={() => void voice.leave()}
            aria-label="Leave voice"
          >
            <PhoneOffIcon size={16} />
          </Button>
        </Tooltip>
      </div>

      {!canSpeak && <Callout>You can listen in this room, but not speak.</Callout>}
      {voice.error && <Callout tone="danger">{voice.error}</Callout>}

      <div className={styles.stage}>
        <ParticipantTile
          name={user?.profile.display_name ?? 'You'}
          avatar={user?.profile.avatar_url}
          accent={user?.profile.accent_color}
          speaking={voice.speaking}
          muted={voice.muted}
          you
        />

        {voice.participants.map((participant) => (
          <ParticipantTile
            key={participant.id}
            name={participant.displayName}
            speaking={participant.speaking}
            muted={participant.muted}
          >
            {/* One audio element per remote stream. Rendering it here rather
                than appending to <body> means it is removed automatically
                when the participant leaves. */}
            <RemoteAudio stream={participant.stream} />
          </ParticipantTile>
        ))}

        {voice.participants.length === 0 && (
          <p className={styles.alone}>You are the only one here so far.</p>
        )}
      </div>
    </section>
  )
}

function ParticipantTile({
  name,
  avatar,
  accent,
  speaking,
  muted,
  you,
  children,
}: {
  name: string
  avatar?: string | null
  accent?: string | null
  speaking: boolean
  muted: boolean
  you?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cx(styles.tile, speaking && styles.tileSpeaking)}>
      <Avatar name={name} src={avatar} color={accent} size="lg" speaking={speaking} />
      <span className={styles.tileName}>{you ? 'You' : name}</span>
      {muted && (
        <span className={styles.tileMuted} aria-label="Muted">
          <MicOffIcon size={12} />
        </span>
      )}
      {children}
    </div>
  )
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !stream) return
    element.srcObject = stream
    // Autoplay is permitted here because joining the room was a user gesture;
    // the catch keeps a rejected promise from becoming an unhandled rejection.
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
