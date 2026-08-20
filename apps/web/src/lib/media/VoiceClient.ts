import type { MediaJoinResponse } from '@/lib/api'

import {
  CloseCode,
  PROTOCOL_VERSION,
  isRetryableClose,
  type ClientMessage,
  type ParticipantInfo,
  type ServerMessage,
  type TrackInfo,
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
  screenSharing?: boolean
  handRaised?: boolean
  stageRole?: 'host' | 'speaker' | 'audience'
  /** Populated once the SFU starts forwarding this participant's audio. */
  stream: MediaStream | null
  /** Populated once the SFU starts forwarding this participant's screen track. */
  screenStream?: MediaStream | null
  /** The SFU's id for that screen track, needed to unsubscribe from it. */
  screenTrackId?: string | null
}

export interface VoiceState {
  status: VoiceStatus
  selfId: string | null
  participants: RemoteParticipant[]
  muted: boolean
  speaking: boolean
  isScreenSharing: boolean
  screenStream: MediaStream | null
  handRaised: boolean
  stageRole: 'host' | 'speaker' | 'audience'
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
  isScreenSharing: false,
  screenStream: null,
  handRaised: false,
  stageRole: 'speaker',
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
  private screenTrack: MediaStreamTrack | null = null
  private screenSender: RTCRtpSender | null = null
  private audioContext: AudioContext | null = null
  private vadFrame: number | null = null

  /**
   * Every remote track we have asked the SFU to forward, keyed by its
   * server-assigned track id.
   *
   * `ontrack` gives us a `MediaStreamTrack` and nothing else — SDP cannot say
   * whether a video track is a camera or a screen. The SFU names the track
   * `<participant>:<kind>`, so looking the arriving id up here is what turns an
   * anonymous video track into "Ana's screen".
   */
  private readonly remoteTracks = new Map<string, TrackInfo>()

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
    await this.stopScreenShare()
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

  /**
   * Start sharing a screen, window or tab.
   *
   * Publishing is a renegotiation of the *publisher* connection: declare what
   * the track is for, add it, re-offer. The declaration has to come first —
   * the server correlates `client_track_id` with the `msid` in the offer that
   * follows, and an offer that arrives with no matching intent is guessed at.
   */
  async startScreenShare(): Promise<MediaStream | null> {
    if (this.state.isScreenSharing && this.state.screenStream) {
      return this.state.screenStream
    }
    if (this.state.status !== 'connected' || !this.publisher) {
      this.patch({ error: 'Join the room before sharing your screen' })
      return null
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.patch({ error: 'This browser cannot share a screen' })
      return null
    }

    let display: MediaStream
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        // No `displaySurface` hint: constraining it to 'monitor' makes some
        // browsers pre-select the whole screen, and sharing one window or one
        // tab is the common case.
        video: { frameRate: { ideal: 30, max: 60 } },
        // The SFU carries one audio track per participant — the microphone —
        // so asking for system audio would capture something we cannot send.
        audio: false,
      })
    } catch (error) {
      // Dismissing the picker is a cancellation, not a failure; only a real
      // fault is worth putting in front of the user.
      if (!isUserCancellation(error)) {
        this.patch({ error: 'Could not start the screen share' })
      }
      return null
    }

    const track = display.getVideoTracks()[0]
    if (!track) {
      for (const t of display.getTracks()) t.stop()
      return null
    }

    // One track per stream. The SFU labels every track it forwards with the
    // *publisher's* id as the stream id, so a shared stream object would put
    // somebody's microphone and their screen in the same MediaStream.
    const screenStream = new MediaStream([track])
    this.screenTrack = track
    // "Stop sharing" in the browser's own bar ends the track behind our back.
    track.addEventListener('ended', () => void this.stopScreenShare())

    try {
      this.send({ type: 'publish_intent', kind: 'screen_share', client_track_id: track.id })
      this.screenSender = this.publisher.addTrack(track, screenStream)
      await this.renegotiatePublisher()
    } catch {
      track.stop()
      this.screenTrack = null
      this.screenSender = null
      this.patch({ error: 'Could not publish your screen to the room' })
      return null
    }

    this.send({ type: 'screen_share', enabled: true })
    this.patch({ isScreenSharing: true, screenStream, error: null })
    return screenStream
  }

  async stopScreenShare(): Promise<void> {
    // The track outliving the flag is the case that matters: the browser's own
    // "stop sharing" bar ends it before any of our state has moved.
    if (!this.state.isScreenSharing && !this.screenTrack) return

    this.screenTrack?.stop()
    this.screenTrack = null
    for (const t of this.state.screenStream?.getTracks() ?? []) t.stop()

    if (this.publisher && this.screenSender && this.publisher.connectionState !== 'closed') {
      try {
        this.publisher.removeTrack(this.screenSender)
        await this.renegotiatePublisher()
      } catch {
        // The connection is going away anyway; the server drops the track when
        // it sees the `screen_share` flag below regardless.
      }
    }
    this.screenSender = null

    this.send({ type: 'screen_share', enabled: false })
    this.patch({ isScreenSharing: false, screenStream: null })
  }

  /** Re-offer on the publisher connection after its track set changed. */
  private async renegotiatePublisher(): Promise<void> {
    const publisher = this.publisher
    if (!publisher || publisher.connectionState === 'closed') return
    const offer = await publisher.createOffer()
    await publisher.setLocalDescription(offer)
    this.send({ type: 'offer', target: 'publisher', sdp: offer.sdp ?? '' })
  }

  async toggleScreenShare(): Promise<void> {
    if (this.state.isScreenSharing) {
      await this.stopScreenShare()
    } else {
      await this.startScreenShare()
    }
  }

  raiseHand(raised: boolean): void {
    this.patch({ handRaised: raised })
  }

  setStageRole(role: 'host' | 'speaker' | 'audience'): void {
    this.patch({ stageRole: role })
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
        this.remoteTracks.clear()
        this.patch({
          status: 'connected',
          selfId: message.participant_id,
          participants: message.participants.map(toRemote),
          error: null,
        })
        await this.negotiate(message.ice_servers ?? session.ice_servers)
        // Somebody may already have been presenting before we walked in. The
        // server only auto-subscribes audio, so their screen needs asking for.
        for (const participant of message.participants) {
          for (const track of participant.tracks ?? []) this.subscribeToVideo(track)
        }
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
      case 'screen_share_started':
      case 'screen_share_stopped': {
        const index = indexOf(message.participant_id)
        const existing = participants[index]
        if (existing) {
          const isSharing = message.event === 'screen_share_started'
          participants[index] = {
            ...existing,
            screenSharing: isSharing,
            // The flag arrives before the track does; the tile shows a
            // "starting…" state until `track_published` brings the pixels.
            screenStream: isSharing ? existing.screenStream : null,
            screenTrackId: isSharing ? existing.screenTrackId : null,
          }
        }
        break
      }
      case 'track_published': {
        const info = message.track
        const index = indexOf(info.participant_id)
        const existing = participants[index]
        if (existing && info.kind === 'screen_share') {
          participants[index] = {
            ...existing,
            screenSharing: true,
            screenTrackId: info.track_id,
          }
        }
        // Video is never auto-subscribed — a twenty-person room must not push
        // nineteen video streams at a phone — so asking is the whole mechanism.
        this.subscribeToVideo(info)
        break
      }
      case 'track_unpublished': {
        this.remoteTracks.delete(message.track_id)
        const index = indexOf(message.participant_id)
        const existing = participants[index]
        if (existing && message.kind !== 'audio') {
          participants[index] = {
            ...existing,
            screenSharing: false,
            screenStream: null,
            screenTrackId: null,
          }
        }
        break
      }
      default:
        return
    }

    this.patch({ participants })
  }

  /**
   * Ask the SFU to start forwarding one remote video track.
   *
   * Audio is skipped because the server subscribes everyone to it on join, and
   * our own tracks are skipped because a participant is not a subscriber to
   * themselves — the server would reject it and we would render our own screen
   * twice.
   */
  private subscribeToVideo(track: TrackInfo): void {
    if (track.kind === 'audio') return
    if (track.participant_id === this.state.selfId) return
    if (this.remoteTracks.has(track.track_id)) return

    this.remoteTracks.set(track.track_id, track)
    this.send({
      type: 'subscribe',
      participant_id: track.participant_id,
      track_id: track.track_id,
    })
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
      const info = this.remoteTracks.get(event.track.id)
      const participantId = info?.participant_id ?? participantIdFromTrack(event)
      if (!participantId) return

      // The registry is authoritative when it has an entry; the track's own
      // media kind is the fallback for a stack that renumbered the msid.
      const isVideo = info ? info.kind !== 'audio' : event.track.kind === 'video'

      // A stream per track: the SFU uses the publisher's id as the stream id
      // for *all* of their tracks, so `event.streams[0]` is one object holding
      // both the microphone and the screen.
      const stream = new MediaStream([event.track])

      if (isVideo) {
        // The publisher hanging up mid-share ends the track without any room
        // event arriving, so the tile has to clear itself.
        event.track.addEventListener('ended', () => this.clearRemoteScreen(participantId))
      }

      const participants = this.state.participants.map((p) => {
        if (p.id !== participantId) return p
        if (isVideo) {
          return { ...p, screenStream: stream, screenSharing: true }
        }
        return { ...p, stream }
      })
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

    // A reconnect builds a fresh publisher, so a share that survived the drop
    // has to be put back on it — in this same offer, not a second one.
    const screenTrack = this.screenTrack
    if (screenTrack && screenTrack.readyState === 'live') {
      this.send({
        type: 'publish_intent',
        kind: 'screen_share',
        client_track_id: screenTrack.id,
      })
      this.screenSender = publisher.addTrack(
        screenTrack,
        this.state.screenStream ?? new MediaStream([screenTrack]),
      )
      this.send({ type: 'screen_share', enabled: true })
    }

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

  /** Drop a remote share from the UI without waiting for a room event. */
  private clearRemoteScreen(participantId: string): void {
    const participants = this.state.participants.map((p) =>
      p.id === participantId
        ? { ...p, screenSharing: false, screenStream: null, screenTrackId: null }
        : p,
    )
    this.patch({ participants })
  }

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
    // The sender belonged to the closed publisher; the *track* deliberately
    // survives, so `negotiate` can put the share back on the new connection.
    this.screenSender = null
    this.remoteTracks.clear()

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
  const screen = info.tracks?.find((track) => track.kind === 'screen_share')
  return {
    id: info.participant_id,
    userId: info.user_id,
    displayName: info.display_name,
    muted: info.audio_muted,
    speaking: false,
    screenSharing: info.screen_sharing || screen !== undefined,
    screenTrackId: screen?.track_id ?? null,
    stream: null,
    screenStream: null,
  }
}

/**
 * Did the user dismiss the picker, rather than something going wrong?
 *
 * Both come back as an exception from `getDisplayMedia`, and only one of them
 * deserves an error message.
 */
function isUserCancellation(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  )
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
    case CloseCode.TokenRejected:
      // Retrying cannot fix this, so the message points at the cause instead of
      // inviting the user to try again: the API and the media server were
      // started with different MEDIA_TOKEN_SECRET values.
      return 'The voice server rejected this session. It may be misconfigured — try again later.'
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
