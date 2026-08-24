import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { blocks, users } from '../api/endpoints'
import type { Uuid } from '../api/types'
import { queryKeys } from './keys'

export function useUserProfileQuery(token: string | null, userId: Uuid | null | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.users.detail(userId) : ['users', 'detail', null],
    queryFn: () => {
      if (!token || !userId) throw new Error('Missing token or userId')
      return users.get(token, userId)
    },
    enabled: Boolean(token && userId),
  })
}

export function useBlockedUsersQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.users.blocked(),
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.list(token)
    },
    enabled: Boolean(token),
  })
}

export function useBlockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.block(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.blocked() })
    },
  })
}

export function useUnblockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.unblock(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.blocked() })
    },
  })
}
