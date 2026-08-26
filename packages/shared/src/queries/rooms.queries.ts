import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rooms } from '../api/endpoints'
import type { RoomStatus, RoomType, RoomVisibility, Uuid } from '../api/types'
import { queryKeys } from './keys'

export interface CreateStandaloneRoomInput {
  name: string
  room_type: RoomType
  topic?: string
  category?: string
  visibility?: RoomVisibility
  is_anonymous?: boolean
  duration_minutes?: number
  max_participants?: number
  participant_ids?: Uuid[]
}

export interface CreateCommunityRoomInput {
  name: string
  room_type: RoomType
  topic?: string
  category?: string
  visibility?: RoomVisibility
  is_anonymous?: boolean
  duration_minutes?: number
  position?: number
  max_participants?: number
}

export function useRoomsQuery(token: string | null, communityId?: Uuid) {
  return useQuery({
    queryKey: queryKeys.rooms.lists(communityId),
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return communityId ? rooms.list(token, communityId) : rooms.mine(token)
    },
    enabled: Boolean(token),
  })
}

export function useRoomQuery(token: string | null, roomId: Uuid | null | undefined) {
  return useQuery({
    queryKey: roomId ? queryKeys.rooms.detail(roomId) : ['rooms', 'detail', null],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Missing token or roomId')
      return rooms.get(token, roomId)
    },
    enabled: Boolean(token && roomId),
  })
}

/**
 * Public rooms to browse.
 *
 * Kept fresher than the other lists: discovery is a wall of what is happening
 * *now*, and a cached one from ten minutes ago is a wall of what was.
 */
export function useDiscoveryQuery(token: string | null, category?: string, limit?: number) {
  return useQuery({
    queryKey: queryKeys.rooms.discovery(category),
    queryFn: () => {
      if (!token) throw new Error('Missing token')
      return rooms.discovery(token, category, limit)
    },
    enabled: Boolean(token),
    staleTime: 30_000,
  })
}

/** The rooms you are already in, direct messages included. */
export function useMyRoomsQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.rooms.mine(),
    queryFn: () => {
      if (!token) throw new Error('Missing token')
      return rooms.mine(token)
    },
    enabled: Boolean(token),
  })
}

export interface RoomParticipantsOptions {
  /** Held off by the caller — a call only wants the roster once it is in. */
  enabled?: boolean
  /**
   * Reconcile on a timer as well as on socket events.
   *
   * Only a call asks for this. The socket already reports arrivals and
   * departures, so the poll is there to catch a role change or a missed frame,
   * not to be the source of truth.
   */
  refetchInterval?: number
}

export function useRoomParticipantsQuery(
  token: string | null,
  roomId: Uuid | null | undefined,
  { enabled = true, refetchInterval }: RoomParticipantsOptions = {},
) {
  return useQuery({
    queryKey: roomId ? queryKeys.rooms.participants(roomId) : ['rooms', 'participants', null],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Missing token or roomId')
      return rooms.participants(token, roomId)
    },
    enabled: enabled && Boolean(token && roomId),
    refetchInterval,
  })
}

export function useCreateStandaloneRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStandaloneRoomInput) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.createStandalone(token, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() })
    },
  })
}

export function useCreateCommunityRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ communityId, input }: { communityId: Uuid; input: CreateCommunityRoomInput }) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.create(token, communityId, input)
    },
    onSuccess: (_room, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists(communityId) })
      // The community overview carries this community's channel list, and it
      // hangs under `communities.detail`, not under `rooms`.
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useDeleteRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.delete(token, roomId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
      // A deleted room leaves its community's overview holding a channel that
      // no longer exists. Only the room id is in hand — not the community it
      // belonged to — so this widens to every community rather than guessing.
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
    },
  })
}

export function useOpenDMMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.openDM(token, targetUserId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() })
    },
  })
}

export function useUpdateRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      roomId,
      input,
    }: {
      roomId: Uuid
      input: {
        name?: string
        topic?: string
        category?: string
        visibility?: RoomVisibility
        status?: RoomStatus
        position?: number
        max_participants?: number
      }
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.update(token, roomId, input)
    },
    onSuccess: (_room, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
      // Renaming or re-categorising a channel changes how it reads in its
      // community's overview, which is not under `rooms`. Same missing
      // community id as the delete above.
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
    },
  })
}

