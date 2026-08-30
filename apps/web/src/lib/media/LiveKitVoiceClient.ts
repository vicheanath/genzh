/**
 * LiveKit-based voice client - adapts LiveKit SDK to our VoiceState interface.
 *
 * This replaces the custom WebRTC implementation with LiveKit, providing the same
 * interface to React hooks so UI components don't need to change.
 */

import { Room } from 'livekit-client'
import type { MediaJoinResponse } from '@/lib/api'

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface RemoteParticipant {
  id: string
  userId: string
  displayName: string
  muted: boolean
  speaking: boolean
  cameraOn: boolean
  screenSharing: boolean
  handRaised: boolean
  stageRole: 'host' | 'speaker' | 'audience'
  stream: MediaStream | null
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  cameraTrackId: string | null
  screenTrackId: string | null
}

export interface VoiceState {
  status: VoiceStatus
  selfId: string | null
  participants: RemoteParticipant[]
  muted: boolean
  speaking: boolean
  isCameraOn: boolean
  cameraStream: MediaStream | null
  isScreenSharing: boolean
  screenStream: MediaStream | null
  handRaised: boolean
  stageRole: 'host' | 'speaker' | 'audience'
  error: string | null
}

export type SessionFactory = () => Promise<MediaJoinResponse>

const INITIAL_STATE: VoiceState = {
  status: 'idle',
  selfId: null,
  participants: [],
  muted: true,
  speaking: false,
  isCameraOn: false,
  cameraStream: null,
  isScreenSharing: false,
  screenStream: null,
  handRaised: false,
  stageRole: 'speaker',
  error: null,
}

/**
 * LiveKit voice room connection.
 *
 * Wraps the LiveKit SDK and presents it through the same interface as the
 * custom WebRTC client so existing React hooks can work without changes.
 */
export class LiveKitVoiceClient {
  private room: Room | null = null
  private state: VoiceState = { ...INITIAL_STATE }
  private subscribers: Set<() => void> = new Set()
  private sessionFactory: SessionFactory

  constructor(sessionFactory: SessionFactory) {
    this.sessionFactory = sessionFactory
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  /**
   * Get current state.
   */
  getState(): VoiceState {
    return { ...this.state }
  }

  /**
   * Join a room.
   */
  async join(): Promise<void> {
    try {
      this.setState({ status: 'connecting', error: null })

      const session = await this.sessionFactory()
      this.state.selfId = session.participant_id.toString()

      this.room = new Room()

      // Set up event listeners
      this.room.on('participantConnected', () => this.refreshParticipants())
      this.room.on('participantDisconnected', () => this.refreshParticipants())
      this.room.on('trackSubscribed', () => this.refreshParticipants())
      this.room.on('trackUnsubscribed', () => this.refreshParticipants())

      // Connect to the room
      await this.room.connect(session.media_url, session.token)

      // Set local participant as muted by default
      await this.room.localParticipant.setMicrophoneEnabled(false)

      this.refreshParticipants()
      this.setState({ status: 'connected' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      this.setState({ status: 'failed', error: message })
      throw error
    }
  }

  /**
   * Leave the room.
   */
  async leave(): Promise<void> {
    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }
    this.setState(INITIAL_STATE)
  }

  /**
   * Set microphone mute state.
   */
  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return
    await this.room.localParticipant.setMicrophoneEnabled(!muted)
    this.setState({ muted })
  }

  /**
   * Toggle microphone mute.
   */
  async toggleMute(): Promise<void> {
    await this.setMuted(!this.state.muted)
  }

  /**
   * Set audio input device.
   */
  async setAudioInput(_deviceId?: string): Promise<void> {
    // Device selection is handled at the browser level in LiveKit
    // This is a no-op for compatibility with the interface
  }

  /**
   * Start camera and return the media stream.
   */
  async startCamera(_deviceId?: string): Promise<MediaStream | null> {
    if (!this.room) return null

    try {
      await this.room.localParticipant.setCameraEnabled(true)

      // Get the camera track from local participant (cast to any to access internal properties)
      const lp = this.room.localParticipant as any
      const videoTrack = lp.videoTrackPublications?.get?.('camera') || lp.videoTrackPublications?.[0]
      if (videoTrack?.track) {
        const mediaStreamTrack = videoTrack.track.mediaStreamTrack
        if (mediaStreamTrack) {
          const stream = new MediaStream([mediaStreamTrack])
          this.setState({ isCameraOn: true, cameraStream: stream })
          return stream
        }
      }
      return null
    } catch (error) {
      console.error('Failed to start camera:', error)
      return null
    }
  }

  /**
   * Stop camera.
   */
  async stopCamera(): Promise<void> {
    if (!this.room) return
    await this.room.localParticipant.setCameraEnabled(false)
    this.setState({ isCameraOn: false, cameraStream: null })
  }

  /**
   * Toggle camera.
   */
  async toggleCamera(): Promise<void> {
    if (this.state.isCameraOn) {
      await this.stopCamera()
    } else {
      await this.startCamera()
    }
  }

  /**
   * Start screen share.
   */
  async startScreenShare(): Promise<MediaStream | null> {
    if (!this.room) return null

    try {
      await this.room.localParticipant.setScreenShareEnabled(true)

      // Get the screen share track from local participant (cast to any to access internal properties)
      const lp = this.room.localParticipant as any
      const screenTrack = lp.screenShareTrackPublications?.get?.('screen') || lp.screenShareTrackPublications?.[0]
      if (screenTrack?.track) {
        const mediaStreamTrack = screenTrack.track.mediaStreamTrack
        if (mediaStreamTrack) {
          const stream = new MediaStream([mediaStreamTrack])
          this.setState({ isScreenSharing: true, screenStream: stream })
          return stream
        }
      }
      return null
    } catch (error) {
      console.error('Failed to start screen share:', error)
      return null
    }
  }

  /**
   * Stop screen share.
   */
  async stopScreenShare(): Promise<void> {
    if (!this.room) return
    await this.room.localParticipant.setScreenShareEnabled(false)
    this.setState({ isScreenSharing: false, screenStream: null })
  }

  /**
   * Toggle screen share.
   */
  async toggleScreenShare(): Promise<void> {
    if (this.state.isScreenSharing) {
      await this.stopScreenShare()
    } else {
      await this.startScreenShare()
    }
  }

  /**
   * Raise hand.
   */
  raiseHand(raised: boolean): void {
    this.setState({ handRaised: raised })
  }

  /**
   * Set stage role.
   */
  setStageRole(role: 'host' | 'speaker' | 'audience'): void {
    this.setState({ stageRole: role })
  }

  /**
   * Internal: update state and notify subscribers.
   */
  private setState(updates: Partial<VoiceState>): void {
    this.state = { ...this.state, ...updates }
    this.subscribers.forEach((cb) => cb())
  }

  /**
   * Internal: convert LiveKit participant to our format.
   */
  private participantToRemote(participant: any): RemoteParticipant {
    const audioTrack = participant.audioTrackPublications?.get?.('audio') || participant.audioTrackPublications?.[0]
    const videoTrack = participant.videoTrackPublications?.get?.('camera') || participant.videoTrackPublications?.[0]
    const screenTrack = participant.screenShareTrackPublications?.get?.('screen') || participant.screenShareTrackPublications?.[0]

    return {
      id: participant.identity,
      userId: participant.identity,
      displayName: participant.name || 'Unknown',
      muted: !(audioTrack?.isEnabled ?? true),
      speaking: participant.isSpeaking,
      cameraOn: videoTrack?.isEnabled ?? false,
      screenSharing: screenTrack?.isEnabled ?? false,
      handRaised: false,
      stageRole: 'speaker',
      stream: audioTrack?.track?.mediaStream || null,
      cameraStream: videoTrack?.track?.mediaStream || null,
      screenStream: screenTrack?.track?.mediaStream || null,
      cameraTrackId: videoTrack?.trackSid || null,
      screenTrackId: screenTrack?.trackSid || null,
    }
  }

  /**
   * Internal: refresh participant list.
   */
  private refreshParticipants(): void {
    if (!this.room) return

    const participants: RemoteParticipant[] = Array.from(this.room.participants.values()).map((p) =>
      this.participantToRemote(p)
    )

    this.setState({ participants })
  }
}
