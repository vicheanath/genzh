import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rooms } from '../api/endpoints'
import type { RoomType, RoomVisibility, Uuid } from '../api/types'
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

export function useRoomParticipantsQuery(token: string | null, roomId: Uuid | null | undefined) {
  return useQuery({
    queryKey: roomId ? queryKeys.rooms.participants(roomId) : ['rooms', 'participants', null],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Missing token or roomId')
      return rooms.participants(token, roomId)
    },
    enabled: Boolean(token && roomId),
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
    },
  })
}
