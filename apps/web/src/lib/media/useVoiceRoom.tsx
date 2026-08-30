import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Room } from 'livekit-client'

import { media, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

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
  stream: MediaStream | null
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
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  join: (roomId: Uuid, roomName?: string, communityId?: Uuid) => Promise<void>
  leave: () => Promise<void>
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

function participantToRemote(participant: any): RemoteParticipant {
  const audioTracks = Array.from(participant.audioTrackPublications?.values?.() || [])
  const videoTracks = Array.from(participant.videoTrackPublications?.values?.() || [])
  const screenTracks = Array.from(participant.screenShareTrackPublications?.values?.() || [])

  const audioTrack: any = audioTracks[0]
  const videoTrack: any = videoTracks[0]
  const screenTrack: any = screenTracks[0]

  return {
    id: participant.identity,
    userId: participant.identity,
    displayName: participant.name || 'Unknown',
    muted: !(audioTrack?.isEnabled ?? true),
    speaking: participant.isSpeaking || false,
    cameraOn: videoTrack?.isEnabled || false,
    screenSharing: screenTrack?.isEnabled || false,
    handRaised: false,
    stageRole: 'speaker',
    stream: audioTrack?.track?.mediaStream || null,
    cameraStream: videoTrack?.track?.mediaStream || null,
    screenStream: screenTrack?.track?.mediaStream || null,
    cameraTrackId: videoTrack?.trackSid || null,
    screenTrackId: screenTrack?.trackSid || null,
  }
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

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

  const [muted, setMuted] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [handRaised, setHandRaised] = useState(false)
  const [stageRole, setStageRole] = useState<'host' | 'speaker' | 'audience'>('speaker')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [cameraStream] = useState<MediaStream | null>(null)
  const [screenStream] = useState<MediaStream | null>(null)

  const roomRef = useRef<Room | null>(null)
  const currentRoomIdRef = useRef<Uuid | null>(activeSession?.roomId ?? null)
  currentRoomIdRef.current = activeSession?.roomId ?? null

  const refreshParticipants = useCallback(() => {
    if (!roomRef.current) return
    const remote = Array.from(roomRef.current.participants.values()).map(participantToRemote)
    setParticipants(remote)
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

        room.on('participantConnected', refreshParticipants)
        room.on('participantDisconnected', refreshParticipants)
        room.on('trackSubscribed', refreshParticipants)
        room.on('trackUnsubscribed', refreshParticipants)
        room.on('participantMetadataChanged', () => setSpeaking(room.localParticipant.isSpeaking))

        await room.connect(session.media_url, session.token)
        await room.localParticipant.setMicrophoneEnabled(false)

        roomRef.current = room
        refreshParticipants()
        setStatus('connected')
        setMuted(true)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join room'
        setError(message)
        setStatus('failed')
        throw err
      }
    },
    [refreshParticipants]
  )

  const leave = useCallback(async () => {
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect()
        roomRef.current = null
      }
      currentRoomIdRef.current = null
      setActiveSession(null)
      setStatus('idle')
      setError(null)
      setMuted(true)
      setCameraOn(false)
      setScreenSharing(false)
      setParticipants([])

      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore
      }
    } catch (err) {
      console.error('Failed to leave room:', err)
    }
  }, [])

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return
    const newMuted = !muted
    setMuted(newMuted)
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted)
  }, [muted])

  const toggleCamera = useCallback(async () => {
    if (!roomRef.current) return
    const newCameraOn = !cameraOn
    setCameraOn(newCameraOn)
    await roomRef.current.localParticipant.setCameraEnabled(newCameraOn)
  }, [cameraOn])

  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return
    const newScreenSharing = !screenSharing
    setScreenSharing(newScreenSharing)
    await roomRef.current.localParticipant.setScreenShareEnabled(newScreenSharing)
  }, [screenSharing])

  // Auto-rejoin on mount
  useEffect(() => {
    if (!user || !activeSession?.roomId) return

    join(activeSession.roomId, activeSession.roomName, activeSession.communityId).catch(() => {
      currentRoomIdRef.current = null
      setActiveSession(null)
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore
      }
    })
  }, [user, activeSession?.roomId, join])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect()
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
    cameraStream,
    screenStream,
    join,
    leave,
    setMuted: (m) => {
      setMuted(m)
      roomRef.current?.localParticipant.setMicrophoneEnabled(!m)
    },
    toggleMute,
    setAudioInput: () => {
      // Device selection handled at browser level
    },
    startCamera: () => toggleCamera(),
    stopCamera: () => roomRef.current?.localParticipant.setCameraEnabled(false),
    toggleCamera,
    startScreenShare: () => toggleScreenShare(),
    stopScreenShare: () => roomRef.current?.localParticipant.setScreenShareEnabled(false),
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
