import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout, EmptyState } from '@/components/Callout'
import { LoadingPanel, Spinner } from '@/components/Spinner'
import {
  ApiError,
  messages as messagesApi,
  rooms as roomsApi,
  type Message,
  type RoomWithPermissions,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useVoiceRoom } from '@/lib/media'
import { useAsync } from '@/lib/useAsync'
import { useProfiles } from '@/lib/useProfiles'

import styles from './RoomRoute.module.css'

/** How often chat history is re-fetched.
 *
 *  Messages have no realtime transport yet — the signalling socket carries
 *  media events only — so this polls. It is the one place in the app that does,
 *  and the interval is deliberately visible rather than buried. */
const MESSAGE_POLL_MS = 5000

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
      <div className={styles.room}>
        <div style={{ padding: 'var(--space-5)' }}>
          <Callout tone="danger">{room.error}</Callout>
        </div>
      </div>
    )
  }
  if (!room.data) return null

  // Keyed on the room id so switching rooms resets chat and voice state
  // rather than carrying it across.
  return <RoomView key={roomId} room={room.data} />
}

function RoomView({ room }: { room: RoomWithPermissions }) {
  const isMediaRoom = room.room_type !== 'text'

  return (
    <div className={styles.room}>
      <header className={styles.header}>
        <div>
          <div className={styles.roomName}>{room.name}</div>
          {room.topic && <div className={styles.topic}>{room.topic}</div>}
        </div>
        <div className={styles.spacer} />
        <span className={styles.topic}>{room.room_type}</span>
      </header>

      {isMediaRoom && <VoicePanel room={room} />}

      <Chat room={room} />
    </div>
  )
}

// ── voice ──────────────────────────────────────────────────────────────────

function VoicePanel({ room }: { room: RoomWithPermissions }) {
  const voice = useVoiceRoom(room.id)
  const canSpeak = room.your_permissions.includes('speak')

  const connected = voice.status === 'connected'
  const pending = voice.status === 'connecting' || voice.status === 'reconnecting'

  return (
    <section className={styles.voice}>
      <div className={styles.voiceBar}>
        {!connected && !pending && (
          <Button onClick={() => void voice.join()} disabled={!canSpeak && false}>
            Join voice
          </Button>
        )}

        {(connected || pending) && (
          <>
            <Button variant="secondary" onClick={() => void voice.leave()}>
              Leave
            </Button>
            <Button
              variant={voice.muted ? 'primary' : 'ghost'}
              onClick={voice.toggleMute}
              disabled={!connected || !canSpeak}
            >
              {voice.muted ? 'Unmute' : 'Mute'}
            </Button>
          </>
        )}

        <span className={styles.status}>
          <span
            className={cx(
              styles.dot,
              connected && styles.dotConnected,
              pending && styles.dotPending,
              voice.status === 'failed' && styles.dotFailed,
            )}
          />
          {statusLabel(voice.status)}
          {pending && <Spinner />}
        </span>
      </div>

      {!canSpeak && (
        <Callout>You can listen in this room, but not speak.</Callout>
      )}
      {voice.error && <Callout tone="danger">{voice.error}</Callout>}

      {connected && (
        <div className={styles.participants}>
          <div className={styles.participant}>
            <Avatar name="You" speaking={voice.speaking} />
            <span className={styles.participantName}>You</span>
            {voice.muted && <span className={styles.mutedTag}>muted</span>}
          </div>

          {voice.participants.map((participant) => (
            <div key={participant.id} className={styles.participant}>
              <Avatar
                name={participant.displayName}
                speaking={participant.speaking}
              />
              <span className={styles.participantName}>
                {participant.displayName}
              </span>
              {participant.muted && <span className={styles.mutedTag}>muted</span>}
              {/* One audio element per remote stream. Rendering it here rather
                  than appending to <body> means it is removed automatically
                  when the participant leaves. */}
              <RemoteAudio stream={participant.stream} />
            </div>
          ))}

          {voice.participants.length === 0 && (
            <EmptyState>Nobody else is here yet.</EmptyState>
          )}
        </div>
      )}
    </section>
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

// ── chat ───────────────────────────────────────────────────────────────────

function Chat({ room }: { room: RoomWithPermissions }) {
  const { getToken } = useAuth()
  const [items, setItems] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const canSend = room.your_permissions.includes('send_message')
  const listRef = useRef<HTMLDivElement>(null)

  const lookup = useProfiles([...new Set(items.map((m) => m.author_id))])

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const page = await messagesApi.history(await getToken(), room.id)
        if (cancelled) return
        // The API returns newest-first; the UI reads oldest-first.
        setItems([...page.messages].reverse())
      } catch {
        // A transient failure should not blank the transcript.
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), MESSAGE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [getToken, room.id])

  // Stick to the bottom as new messages arrive.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [items.length])

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return

    setSending(true)
    setError(null)
    try {
      const posted = await messagesApi.post(await getToken(), room.id, content)
      setDraft('')
      setItems((current) => [...current, posted])
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className={styles.messages} ref={listRef}>
        {items.length === 0 && <EmptyState>No messages yet. Say hello.</EmptyState>}

        {items.map((message) => {
          const author = lookup(message.author_id)
          const name = author?.display_name ?? 'Unknown'
          return (
            <article key={message.id} className={styles.message}>
              <Avatar name={name} src={author?.avatar_url} size="sm" />
              <div className={styles.messageBody}>
                <div className={styles.messageHeader}>
                  <span className={styles.author}>{name}</span>
                  <time className={styles.time} dateTime={message.created_at}>
                    {formatTime(message.created_at)}
                  </time>
                </div>
                <div className={styles.content}>{message.content}</div>
              </div>
            </article>
          )
        })}
      </div>

      {error && (
        <div style={{ padding: '0 var(--space-5)' }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {canSend ? (
        <form className={styles.composer} onSubmit={send}>
          <input
            className={styles.composerInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${room.name}`}
            aria-label={`Message ${room.name}`}
            maxLength={4000}
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending && <Spinner />}
            Send
          </Button>
        </form>
      ) : (
        <p className={styles.readOnly}>You cannot post in this room.</p>
      )}
    </>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
