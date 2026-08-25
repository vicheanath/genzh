import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { media, rooms } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type {
  CallEndReason,
  CreateCommunityRoomInput,
  CreateStandaloneRoomInput,
  RoomType,
  UpdateRoomInput,
  Uuid,
} from './types'

export const roomKeys = {
  all: ['rooms'] as const,
  discovery: (category?: string) => [...roomKeys.all, 'discovery', category ?? 'all'] as const,
  trending: () => [...roomKeys.all, 'trending'] as const,
  live: () => [...roomKeys.all, 'live'] as const,
  mine: () => [...roomKeys.all, 'mine'] as const,
  community: (communityId: Uuid) => [...roomKeys.all, 'community', communityId] as const,
  detail: (id: Uuid) => [...roomKeys.all, 'detail', id] as const,
  participants: (id: Uuid) => [...roomKeys.detail(id), 'participants'] as const,
}

/**
 * A key for a query that cannot run yet.
 *
 * `enabled: false` keeps the fetch from firing, but the key is still read, and
 * two disabled queries sharing one key would collide the moment either became
 * enabled. Naming the missing argument keeps them apart.
 */
const idle = (...parts: string[]) => [...roomKeys.all, 'idle', ...parts] as const

export function useDiscoveryRooms(category?: string, limit?: number) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomKeys.discovery(category),
    queryFn: () => rooms.discovery(null, category, limit),
    enabled: signedIn,
    // Discovery is a wall of what is happening *now*; a cached one from ten
    // minutes ago is a wall of what was.
    staleTime: 30_000,
  })
}

export function useTrendingRooms() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomKeys.trending(),
    queryFn: () => rooms.trending(null),
    enabled: signedIn,
  })
}

export function useLiveRooms() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomKeys.live(),
    queryFn: () => rooms.live(null),
    enabled: signedIn,
  })
}

export function useCommunityRoomsQuery(communityId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityId ? roomKeys.community(communityId) : idle('community'),
    queryFn: () => rooms.list(null, communityId!),
    enabled: signedIn && Boolean(communityId),
  })
}

export function useMyRoomsQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomKeys.mine(),
    queryFn: () => rooms.mine(null),
    enabled: signedIn,
  })
}

export function useRoomDetailQuery(roomId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomId ? roomKeys.detail(roomId) : idle('detail'),
    queryFn: () => rooms.get(null, roomId!),
    enabled: signedIn && Boolean(roomId),
  })
}

/**
 * Open a room: join it, and read back what you may do in it.
 *
 * Joining is what establishes presence and mints the anonymous identity, so it
 * has to happen before the screen can render — but it is idempotent, and the
 * room it returns is the same record `useRoomDetailQuery` holds. It shares that
 * key for exactly that reason, and never refetches on its own: re-joining on a
 * window focus would churn presence for somebody alt-tabbing.
 */
export function useJoinedRoomQuery(roomId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomId ? roomKeys.detail(roomId) : idle('joined'),
    queryFn: () => rooms.join(null, roomId!),
    enabled: signedIn && Boolean(roomId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useRoomParticipantsQuery(roomId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomId ? roomKeys.participants(roomId) : idle('participants'),
    queryFn: () => rooms.participants(null, roomId!),
    enabled: signedIn && Boolean(roomId),
  })
}

export function useCreateStandaloneRoomMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStandaloneRoomInput) => rooms.createStandalone(null, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}

export function useCreateCommunityRoomMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommunityRoomInput) => rooms.create(null, communityId!, input),
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: roomKeys.community(communityId) })
      }
    },
  })
}

export function useUpdateRoomMutation(roomId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateRoomInput) => rooms.update(null, roomId!, input),
    onSuccess: () => {
      if (roomId) queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}

export function useDeleteRoomMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => rooms.delete(null, roomId),
    onSuccess: (_result, roomId) => {
      queryClient.removeQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}

export function useJoinRoomMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => rooms.join(null, roomId),
    onSuccess: (room, roomId) => {
      queryClient.setQueryData(roomKeys.detail(roomId), room)
      queryClient.invalidateQueries({ queryKey: roomKeys.participants(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}

export function useLeaveRoomMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => rooms.leave(null, roomId),
    onSuccess: (_result, roomId) => {
      queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.participants(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}

/** Switch between an anonymous identity and the real profile inside a room. */
export function useSetPersonaMutation(roomId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isAnonymous: boolean) => rooms.setPersona(null, roomId!, isAnonymous),
    onSuccess: () => {
      if (!roomId) return
      queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.participants(roomId) })
    },
  })
}

export function useOpenDMMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: Uuid) => rooms.openDM(null, targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}

/**
 * Pick a room at random.
 *
 * A mutation rather than a query: it is an action the user takes, and two
 * presses must produce two different rooms, which is the opposite of what a
 * cache is for.
 */
export function useRandomRoomMutation() {
  return useMutation({
    mutationFn: (input: { category?: string; roomType?: RoomType } = {}) =>
      rooms.random(null, input.category, input.roomType),
  })
}

/** Mint a media credential for the room's voice/video session. */
export function useJoinMediaSessionMutation() {
  return useMutation({
    mutationFn: (roomId: Uuid) => media.join(null, roomId),
  })
}

/** Ring the other person in a direct conversation. */
export function useRingMutation() {
  return useMutation({
    mutationFn: ({ roomId, video }: { roomId: Uuid; video: boolean }) =>
      media.ring(null, roomId, video),
  })
}

/** Stop a call that has not connected — a hang-up before the answer, or a decline. */
export function useEndCallMutation() {
  return useMutation({
    mutationFn: ({ roomId, reason }: { roomId: Uuid; reason: CallEndReason }) =>
      media.endCall(null, roomId, reason),
  })
}
