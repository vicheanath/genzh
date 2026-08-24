import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { roomsApi } from './roomsApi'
import type {
  CreateCommunityRoomInput,
  CreateStandaloneRoomInput,
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

export function useDiscoveryRooms(token: string | null, category?: string, limit?: number) {
  return useQuery({
    queryKey: roomKeys.discovery(category),
    queryFn: () => (token ? roomsApi.getDiscovery(token, category, limit) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useTrendingRooms(token: string | null) {
  return useQuery({
    queryKey: roomKeys.trending(),
    queryFn: () => (token ? roomsApi.getTrending(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useLiveRooms(token: string | null) {
  return useQuery({
    queryKey: roomKeys.live(),
    queryFn: () => (token ? roomsApi.getLive(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useCommunityRoomsQuery(token: string | null, communityId: Uuid | null) {
  return useQuery({
    queryKey: communityId ? roomKeys.community(communityId) : ['rooms', 'unselected', 'community'],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Unauthenticated or missing community')
      return roomsApi.getCommunityRooms(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useMyRoomsQuery(token: string | null) {
  return useQuery({
    queryKey: roomKeys.mine(),
    queryFn: () => (token ? roomsApi.getMyRooms(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useRoomDetailQuery(token: string | null, roomId: Uuid | null) {
  return useQuery({
    queryKey: roomId ? roomKeys.detail(roomId) : ['rooms', 'unselected', 'detail'],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Unauthenticated or invalid room ID')
      return roomsApi.getRoom(token, roomId)
    },
    enabled: Boolean(token && roomId),
  })
}

export function useRoomParticipantsQuery(token: string | null, roomId: Uuid | null) {
  return useQuery({
    queryKey: roomId ? roomKeys.participants(roomId) : ['rooms', 'unselected', 'participants'],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Unauthenticated or invalid room ID')
      return roomsApi.getParticipants(token, roomId)
    },
    enabled: Boolean(token && roomId),
  })
}

export function useCreateStandaloneRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStandaloneRoomInput) => {
      if (!token) throw new Error('Unauthenticated')
      return roomsApi.createStandalone(token, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
      queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}

export function useCreateCommunityRoomMutation(token: string | null, communityId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommunityRoomInput) => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid community ID')
      return roomsApi.createCommunityRoom(token, communityId, input)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: roomKeys.community(communityId) })
      }
    },
  })
}

export function useJoinRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return roomsApi.join(token, roomId)
    },
    onSuccess: (_data, roomId) => {
      queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.participants(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}

export function useLeaveRoomMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return roomsApi.leave(token, roomId)
    },
    onSuccess: (_data, roomId) => {
      queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.participants(roomId) })
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}

export function useUpdateRoomMutation(token: string | null, roomId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateRoomInput) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room ID')
      return roomsApi.update(token, roomId, input)
    },
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) })
      }
      queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}

export function useOpenDMMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return roomsApi.openDM(token, targetUserId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
    },
  })
}
