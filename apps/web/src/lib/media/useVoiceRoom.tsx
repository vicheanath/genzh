import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { media as mediaApi, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import { VoiceClient, type RemoteParticipant, type VoiceState } from './VoiceClient'

const STORAGE_KEY = 'genzh_active_voice_session'

export interface StoredVoiceSession {
  roomId: Uuid
  roomName?: string
  communityId?: Uuid
}

export interface VoiceContextValue extends VoiceState {
  activeRoomId: Uuid | null
  activeRoomName: string | null
  activeCommunityId: Uuid | null
  join: (roomId: Uuid, roomName?: string, communityId?: Uuid) => Promise<void>
  leave: () => Promise<void>
  setMuted: (muted: boolean) => void
  toggleMute: () => void
  startCamera: (deviceId?: string) => Promise<MediaStream | null>
  stopCamera: () => Promise<void>
  toggleCamera: () => Promise<void>
  startScreenShare: () => Promise<MediaStream | null>
  stopScreenShare: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  raiseHand: (raised: boolean) => void
  setStageRole: (role: 'host' | 'speaker' | 'audience') => void
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()

  const [activeSession, setActiveSession] = useState<StoredVoiceSession | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored) as StoredVoiceSession
      }
    } catch {
      // Ignore JSON parse errors
    }
    return null
  })

  const currentRoomIdRef = useRef<Uuid | null>(activeSession?.roomId ?? null)
  currentRoomIdRef.current = activeSession?.roomId ?? null

  const [client] = useState(
    () =>
      new VoiceClient(async () => {
        const roomId = currentRoomIdRef.current
        if (!roomId) {
          throw new Error('No active voice room')
        }
        const token = await getToken()
        return mediaApi.join(token, roomId)
      }),
  )

  const state = useSyncExternalStore<VoiceState>(
    useCallback((onChange) => client.subscribe(onChange), [client]),
    useCallback(() => client.getState(), [client]),
  )

  const join = useCallback(
    async (roomId: Uuid, roomName?: string, communityId?: Uuid) => {
      // If already connected to another room, leave first
      if (currentRoomIdRef.current && currentRoomIdRef.current !== roomId) {
        await client.leave()
      }

      currentRoomIdRef.current = roomId
      const session: StoredVoiceSession = { roomId, roomName, communityId }
      setActiveSession(session)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      } catch {
        // Storage access issues
      }

      try {
        await client.join()
      } catch {
        currentRoomIdRef.current = null
        setActiveSession(null)
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // Ignore
        }
      }
    },
    [client],
  )

  const leave = useCallback(async () => {
    currentRoomIdRef.current = null
    setActiveSession(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage access issues
    }
    await client.leave()
  }, [client])

  const setMuted = useCallback((muted: boolean) => client.setMuted(muted), [client])
  const toggleMute = useCallback(() => {
    client.setMuted(!client.getState().muted)
  }, [client])

  // Clear stale session if status ever transitions to failed
  useEffect(() => {
    if (state.status === 'failed') {
      currentRoomIdRef.current = null
      setActiveSession(null)
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore
      }
    }
  }, [state.status])

  // Auto-rejoin on mount if session was preserved in localStorage
  const autoRejoinAttemptedRef = useRef(false)
  useEffect(() => {
    if (!user || autoRejoinAttemptedRef.current) return
    autoRejoinAttemptedRef.current = true

    if (activeSession?.roomId) {
      void client.join().catch(() => {
        // If auto-rejoin fails (e.g. room expired or deleted), clear the storage
        currentRoomIdRef.current = null
        setActiveSession(null)
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // Ignore
        }
      })
    }
  }, [user, activeSession?.roomId, client])

  const startCamera = useCallback(
    (deviceId?: string) => client.startCamera(deviceId),
    [client],
  )
  const stopCamera = useCallback(() => client.stopCamera(), [client])
  const toggleCamera = useCallback(() => client.toggleCamera(), [client])
  const startScreenShare = useCallback(() => client.startScreenShare(), [client])
  const stopScreenShare = useCallback(() => client.stopScreenShare(), [client])
  const toggleScreenShare = useCallback(() => client.toggleScreenShare(), [client])
  const raiseHand = useCallback((raised: boolean) => client.raiseHand(raised), [client])
  const setStageRole = useCallback(
    (role: 'host' | 'speaker' | 'audience') => client.setStageRole(role),
    [client],
  )

  const value: VoiceContextValue = {
    ...state,
    activeRoomId: activeSession?.roomId ?? null,
    activeRoomName: activeSession?.roomName ?? null,
    activeCommunityId: activeSession?.communityId ?? null,
    join,
    leave,
    setMuted,
    toggleMute,
    startCamera,
    stopCamera,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    raiseHand,
    setStageRole,
  }

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {/* Global Audio output container: keeps remote participant audio playing across page navigations */}
      <GlobalAudioOutputs participants={state.participants} />
    </VoiceContext.Provider>
  )
}

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider')
  }
  return context
}

/**
 * Backward-compatible helper for room-specific voice components.
 */
export function useVoiceRoom(roomId: Uuid) {
  const voice = useVoice()
  const isCurrent = voice.activeRoomId === roomId

  const joinThisRoom = useCallback(
    (name?: string, communityId?: Uuid) => voice.join(roomId, name, communityId),
    [voice, roomId],
  )

  return {
    ...voice,
    isCurrent,
    join: joinThisRoom,
  }
}

function GlobalAudioOutputs({ participants }: { participants: RemoteParticipant[] }) {
  return (
    <div style={{ display: 'none' }} aria-hidden>
      {participants.map((participant) => (
        <RemoteAudioTrack key={participant.id} stream={participant.stream} />
      ))}
    </div>
  )
}

function RemoteAudioTrack({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !stream) return
    element.srcObject = stream
    void element.play().catch(() => {})
    return () => {
      element.srcObject = null
    }
  }, [stream])

  if (!stream) return null
  return <audio ref={ref} autoPlay playsInline />
}
