import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friends } from '../api/endpoints'
import type { Uuid } from '../api/types'
import { queryKeys } from './keys'

export function useFriendsListQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.friends.list(),
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return friends.list(token)
    },
    enabled: Boolean(token),
  })
}

export function usePendingFriendsQuery(token: string | null) {
  return useQuery({
    queryKey: [...queryKeys.friends.all, 'pending'],
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return friends.pending(token)
    },
    enabled: Boolean(token),
  })
}

export function useSentFriendsQuery(token: string | null) {
  return useQuery({
    queryKey: [...queryKeys.friends.all, 'sent'],
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return friends.sent(token)
    },
    enabled: Boolean(token),
  })
}

export function useSendFriendRequestMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friends.request(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
    },
  })
}

export function useRespondFriendRequestMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ requesterId, accept }: { requesterId: Uuid; accept: boolean }) => {
      if (!token) throw new Error('Unauthenticated')
      return friends.respond(token, requesterId, accept)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
    },
  })
}

export function useRemoveFriendMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return friends.remove(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
    },
  })
}
