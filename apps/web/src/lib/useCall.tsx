import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useEndCallMutation, useRingMutation, type CallEndReason } from '@/features/api'
import { useSocketEvent } from '@/features/realtime'
import type { Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useVoice } from '@/lib/media'

/**
 * How long a ring stands before it is treated as missed.
 *
 * Both sides run the same clock, so the caller stops calling at roughly the
 * moment the callee stops being called — without either needing to tell the
 * other, which is what keeps a dropped socket from leaving a phone ringing.
 */
const RING_TIMEOUT_MS = 45_000

/** Somebody is calling you. */
export interface IncomingCall {
  roomId: Uuid
  fromUserId: Uuid
  fromDisplayName: string
  video: boolean
}

/** You are calling somebody, and they have not picked up. */
export interface OutgoingCall {
  roomId: Uuid
  peerId: Uuid
  peerName: string
  video: boolean
}

interface CallValue {
  incoming: IncomingCall | null
  outgoing: OutgoingCall | null
  /** Ring somebody in a direct conversation, joining the call yourself first. */
  start: (roomId: Uuid, peerId: Uuid, peerName: string, video: boolean) => Promise<void>
  /** Pick up: join the call you are being rung for. */
  accept: () => Promise<void>
  /** Say no. The caller stops calling. */
  decline: () => Promise<void>
  /** Stop calling somebody who has not answered. */
  cancel: () => Promise<void>
}

const CallContext = createContext<CallValue | null>(null)

/**
 * One-to-one calls, above the room they happen in.
 *
 * A call *is* the direct conversation's media session — there is no second room
 * — so the only thing missing was a way to tell somebody it had started. That
 * is all this holds: a ring in each direction, and the two seconds of state
 * between the caller joining and the callee arriving.
 *
 * Deliberately not part of `VoiceProvider`. Voice knows about a room you are
 * connected to; it has nothing to say about a room you are being invited into,
 * and folding the invitation in would mean the connection layer knowing who
 * your friends are.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const voice = useVoice()
  const ring = useRingMutation()
  const endCall = useEndCallMutation()

  const [incoming, setIncoming] = useState<IncomingCall | null>(null)
  const [outgoing, setOutgoing] = useState<OutgoingCall | null>(null)

  const signedIn = Boolean(user)

  // Read inside socket handlers and timers, which are attached once and must
  // not be re-attached every time a call starts or stops.
  const incomingRef = useRef<IncomingCall | null>(null)
  incomingRef.current = incoming
  const outgoingRef = useRef<OutgoingCall | null>(null)
  outgoingRef.current = outgoing

  // `useVoice()` hands back a fresh object on every render of its provider —
  // and it re-renders on every speaking flag, several times a second while
  // somebody talks. Depending on it directly would tear down and re-attach the
  // socket listeners at that rate and restart the ring clock each time, so a
  // caller who talked while waiting would ring forever.
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  // The mutations are stable, but reading them through a ref keeps the
  // callbacks below out of the re-render churn `useVoice` produces.
  const ringRef = useRef(ring)
  ringRef.current = ring
  const endCallRef = useRef(endCall)
  endCallRef.current = endCall

  const notify = useCallback(async (roomId: Uuid, reason: CallEndReason) => {
    try {
      await endCallRef.current.mutateAsync({ roomId, reason })
    } catch {
      // The other side falls back to its own ring timeout. Failing the
      // hang-up here would leave this user in a call they meant to leave.
    }
  }, [])

  const start = useCallback(
    async (roomId: Uuid, peerId: Uuid, peerName: string, video: boolean) => {
      // Join first, ring second: the callee's "accept" is an immediate join, so
      // arriving in an empty room would be a race the caller could lose.
      await voiceRef.current.join(roomId, peerName)
      if (video) await voiceRef.current.startCamera()
      setOutgoing({ roomId, peerId, peerName, video })

      try {
        await ringRef.current.mutateAsync({ roomId, video })
      } catch (cause) {
        setOutgoing(null)
        await voiceRef.current.leave()
        throw cause
      }
    },
    [],
  )

  const accept = useCallback(async () => {
    const call = incomingRef.current
    if (!call) return
    setIncoming(null)
    await voiceRef.current.join(call.roomId, call.fromDisplayName)
  }, [])

  const decline = useCallback(async () => {
    const call = incomingRef.current
    if (!call) return
    setIncoming(null)
    await notify(call.roomId, 'declined')
  }, [notify])

  const cancel = useCallback(async () => {
    const call = outgoingRef.current
    if (!call) return
    setOutgoing(null)
    await voiceRef.current.leave()
    await notify(call.roomId, 'cancelled')
  }, [notify])

  useEffect(() => {
    if (signedIn) return
    setIncoming(null)
    setOutgoing(null)
  }, [signedIn])

  useSocketEvent(
    'call_ringing',
    (event) => {
      // Your own other tab, or a repeat while one is already ringing: the first
      // ring stands, so answering in one place does not race with a second.
      if (event.from_user_id === user?.id) return
      if (incomingRef.current) return
      setIncoming({
        roomId: event.room_id,
        fromUserId: event.from_user_id,
        fromDisplayName: event.from_display_name,
        video: event.video,
      })
    },
    signedIn,
  )

  useSocketEvent(
    'call_ended',
    (event) => {
      if (incomingRef.current?.roomId === event.room_id) {
        setIncoming(null)
      }

      // Declined or hung up: stop calling, and stop sitting alone in the room.
      if (outgoingRef.current?.roomId === event.room_id) {
        setOutgoing(null)
        void voiceRef.current.leave()
      }
    },
    signedIn,
  )

  // A ring nobody answers stops on its own, on both sides. Keyed on which call
  // is ringing rather than on the state object, so the clock runs once per call
  // rather than restarting on every unrelated re-render.
  const incomingRoomId = incoming?.roomId ?? null
  useEffect(() => {
    if (!incomingRoomId) return
    const timer = window.setTimeout(() => setIncoming(null), RING_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [incomingRoomId])

  const outgoingRoomId = outgoing?.roomId ?? null
  useEffect(() => {
    if (!outgoingRoomId) return
    const timer = window.setTimeout(() => void cancel(), RING_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [outgoingRoomId, cancel])

  // They picked up. Anyone else in the room is the answer, and it arrives
  // through the media server rather than the API — the callee joins, and this
  // is how the caller finds out.
  const answered = voice.participants.length > 0
  useEffect(() => {
    if (answered) setOutgoing(null)
  }, [answered])

  // Leaving the call by any other route — the hang-up button in the call panel,
  // a navigation that tears the session down — also stops the ringing.
  const activeRoomId = voice.activeRoomId
  useEffect(() => {
    const call = outgoingRef.current
    if (call && activeRoomId !== call.roomId) {
      setOutgoing(null)
      void notify(call.roomId, 'cancelled')
    }
  }, [activeRoomId, notify])

  const value = useMemo<CallValue>(
    () => ({ incoming, outgoing, start, accept, decline, cancel }),
    [incoming, outgoing, start, accept, decline, cancel],
  )

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export function useCall(): CallValue {
  const context = useContext(CallContext)
  if (!context) {
    throw new Error('useCall must be used within a CallProvider')
  }
  return context
}
