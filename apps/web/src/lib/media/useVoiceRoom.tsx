import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type TrackPublication,
} from 'livekit-client'

import { media, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAppStore } from '@/lib/store'

const STORAGE_KEY = 'genzh_active_voice_session'

export interface StoredVoiceSession {
  roomId: Uuid
  roomName?: string
  communityId?: Uuid
}

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
  /**
   * This participant's microphone, as a LiveKit track rather than a raw
   * `MediaStream`.
   *
   * `GlobalAudioOutputs` calls `attach()` on it. That is the SDK's own path
   * for wiring a track to an element, and it is what makes
   * `switchActiveDevice('audiooutput')` reach every playing element — a bare
   * `srcObject` assignment is invisible to the SDK and cannot be re-routed.
   */
  audioTrack: Track | null
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  cameraTrackId: string | null
  screenTrackId: string | null
}

export interface VoiceContextValue {
  activeRoomId: Uuid | null
  activeRoomName: string | null
  activeCommunityId: Uuid | null
  participants: RemoteParticipant[]
  muted: boolean
  cameraOn: boolean
  screenSharing: boolean
  speaking: boolean
  handRaised: boolean
  stageRole: 'host' | 'speaker' | 'audience'
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  error: string | null
  /**
   * The browser is refusing to play incoming audio until this page gets a
   * user gesture.
   *
   * Joining a call from a click usually satisfies autoplay on its own, but not
   * always — an auto-rejoin on page load never does, and Safari is stricter
   * than the rest. When this is true every remote `<audio>` is silently
   * paused, so the UI has to offer a way to start it; see `enableAudio`.
   */
  audioBlocked: boolean
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  join: (roomId: Uuid, roomName?: string, communityId?: Uuid) => Promise<void>
  leave: () => Promise<void>
  /** Start blocked audio playback. Must be called from a user gesture. */
  enableAudio: () => Promise<void>
  setMuted: (muted: boolean) => void
  toggleMute: () => void
  setAudioInput: (deviceId?: string) => void
  startCamera: (deviceId?: string) => void
  stopCamera: () => void
  toggleCamera: () => void
  startScreenShare: () => void
  stopScreenShare: () => void
  toggleScreenShare: () => void
  raiseHand: (raised: boolean) => void
  setStageRole: (role: 'host' | 'speaker' | 'audience') => void
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

/**
 * Turn a failed camera/microphone/screen-share attempt into something a user
 * can act on.
 *
 * Two very different things throw here and both were silently swallowed
 * before: the browser refusing `getUserMedia` (wrong OS/site permission, or
 * the device is in use elsewhere), and LiveKit refusing to publish because
 * this participant's token grant does not allow it (e.g. an audience member
 * in a stage room). Distinguishing them is the difference between "grant
 * this site camera access" and "ask the host for speaker permission".
 */
function mediaErrorMessage(err: unknown, kind: string): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return `${kind[0]!.toUpperCase()}${kind.slice(1)} access was denied. Check your browser's site permissions and try again.`
      case 'NotFoundError':
        return `No ${kind} device was found.`
      case 'NotReadableError':
        return `The ${kind} is already in use by another application.`
      case 'OverconstrainedError':
        return `The selected ${kind} device is not available.`
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/permission/i.test(message)) {
    return `You don't have permission to use your ${kind} in this room.`
  }
  return `Could not start ${kind}: ${message}`
}

/** The one publication of `source` a participant holds, if any. */
function findTrack(
  tracks: Map<string, TrackPublication>,
  source: Track.Source,
): TrackPublication | undefined {
  for (const publication of tracks.values()) {
    if (publication.source === source) return publication
  }
  return undefined
}

function participantToRemote(participant: Participant): RemoteParticipant {
  const micTrack = findTrack(participant.audioTracks, Track.Source.Microphone)
  const cameraTrack = findTrack(participant.videoTracks, Track.Source.Camera)
  const screenTrack = findTrack(participant.videoTracks, Track.Source.ScreenShare)

  return {
    id: participant.identity,
    userId: participant.identity,
    displayName: participant.name || 'Unknown',
    muted: !micTrack || micTrack.isMuted,
    speaking: participant.isSpeaking,
    cameraOn: Boolean(cameraTrack?.isEnabled),
    screenSharing: Boolean(screenTrack?.isEnabled),
    // LiveKit carries no notion of a raised hand or a stage role — both are
    // presentation state this app owns, not something the media plane
    // reports for other participants.
    handRaised: false,
    stageRole: 'speaker',
    audioTrack: micTrack?.track ?? null,
    cameraStream: cameraTrack?.track?.mediaStream ?? null,
    screenStream: screenTrack?.track?.mediaStream ?? null,
    cameraTrackId: cameraTrack?.trackSid ?? null,
    screenTrackId: screenTrack?.trackSid ?? null,
  }
}

/**
 * LiveKit-backed voice room state, shared through context so any component
 * can join, leave, or read who else is in the room without drilling props.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const micDeviceId = useAppStore((s) => s.micDeviceId)
  const cameraDeviceId = useAppStore((s) => s.cameraDeviceId)
  const speakerDeviceId = useAppStore((s) => s.speakerDeviceId)

  const [activeSession, setActiveSession] = useState<StoredVoiceSession | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored) as StoredVoiceSession
      }
    } catch {
      // Ignore
    }
    return null
  })

  const [muted, setMutedState] = useState(true)
  const [cameraOn, setCameraOnState] = useState(false)
  const [screenSharing, setScreenSharingState] = useState(false)
  const [handRaised, setHandRaised] = useState(false)
  const [stageRole, setStageRole] = useState<'host' | 'speaker' | 'audience'>('speaker')
  const [status, setStatus] = useState<VoiceContextValue['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)

  const roomRef = useRef<Room | null>(null)
  const currentRoomIdRef = useRef<Uuid | null>(activeSession?.roomId ?? null)
  currentRoomIdRef.current = activeSession?.roomId ?? null

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    setParticipants(Array.from(room.participants.values()).map(participantToRemote))
  }, [])

  const clearStoredSession = useCallback(() => {
    currentRoomIdRef.current = null
    setActiveSession(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }, [])

  const join = useCallback(
    async (roomId: Uuid, roomName?: string, communityId?: Uuid) => {
      try {
        setStatus('connecting')
        setError(null)

        currentRoomIdRef.current = roomId
        setActiveSession({ roomId, roomName, communityId })
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId, roomName, communityId }))
        } catch {
          // Ignore
        }

        const session = await media.join(null, roomId)
        const room = new Room()

        room
          .on(RoomEvent.ParticipantConnected, refreshParticipants)
          .on(RoomEvent.ParticipantDisconnected, refreshParticipants)
          .on(RoomEvent.TrackSubscribed, refreshParticipants)
          .on(RoomEvent.TrackUnsubscribed, refreshParticipants)
          .on(RoomEvent.TrackMuted, refreshParticipants)
          .on(RoomEvent.TrackUnmuted, refreshParticipants)
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            refreshParticipants()
            setSpeaking(speakers.includes(room.localParticipant))
          })
          .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
          .on(RoomEvent.Reconnected, () => setStatus('connected'))
          // Fires whenever the browser starts or stops allowing playback, so
          // the prompt disappears by itself once audio is running — including
          // when some unrelated gesture elsewhere on the page unblocks it.
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            setAudioBlocked(!room.canPlaybackAudio)
          })
          .on(RoomEvent.Disconnected, () => {
            roomRef.current = null
            setStatus('idle')
            setParticipants([])
            setAudioBlocked(false)
          })

        await room.connect(session.media_url, session.token)
        await room.localParticipant.setMicrophoneEnabled(false)

        // The join click is itself a gesture, so this usually succeeds and the
        // prompt never appears. It is allowed to fail: `audioBlocked` then
        // drives the UI, which is the whole point of asking here first.
        if (!room.canPlaybackAudio) {
          try {
            await room.startAudio()
          } catch {
            // Handled by the flag below, not by failing the join.
          }
        }
        setAudioBlocked(!room.canPlaybackAudio)

        if (speakerDeviceId) {
          await room.switchActiveDevice('audiooutput', speakerDeviceId).catch(() => {
            // A remembered output device can disappear between sessions;
            // falling back to the system default is the right answer.
          })
        }

        roomRef.current = room
        refreshParticipants()
        setStatus('connected')
        setMutedState(true)
        setCameraOnState(false)
        setScreenSharingState(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join room'
        setError(message)
        setStatus('failed')
        throw err
      }
    },
    [refreshParticipants, speakerDeviceId],
  )

  const leave = useCallback(async () => {
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      await room.disconnect()
    }
    clearStoredSession()
    setStatus('idle')
    setError(null)
    setAudioBlocked(false)
    setMutedState(true)
    setCameraOnState(false)
    setScreenSharingState(false)
    setCameraStream(null)
    setScreenStream(null)
    setParticipants([])
  }, [clearStoredSession])

  /**
   * Ask the browser to start playing incoming audio.
   *
   * Only meaningful from inside a click handler — that is the gesture the
   * autoplay policy is waiting for, and calling it from an effect will simply
   * fail again.
   */
  const enableAudio = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.startAudio()
      setAudioBlocked(!room.canPlaybackAudio)
    } catch (err) {
      console.error('Failed to start audio playback:', err)
      setAudioBlocked(true)
    }
  }, [])

  const setMuted = useCallback(
    async (next: boolean) => {
      const room = roomRef.current
      if (!room) {
        setMutedState(next)
        return
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(
          !next,
          !next && micDeviceId ? { deviceId: micDeviceId } : undefined,
        )
        setMutedState(next)
        setError(null)
      } catch (err) {
        // Leave `muted` exactly as it was — the button must not show
        // "unmuted" when the browser refused to open the microphone at all.
        console.error('Failed to change microphone state:', err)
        setError(mediaErrorMessage(err, 'microphone'))
      }
    },
    [micDeviceId],
  )

  const toggleMute = useCallback(() => {
    void setMuted(!muted)
  }, [muted, setMuted])

  const startCamera = useCallback(
    async (deviceId?: string) => {
      const room = roomRef.current
      if (!room) return
      const resolved = deviceId || cameraDeviceId || undefined
      try {
        const publication = await room.localParticipant.setCameraEnabled(
          true,
          resolved ? { deviceId: resolved } : undefined,
        )
        setCameraOnState(true)
        setCameraStream(publication?.track?.mediaStream ?? null)
        setError(null)
      } catch (err) {
        console.error('Failed to start camera:', err)
        setError(mediaErrorMessage(err, 'camera'))
      }
    },
    [cameraDeviceId],
  )

  const stopCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    await room.localParticipant.setCameraEnabled(false)
    setCameraOnState(false)
    setCameraStream(null)
  }, [])

  const toggleCamera = useCallback(
    () => (cameraOn ? stopCamera() : startCamera()),
    [cameraOn, startCamera, stopCamera],
  )

  const startScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      const publication = await room.localParticipant.setScreenShareEnabled(true)
      setScreenSharingState(true)
      setScreenStream(publication?.track?.mediaStream ?? null)
      setError(null)
    } catch (err) {
      console.error('Failed to start screen share:', err)
      setError(mediaErrorMessage(err, 'screen share'))
    }
  }, [])

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    await room.localParticipant.setScreenShareEnabled(false)
    setScreenSharingState(false)
    setScreenStream(null)
  }, [])

  const toggleScreenShare = useCallback(
    () => (screenSharing ? stopScreenShare() : startScreenShare()),
    [screenSharing, startScreenShare, stopScreenShare],
  )

  const setAudioInput = useCallback(
    (deviceId?: string) => {
      void roomRef.current?.switchActiveDevice('audioinput', deviceId ?? micDeviceId)
    },
    [micDeviceId],
  )

  // A device changed in Settings applies to a call already in progress —
  // that is the promise the Settings screen makes, and it needs LiveKit's
  // own device switch rather than a rejoin.
  useEffect(() => {
    if (!micDeviceId || status !== 'connected') return
    void roomRef.current?.switchActiveDevice('audioinput', micDeviceId)
  }, [micDeviceId, status])

  useEffect(() => {
    if (!cameraDeviceId || status !== 'connected' || !cameraOn) return
    void roomRef.current?.switchActiveDevice('videoinput', cameraDeviceId)
  }, [cameraDeviceId, status, cameraOn])

  // Changing the output device re-routes every element LiveKit has attached,
  // which is the reason `GlobalAudioOutputs` attaches through the SDK rather
  // than assigning `srcObject` itself.
  useEffect(() => {
    if (!speakerDeviceId || status !== 'connected') return
    void roomRef.current?.switchActiveDevice('audiooutput', speakerDeviceId).catch(() => {
      // The chosen device may have been unplugged; the default still plays.
    })
  }, [speakerDeviceId, status])

  // Auto-rejoin on mount if a session was preserved in localStorage.
  const autoRejoinAttemptedRef = useRef(false)
  useEffect(() => {
    if (!user || autoRejoinAttemptedRef.current) return
    autoRejoinAttemptedRef.current = true

    if (activeSession?.roomId) {
      join(activeSession.roomId, activeSession.roomName, activeSession.communityId).catch(() => {
        // If auto-rejoin fails (e.g. room expired or deleted), clear storage.
        clearStoredSession()
      })
    }
  }, [user, activeSession?.roomId, activeSession?.roomName, activeSession?.communityId, join, clearStoredSession])

  // Disconnect if the provider itself unmounts — effectively only on a hard
  // navigation away from the app, since this sits above the router.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect()
    }
  }, [])

  const value: VoiceContextValue = {
    activeRoomId: activeSession?.roomId ?? null,
    activeRoomName: activeSession?.roomName ?? null,
    activeCommunityId: activeSession?.communityId ?? null,
    participants,
    muted,
    cameraOn,
    screenSharing,
    speaking,
    handRaised,
    stageRole,
    status,
    error,
    audioBlocked,
    cameraStream,
    screenStream,
    join,
    leave,
    enableAudio,
    setMuted,
    toggleMute,
    setAudioInput,
    startCamera,
    stopCamera,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    raiseHand: setHandRaised,
    setStageRole,
  }

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoiceRoom(): VoiceContextValue {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoiceRoom must be used within VoiceProvider')
  }
  return context
}
