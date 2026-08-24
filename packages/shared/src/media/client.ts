/**
 * What a call client is, from the view model's side of the fence.
 *
 * There are two implementations — `apps/web/src/lib/media/VoiceClient` and
 * `apps/mobile/src/lib/webrtc/MobileVoiceClient` — because the media stacks
 * differ, but they speak the same protocol to the same SFU and therefore hold
 * the same state. This is that state, named once.
 *
 * Streams are `unknown` on purpose. A `MediaStream` on the web and a
 * react-native-webrtc stream are different objects with different methods, and
 * nothing at this layer needs to touch either — the view model moves them
 * around, the view renders them. Typing them here would drag one platform's DOM
 * lib into the other's build for no benefit.
 */

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

/** Which lens is publishing. Meaningless while the camera is off. */
export type CameraFacing = 'user' | 'environment'

/** Somebody else in the call, as the media layer sees them. */
export interface CallClientParticipant {
  /** The SFU's id for this connection, not the user's id. */
  id: string
  userId: string
  displayName: string
  muted: boolean
  speaking: boolean
  cameraOn?: boolean
  screenSharing?: boolean
  handRaised?: boolean
  stream?: unknown | null
  cameraStream?: unknown | null
  screenStream?: unknown | null
}

export interface CallClientState {
  status: CallStatus
  selfId: string | null
  participants: CallClientParticipant[]
  muted: boolean
  speaking: boolean
  isCameraOn: boolean
  cameraStream: unknown | null
  cameraFacing?: CameraFacing
  isScreenSharing: boolean
  screenStream: unknown | null
  handRaised: boolean
  error: string | null
}

/**
 * The methods a view model drives.
 *
 * Deliberately not a class to extend: both clients already exist and already
 * match this shape, so the interface is a description of what is, not a base
 * anybody has to inherit.
 */
export interface CallClient {
  subscribe(listener: (state: CallClientState) => void): () => void
  getState(): CallClientState
  join(): Promise<void>
  leave(): Promise<void>
  setMuted(muted: boolean): void
  startCamera(facing?: CameraFacing): Promise<unknown | null>
  stopCamera(): Promise<void>
  switchCamera(): Promise<void>
  startScreenShare(): Promise<unknown | null>
  stopScreenShare(): Promise<void>
  toggleHandRaise(): void
}
