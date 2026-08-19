import type { MediaJoinResponse } from '@/lib/api'

import {
  CloseCode,
  PROTOCOL_VERSION,
  isRetryableClose,
  type ClientMessage,
  type ParticipantInfo,
  type ServerMessage,
} from './protocol'

export type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export interface RemoteParticipant {
  id: string
  userId: string
  displayName: string
  muted: boolean
  speaking: boolean
  /** Populated once the SFU starts forwarding this participant's audio. */
  stream: MediaStream | null
}

export interface VoiceState {
  status: VoiceStatus
  selfId: string | null
  participants: RemoteParticipant[]
  muted: boolean
  speaking: boolean
  error: string | null
}

/** Fetches a fresh media session. Called again on every reconnect, because a
 *  media token is only valid for about two minutes. */
export type SessionFactory = () => Promise<MediaJoinResponse>

const INITIAL_STATE: VoiceState = {
  status: 'idle',
  selfId: null,
  participants: [],
  muted: true,
  speaking: false,
  error: null,
}

const MAX_RECONNECT_ATTEMPTS = 5

/**
 * A voice-room connection.
 *
 * Framework-agnostic on purpose: React binds to it through `useVoiceRoom`, but
 * nothing here knows about React, which keeps the WebRTC state machine out of
 * render cycles and effect ordering.
 *
 * ## Two peer connections
 *
 * `publisher` sends this user's microphone up; the **client** offers on it.
 * `subscriber` receives everyone else; the **server** offers on it. One offerer
 * per connection means glare cannot happen — see `docs/media-protocol.md`.
 */
export class VoiceClient {
  private socket: WebSocket | null = null
  private publisher: RTCPeerConnection | null = null
  private subscriber: RTCPeerConnection | null = null

  private localStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private vadFrame: number | null = null

  private state: VoiceState = INITIAL_STATE
  private readonly listeners = new Set<(state: VoiceState) => void>()

  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Set when the user asked to leave, so teardown is not mistaken for a drop. */
  private closing = false

  private readonly createSession: SessionFactory

  constructor(createSession: SessionFactory) {
    this.createSession = createSession
  }

  // ── public API ──────────────────────────────────────────────────────────

  subscribe(listener: (state: VoiceState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState(): VoiceState {
    return this.state
  }

  async join(): Promise<void> {
    if (this.state.status !== 'idle' && this.state.status !== 'failed') return
    this.closing = false
    this.reconnectAttempts = 0
    await this.connect()
  }

  async leave(): Promise<void> {
    this.closing = true
    this.clearReconnect()
    this.send({ type: 'leave' })
    this.teardown()
    this.patch({ ...INITIAL_STATE })
  }

  setMuted(muted: boolean): void {
    // Disabling the track stops audio at the source, so nothing leaves the
    // machine — a server-side flag alone would not be a real mute.
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted
    }
    this.send({ type: 'mute', muted })
    if (muted) {
      this.send({ type: 'speaking', speaking: false })
      this.patch({ muted, speaking: false })
    } else {
      this.patch({ muted })
    }
  }

  // ── connection ──────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    this.patch({
      status: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      error: null,
    })

    let session: MediaJoinResponse
    try {
      session = await this.createSession()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Could not join the room')
      return
    }

    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        // Join muted; unmuting is an explicit act.
        for (const track of this.localStream.getAudioTracks()) track.enabled = false
      }
    } catch {
      this.fail('Microphone permission is required to join a voice room')
      return
    }

    this.openSocket(session)
  }

  private openSocket(session: MediaJoinResponse): void {
    const socket = new WebSocket(session.media_url)
    this.socket = socket

    socket.addEventListener('open', () => {
      this.send({
        type: 'join',
        room_id: session.room_id,
        token: session.token,
      })
    })

    socket.addEventListener('message', (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }
      void this.handle(message, session)
    })

    socket.addEventListener('close', (event) => {
      if (this.closing) return
      this.teardownTransport()

      if (!isRetryableClose(event.code)) {
        this.fail(closeReason(event.code))
        return
      }
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      // `close` always follows; reconnection is decided there so there is one
      // path rather than two racing ones.
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.fail('Lost connection to the voice server')
      return
    }
    this.reconnectAttempts += 1
    // Exponential backoff, capped: 0.5s, 1s, 2s, 4s, 8s.
    const delay = Math.min(500 * 2 ** (this.reconnectAttempts - 1), 8000)
    this.patch({ status: 'reconnecting' })
    this.reconnectTimer = setTimeout(() => void this.connect(), delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ── message handling ────────────────────────────────────────────────────

  private async handle(
    message: ServerMessage,
    session: MediaJoinResponse,
  ): Promise<void> {
    switch (message.type) {
      case 'joined': {
        if (message.protocol_version !== PROTOCOL_VERSION) {
          this.fail('This client is out of date; please reload')
          return
        }
        this.reconnectAttempts = 0
        this.patch({
          status: 'connected',
          selfId: message.participant_id,
          participants: message.participants.map(toRemote),
          error: null,
        })
        await this.negotiate(message.ice_servers ?? session.ice_servers)
        break
      }

      case 'answer':
        await this.publisher?.setRemoteDescription({ type: 'answer', sdp: message.sdp })
        break

      case 'offer': {
        const subscriber = this.subscriber
        if (!subscriber) break
        await subscriber.setRemoteDescription({ type: 'offer', sdp: message.sdp })
        const answer = await subscriber.createAnswer()
        await subscriber.setLocalDescription(answer)
        this.send({ type: 'answer', target: 'subscriber', sdp: answer.sdp ?? '' })
        break
      }

      case 'ice_candidate': {
        const pc = message.target === 'publisher' ? this.publisher : this.subscriber
        try {
          await pc?.addIceCandidate({
            candidate: message.candidate,
            sdpMid: message.sdp_mid ?? null,
            sdpMLineIndex: message.sdp_mline_index ?? null,
          })
        } catch {
          // A candidate can arrive before the description it belongs to.
        }
        break
      }

      case 'event':
        this.applyRoomEvent(message)
        break

      case 'error':
        // Non-fatal by contract: surface it without dropping the call.
        this.patch({ error: message.message })
        break

      case 'pong':
        break
    }
  }

  private applyRoomEvent(message: Extract<ServerMessage, { type: 'event' }>): void {
    const participants = [...this.state.participants]
    const indexOf = (id: string) => participants.findIndex((p) => p.id === id)

    switch (message.event) {
      case 'participant_joined': {
        if (indexOf(message.participant.participant_id) === -1) {
          participants.push(toRemote(message.participant))
        }
        break
      }
      case 'participant_left': {
        const index = indexOf(message.participant_id)
        if (index !== -1) participants.splice(index, 1)
        break
      }
      case 'speaking_started':
      case 'speaking_stopped': {
        const index = indexOf(message.participant_id)
        const existing = participants[index]
        if (existing) {
          participants[index] = {
            ...existing,
            speaking: message.event === 'speaking_started',
          }
        }
        break
      }
      case 'microphone_muted':
      case 'microphone_unmuted': {
        const index = indexOf(message.participant_id)
        const existing = participants[index]
        if (existing) {
          const muted = message.event === 'microphone_muted'
          participants[index] = { ...existing, muted, speaking: muted ? false : existing.speaking }
        }
        break
      }
      default:
        // Track and camera events do not change the voice-only UI.
        return
    }

    this.patch({ participants })
  }

  // ── WebRTC ──────────────────────────────────────────────────────────────

  private async negotiate(iceServers: RTCIceServer[]): Promise<void> {
    // Subscriber first, so the server's offer always has somewhere to land.
    const subscriber = new RTCPeerConnection({ iceServers })
    this.subscriber = subscriber

    subscriber.addEventListener('icecandidate', (event) => {
      if (event.candidate) this.sendCandidate('subscriber', event.candidate)
    })

    subscriber.addEventListener('track', (event) => {
      const participantId = participantIdFromTrack(event)
      if (!participantId) return

      const stream = event.streams[0] ?? new MediaStream([event.track])
      const participants = this.state.participants.map((p) =>
        p.id === participantId ? { ...p, stream } : p,
      )
      this.patch({ participants })
    })

    const publisher = new RTCPeerConnection({ iceServers })
    this.publisher = publisher

    publisher.addEventListener('icecandidate', (event) => {
      if (event.candidate) this.sendCandidate('publisher', event.candidate)
    })

    const track = this.localStream?.getAudioTracks()[0]
    if (!track || !this.localStream) {
      this.fail('No microphone track available')
      return
    }

    // SDP cannot say what a track is for; the server correlates this with the
    // msid in the offer.
    this.send({ type: 'publish_intent', kind: 'audio', client_track_id: track.id })
    publisher.addTrack(track, this.localStream)

    const offer = await publisher.createOffer()
    await publisher.setLocalDescription(offer)
    this.send({ type: 'offer', target: 'publisher', sdp: offer.sdp ?? '' })

    this.startVoiceDetection()
  }

  /**
   * Client-side voice activity detection.
   *
   * The server defaults to trusting the client for this (`MEDIA_VAD_MODE=client`)
   * because measuring it here costs nothing and scales with users rather than
   * with server CPU. Hysteresis matches the server-side detector: a short burst
   * does not trigger, and a pause between words does not clear.
   */
  private startVoiceDetection(): void {
    if (!this.localStream) return

    const context = new AudioContext()
    this.audioContext = context

    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.4
    context.createMediaStreamSource(this.localStream).connect(analyser)

    const samples = new Uint8Array(analyser.frequencyBinCount)
    const THRESHOLD = 0.035
    const RELEASE_MS = 250
    let lastLoudAt = 0
    let speaking = false

    const tick = () => {
      analyser.getByteTimeDomainData(samples)

      // Root mean square around the 128 midpoint of unsigned 8-bit PCM.
      let sum = 0
      for (const sample of samples) {
        const centred = (sample - 128) / 128
        sum += centred * centred
      }
      const level = Math.sqrt(sum / samples.length)

      const now = performance.now()
      const loud = level > THRESHOLD && !this.state.muted

      if (loud) lastLoudAt = now

      const next = loud || (speaking && now - lastLoudAt < RELEASE_MS)
      if (next !== speaking) {
        speaking = next
        this.send({ type: 'speaking', speaking })
        this.patch({ speaking })
      }

      this.vadFrame = requestAnimationFrame(tick)
    }

    this.vadFrame = requestAnimationFrame(tick)
  }

  // ── plumbing ────────────────────────────────────────────────────────────

  private sendCandidate(target: 'publisher' | 'subscriber', candidate: RTCIceCandidate): void {
    this.send({
      type: 'ice_candidate',
      target,
      candidate: candidate.candidate,
      sdp_mid: candidate.sdpMid,
      sdp_mline_index: candidate.sdpMLineIndex,
    })
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private fail(error: string): void {
    this.teardown()
    this.patch({ ...INITIAL_STATE, status: 'failed', error })
  }

  /** Close the transport but keep the microphone, so a reconnect is instant. */
  private teardownTransport(): void {
    if (this.vadFrame !== null) {
      cancelAnimationFrame(this.vadFrame)
      this.vadFrame = null
    }
    void this.audioContext?.close().catch(() => {})
    this.audioContext = null

    this.publisher?.close()
    this.subscriber?.close()
    this.publisher = null
    this.subscriber = null

    if (this.socket) {
      this.socket.onclose = null
      this.socket.close(CloseCode.Normal)
      this.socket = null
    }
  }

  private teardown(): void {
    this.clearReconnect()
    this.teardownTransport()

    for (const track of this.localStream?.getTracks() ?? []) track.stop()
    this.localStream = null
  }

  private patch(partial: Partial<VoiceState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener(this.state)
  }
}

function toRemote(info: ParticipantInfo): RemoteParticipant {
  return {
    id: info.participant_id,
    userId: info.user_id,
    displayName: info.display_name,
    muted: info.audio_muted,
    speaking: false,
    stream: null,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Work out whose audio just arrived.
 *
 * The SFU builds each subscriber track with the publisher's participant id as
 * the media-stream id and `<participant>:<kind>` as the track id, so either can
 * identify the sender. The stream id is checked first because it is the value
 * the server sets deliberately; the track id is the fallback for stacks that
 * renumber msids.
 */
function participantIdFromTrack(event: RTCTrackEvent): string | null {
  const streamId = event.streams[0]?.id
  if (streamId && UUID.test(streamId)) return streamId

  const head = event.track.id.split(':')[0]
  return head && UUID.test(head) ? head : null
}

function closeReason(code: number): string {
  switch (code) {
    case CloseCode.Unauthorized:
      return 'Your session expired. Please try again.'
    case CloseCode.Forbidden:
      return 'You do not have permission to join this room.'
    case CloseCode.RoomFull:
      return 'This room is full.'
    case CloseCode.RateLimited:
      return 'Too many requests. Please wait a moment.'
    default:
      return 'Disconnected from the voice server.'
  }
}
