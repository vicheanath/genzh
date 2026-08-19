/**
 * The signalling wire protocol, mirroring `crates/media-signaling`.
 *
 * Kept in lockstep with the Rust definitions by hand. The `PROTOCOL_VERSION`
 * check on `joined` is the guard: if the server bumps it, the client refuses to
 * proceed rather than misinterpreting a message it half-understands.
 */

export const PROTOCOL_VERSION = 1

export type PeerTarget = 'publisher' | 'subscriber'
export type TrackKind = 'audio' | 'camera' | 'screen_share'

export interface TrackInfo {
  track_id: string
  participant_id: string
  kind: TrackKind
  mime_type: string
  muted: boolean
}

export interface ParticipantInfo {
  participant_id: string
  user_id: string
  display_name: string
  tracks: TrackInfo[]
  audio_muted: boolean
  camera_enabled: boolean
  screen_sharing: boolean
}

// ── client → server ───────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'join'; room_id: string; token: string }
  | { type: 'offer'; target: PeerTarget; sdp: string }
  | { type: 'answer'; target: PeerTarget; sdp: string }
  | {
      type: 'ice_candidate'
      target: PeerTarget
      candidate: string
      sdp_mid?: string | null
      sdp_mline_index?: number | null
    }
  | { type: 'publish_intent'; kind: TrackKind; client_track_id: string }
  | { type: 'subscribe'; participant_id: string; track_id: string }
  | { type: 'unsubscribe'; participant_id: string; track_id: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'camera'; enabled: boolean }
  | { type: 'screen_share'; enabled: boolean }
  | { type: 'speaking'; speaking: boolean }
  | { type: 'ping' }
  | { type: 'leave' }

// ── server → client ───────────────────────────────────────────────────────

export type RoomEvent =
  | { event: 'participant_joined'; participant: ParticipantInfo }
  | { event: 'participant_left'; participant_id: string }
  | { event: 'track_published'; track: TrackInfo }
  | {
      event: 'track_unpublished'
      participant_id: string
      track_id: string
      kind: TrackKind
    }
  | { event: 'speaking_started'; participant_id: string }
  | { event: 'speaking_stopped'; participant_id: string }
  | { event: 'microphone_muted'; participant_id: string; by_moderator: boolean }
  | { event: 'microphone_unmuted'; participant_id: string }
  | { event: 'camera_enabled'; participant_id: string }
  | { event: 'camera_disabled'; participant_id: string }
  | { event: 'screen_share_started'; participant_id: string }
  | { event: 'screen_share_stopped'; participant_id: string }

export type ServerMessage =
  | {
      type: 'joined'
      protocol_version: number
      participant_id: string
      room_id: string
      participants: ParticipantInfo[]
      ice_servers: RTCIceServer[]
    }
  | { type: 'offer'; target: PeerTarget; sdp: string }
  | { type: 'answer'; target: PeerTarget; sdp: string }
  | {
      type: 'ice_candidate'
      target: PeerTarget
      candidate: string
      sdp_mid?: string | null
      sdp_mline_index?: number | null
    }
  | ({ type: 'event' } & RoomEvent)
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }

/** Application close codes the media server uses. */
export const CloseCode = {
  Normal: 1000,
  ProtocolViolation: 4000,
  Unauthorized: 4001,
  Forbidden: 4003,
  RoomFull: 4004,
  RateLimited: 4029,
  IdleTimeout: 4030,
  ServerError: 4500,
} as const

/**
 * Should the client try again after this close code?
 *
 * `Forbidden` and `ProtocolViolation` will fail identically on a retry — the
 * user cannot enter the room, or the client is wrong — so retrying them is
 * just noise. Everything else is worth one more attempt with a fresh token.
 */
export function isRetryableClose(code: number): boolean {
  return (
    code !== CloseCode.Normal &&
    code !== CloseCode.Forbidden &&
    code !== CloseCode.ProtocolViolation &&
    code !== CloseCode.RoomFull
  )
}
