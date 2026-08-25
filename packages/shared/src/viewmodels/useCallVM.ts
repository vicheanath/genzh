import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '../api/client'
import { media as mediaApi, rooms as roomsApi } from '../api/endpoints'
import type { RoomParticipant, RoomParticipantRole, Uuid } from '../api/types'
import type { CallClient, CallClientState, CameraFacing } from '../media/client'
import { queryKeys } from '../queries/keys'
import { useRoomParticipantsQuery } from '../queries/rooms.queries'

/**
 * One person in the call, with both halves of the truth about them.
 *
 * There are two sources and they know different things. The SFU knows the live
 * media — who is transmitting, on which track, whether they are speaking right
 * now. The REST roster knows the membership — role, whether they joined
 * anonymously. Neither is sufficient and they arrive on different clocks.
 */
export interface CallMember {
  /** The user id, which is what every other part of the app keys on. */
  id: Uuid
  displayName: string | null
  role: RoomParticipantRole
  anonymous: boolean
  muted: boolean
  speaking: boolean
  cameraOn: boolean
  screenSharing: boolean
  handRaised: boolean
  /** Live tracks, present only while the SFU is actually delivering them. */
  stream: unknown | null
  cameraStream: unknown | null
  screenStream: unknown | null
}

/** What this build can do, decided by the platform and injected. */
export interface CallCapabilities {
  audio: boolean
  camera: boolean
  screenShare: boolean
}

export interface CallVMOptions {
  client: CallClient
  token: string | null
  /** The signed-in user's id, so their own row can be told apart. */
  selfUserId: Uuid | null
  capabilities: CallCapabilities
  /** Asks the OS. Returns whether it was granted. */
  requestMicrophone?: () => Promise<boolean>
  requestCamera?: () => Promise<boolean>
}

/** How often the membership roster is reconciled against the server. */
const ROSTER_INTERVAL_MS = 30_000

const DEFAULT_CAPABILITIES: CallCapabilities = { audio: true, camera: true, screenShare: true }

/**
 * The call, as one view model.
 *
 * ## Why the merge below matters
 *
 * This replaces a provider that subscribed to the media client and then read
 * four booleans off it — `isCameraOn`, `isScreenSharing`, `handRaised`, `error`
 * — and threw the rest away. In particular it threw away
 * `state.participants`, which is the only place remote tracks ever appear.
 * The roster the UI actually rendered came from a REST poll every ten seconds,
 * whose rows carry no streams at all.
 *
 * So: remote video could not render, a remote screen share could not render,
 * and `speaking` was computed as "not muted", which meant everyone with a live
 * mic appeared to be talking forever. The tiles were wired to a list that
 * structurally could not contain the thing they were trying to draw.
 *
 * Here the SFU is authoritative for media and the roster only backfills
 * identity, which is the arrangement the two sources actually support.
 *
 * ## Why the client's state is mirrored rather than copied
 *
 * The old provider also kept its own `useState` for camera and screen state
 * *and* set it optimistically in the toggles, while the subscription set it
 * too. Two writers, one value, and a failed `startCamera` left the button lit
 * with no camera running. The client owns that state; this holds one snapshot
 * of it and never second-guesses it.
 */
export function useCallVM({
  client,
  token,
  selfUserId,
  capabilities = DEFAULT_CAPABILITIES,
  requestMicrophone,
  requestCamera,
}: CallVMOptions) {
  const [activeRoomId, setActiveRoomId] = useState<Uuid | null>(null)
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null)
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'joined'>('idle')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  const queryClient = useQueryClient()

  // One snapshot of the client, kept in sync by its own subscription. The
  // client is the writer; nothing here sets these fields directly.
  const [media, setMedia] = useState<CallClientState>(() => client.getState())

  useEffect(() => {
    setMedia(client.getState())
    return client.subscribe(setMedia)
  }, [client])

  // ── the roster ────────────────────────────────────────────────────────────
  //
  // Read from the query cache rather than fetched here. Opening the room
  // session already returned the participant list and wrote it under this key,
  // so by the time the join settles the roster is present without a request of
  // its own — the waterfall this used to run is now one round-trip that
  // happened during `client.join()`.
  //
  // Held off until `joined` for the same reason: enabling it while the session
  // is still in flight would fetch exactly what that response is about to
  // deliver. The interval is slower than the socket, which reports arrivals and
  // departures as they happen; this only has to catch a role change or a
  // missed frame.

  const participantsQuery = useRoomParticipantsQuery(token, activeRoomId, {
    enabled: joinState === 'joined',
    refetchInterval: ROSTER_INTERVAL_MS,
  })

  const roster = useMemo<RoomParticipant[]>(
    () => participantsQuery.data ?? [],
    [participantsQuery.data],
  )

  const { refetch: refetchRoster } = participantsQuery
  const refreshRoster = useCallback(async () => {
    // A roster that failed to refresh is not worth interrupting a call for; the
    // next interval tick reconciles it.
    await refetchRoster().catch(() => undefined)
  }, [refetchRoster])

  // ── the clock ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (media.status !== 'connected') {
      setDuration(0)
      return
    }
    const timer = setInterval(() => setDuration((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [media.status])

  // ── the merge ─────────────────────────────────────────────────────────────

  const members = useMemo<CallMember[]>(() => {
    const byUser = new Map<Uuid, RoomParticipant>()
    for (const row of roster) byUser.set(row.user_id, row)

    const merged = media.participants.map<CallMember>((participant) => {
      const row = byUser.get(participant.userId as Uuid)
      byUser.delete(participant.userId as Uuid)
      return {
        id: participant.userId as Uuid,
        displayName: participant.displayName || null,
        role: row?.role ?? 'participant',
        anonymous: row?.is_anonymous ?? false,
        muted: participant.muted,
        speaking: participant.speaking,
        cameraOn: participant.cameraOn ?? false,
        screenSharing: participant.screenSharing ?? false,
        handRaised: participant.handRaised ?? false,
        stream: participant.stream ?? null,
        cameraStream: participant.cameraStream ?? participant.stream ?? null,
        screenStream: participant.screenStream ?? null,
      }
    })

    // Anyone the server lists who has no live connection yet — they joined the
    // room but their media session has not come up. Shown, because a tile that
    // appears the instant someone arrives is better than one that waits for a
    // track, but with nothing claimed about their media.
    for (const row of byUser.values()) {
      if (row.user_id === selfUserId) continue
      merged.push({
        id: row.user_id,
        displayName: null,
        role: row.role,
        anonymous: row.is_anonymous,
        muted: row.is_muted,
        speaking: false,
        cameraOn: false,
        screenSharing: false,
        handRaised: false,
        stream: null,
        cameraStream: null,
        screenStream: null,
      })
    }

    return merged.filter((member) => member.id !== selfUserId)
  }, [media.participants, roster, selfUserId])

  /** Whoever's screen is on the wire, yours included. */
  const screenSharer = useMemo<CallMember | null>(() => {
    if (media.isScreenSharing) {
      return {
        id: (selfUserId ?? 'self') as Uuid,
        displayName: null,
        role: 'participant',
        anonymous: false,
        muted: media.muted,
        speaking: false,
        cameraOn: media.isCameraOn,
        screenSharing: true,
        handRaised: media.handRaised,
        stream: media.screenStream,
        cameraStream: media.cameraStream,
        screenStream: media.screenStream,
      }
    }
    return members.find((member) => member.screenSharing) ?? null
  }, [media, members, selfUserId])

  // ── actions ───────────────────────────────────────────────────────────────

  const join = useCallback(
    async (roomId: Uuid, name: string) => {
      setActiveRoomId(roomId)
      setActiveRoomName(name)
      setJoinState('joining')
      setJoinError(null)

      try {
        if (!token) throw new Error('Not signed in')
        await requestMicrophone?.()

        // One round-trip, inside `client.join()`. The client asks its session
        // factory for a credential, and that factory opens the room session —
        // which joins the room, mints the SFU token and returns the roster in
        // the same response. There is no separate `rooms.join` here any more,
        // and no participants fetch: both were folded into that call.
        await client.join()
        setJoinState('joined')
      } catch (cause) {
        setJoinState('idle')
        setJoinError(cause instanceof ApiError ? cause.message : 'Could not join the call')
      }
    },
    [client, token, requestMicrophone],
  )

  const leave = useCallback(async () => {
    const roomId = activeRoomId

    setActiveRoomId(null)
    setActiveRoomName(null)
    setJoinState('idle')
    setJoinError(null)

    await client.leave()

    if (!roomId || !token) return
    try {
      await mediaApi.leave(token, roomId)
      await roomsApi.leave(token, roomId)
    } catch {
      // The session is already torn down locally; a failed tidy-up on the
      // server reconciles when the socket drops.
    }

    // Whatever the session seeded is now wrong: the roster still lists this
    // user, and the credential in it is spent. Dropped rather than refetched —
    // nothing is looking at this room any more, and re-opening it is a POST
    // that would join it again.
    queryClient.removeQueries({ queryKey: queryKeys.bff.roomSession(roomId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.rooms.participants(roomId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() })
  }, [activeRoomId, token, client, queryClient])

  const toggleMute = useCallback(() => {
    client.setMuted(!media.muted)
  }, [client, media.muted])

  const toggleCamera = useCallback(async () => {
    if (!capabilities.camera) return
    if (media.isCameraOn) {
      await client.stopCamera()
      return
    }
    // Asked at the moment it is needed, rather than up front: a permission
    // prompt makes sense next to the button that caused it.
    const granted = (await requestCamera?.()) ?? true
    if (!granted) return
    await client.startCamera()
  }, [client, media.isCameraOn, capabilities.camera, requestCamera])

  const switchCamera = useCallback(async () => {
    if (!media.isCameraOn) return
    await client.switchCamera()
  }, [client, media.isCameraOn])

  const toggleScreenShare = useCallback(async () => {
    if (!capabilities.screenShare) return
    if (media.isScreenSharing) {
      await client.stopScreenShare()
      return
    }
    await client.startScreenShare()
  }, [client, media.isScreenSharing, capabilities.screenShare])

  const toggleHandRaise = useCallback(() => client.toggleHandRaise(), [client])

  // A join that never reached `connected` and a socket that dropped mid-call
  // are different failures, and the UI says different things about them.
  const status = joinState === 'joining' ? 'connecting' : media.status

  return {
    // Model state
    activeRoomId,
    activeRoomName,
    members,
    screenSharer,
    duration,
    muted: media.muted,
    isCameraOn: media.isCameraOn,
    cameraFacing: (media.cameraFacing ?? 'user') as CameraFacing,
    cameraStream: media.cameraStream,
    isScreenSharing: media.isScreenSharing,
    screenStream: media.screenStream,
    handRaised: media.handRaised,
    capabilities,

    // Status
    status,
    isJoining: joinState === 'joining',
    isConnected: media.status === 'connected',
    isReconnecting: media.status === 'reconnecting',
    inCall: activeRoomId !== null,

    // Errors
    error: joinError ?? media.error,
    joinError,
    mediaError: media.error,

    // Actions
    join,
    leave,
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    toggleHandRaise,
    refreshRoster,
  }
}

export type CallVM = ReturnType<typeof useCallVM>
