import { useCallback } from 'react'
import {
  useBlockedUsersQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
} from '../queries/users.queries'
import type { Uuid } from '../api/types'

export function useBlockedUsersVM(token: string | null) {
  const query = useBlockedUsersQuery(token)
  const blockMutation = useBlockUserMutation(token)
  const unblockMutation = useUnblockUserMutation(token)

  const blockUser = useCallback(
    async (userId: Uuid) => {
      return blockMutation.mutateAsync(userId)
    },
    [blockMutation],
  )

  const unblockUser = useCallback(
    async (userId: Uuid) => {
      return unblockMutation.mutateAsync(userId)
    },
    [unblockMutation],
  )

  return {
    // Model state
    blockedUsers: query.data ?? [],

    // Status
    isLoading: query.isLoading,
    isBlocking: blockMutation.isPending,
    isUnblocking: unblockMutation.isPending,

    // Errors
    error: query.error,

    // Actions
    blockUser,
    unblockUser,
    refresh: query.refetch,
  }
}
