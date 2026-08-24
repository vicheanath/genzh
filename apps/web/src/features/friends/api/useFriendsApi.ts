import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friendsApi } from './friendsApi'
import type { Uuid } from './types'

export const friendKeys = {
  all: ['friends'] as const,
  list: () => [...friendKeys.all, 'list'] as const,
  pending: () => [...friendKeys.all, 'pending'] as const,
  sent: () => [...friendKeys.all, 'sent'] as const,
  presence: (ids?: Uuid[]) => [...friendKeys.all, 'presence', ids?.join(',') ?? 'all'] as const,
  blocked: ['blocks'] as const,
}

export function useFriendsList(token: string | null) {
  return useQuery({
    queryKey: friendKeys.list(),
    queryFn: () => (token ? friendsApi.listFriends(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function usePendingFriendRequests(token: string | null) {
  return useQuery({
    queryKey: friendKeys.pending(),
    queryFn: () => (token ? friendsApi.listPendingRequests(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useSentFriendRequests(token: string | null) {
  return useQuery({
    queryKey: friendKeys.sent(),
    queryFn: () => (token ? friendsApi.listSentRequests(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useBlockedUsers(token: string | null) {
  return useQuery({
    queryKey: friendKeys.blocked,
    queryFn: () => (token ? friendsApi.listBlockedUsers(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useSendFriendRequestMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friendsApi.sendRequest(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.sent() })
    },
  })
}

export function useRespondFriendRequestMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ requesterId, accept }: { requesterId: Uuid; accept: boolean }) => {
      if (!token) throw new Error('Unauthenticated')
      return friendsApi.respondRequest(token, requesterId, accept)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.list() })
      queryClient.invalidateQueries({ queryKey: friendKeys.pending() })
    },
  })
}

export function useRemoveFriendMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friendsApi.removeFriend(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.list() })
    },
  })
}

export function useBlockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friendsApi.blockUser(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.blocked })
      queryClient.invalidateQueries({ queryKey: friendKeys.list() })
    },
  })
}

export function useUnblockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friendsApi.unblockUser(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.blocked })
    },
  })
}
