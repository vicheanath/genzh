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
import { useAppStore } from '@/lib/store'

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
  setAudioInput: (deviceId: string) => Promise<void>
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

  const micDeviceId = useAppStore((s) => s.micDeviceId)
  const cameraDeviceId = useAppStore((s) => s.cameraDeviceId)
  const speakerDeviceId = useAppStore((s) => s.speakerDeviceId)
  const outputVolume = useAppStore((s) => s.outputVolume)

  // Push the saved microphone into the client whenever it changes — including
  // once on mount, which is what makes the choice survive a reload rather than
  // only applying to the call it was made during.
  useEffect(() => {
    void client.setAudioInput(micDeviceId)
  }, [client, micDeviceId])

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

  const setAudioInput = useCallback(
    (deviceId: string) => client.setAudioInput(deviceId),
    [client],
  )

  // The camera defaults to the saved preference, but an explicit argument wins
  // — the settings screen previews a device before it has been chosen.
  const startCamera = useCallback(
    (deviceId?: string) => client.startCamera(deviceId ?? (cameraDeviceId || undefined)),
    [client, cameraDeviceId],
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
    setAudioInput,
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
      <GlobalAudioOutputs
        participants={state.participants}
        sinkId={speakerDeviceId}
        volume={outputVolume}
      />
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

function GlobalAudioOutputs({
  participants,
  sinkId,
  volume,
}: {
  participants: RemoteParticipant[]
  sinkId: string
  volume: number
}) {
  return (
    <div style={{ display: 'none' }} aria-hidden>
      {participants.map((participant) => (
        <RemoteAudioTrack
          key={participant.id}
          stream={participant.stream}
          sinkId={sinkId}
          volume={volume}
        />
      ))}
    </div>
  )
}

/**
 * One remote participant's audio.
 *
 * Playback lives here, at the app root, rather than in whatever screen happens
 * to be showing the call — so navigating away from a room does not unmount the
 * audio. That also makes this the one place the speaker and volume have to be
 * applied.
 */
function RemoteAudioTrack({
  stream,
  sinkId,
  volume,
}: {
  stream: MediaStream | null
  sinkId: string
  volume: number
}) {
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

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.volume = Math.min(Math.max(volume, 0), 100) / 100
  }, [volume])

  useEffect(() => {
    const element = ref.current
    if (!element || !sinkId) return
    // Chromium-only. Elsewhere the element plays through the system default,
    // and the settings screen hides the control rather than offering a no-op.
    const withSink = element as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>
    }
    void withSink.setSinkId?.(sinkId).catch(() => {})
  }, [sinkId, stream])

  if (!stream) return null
  return <audio ref={ref} autoPlay playsInline />
}
