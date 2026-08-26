import { useCallback } from 'react'
import { useBlockUserMutation, useUnblockUserMutation } from '../queries/users.queries'
import { useSocialOverviewQuery } from '../queries/bff.queries'
import type { Uuid } from '../api/types'

/**
 * Who you have blocked.
 *
 * Reads the same social payload the friends screen does. The two view models
 * are mounted side by side on that screen, so sharing one cache entry turns
 * what used to be two requests into zero extra ones — and the settings screen,
 * which mounts this alone, still gets the whole graph in a single call.
 */
export function useBlockedUsersVM(token: string | null) {
  const query = useSocialOverviewQuery(token)
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
    blockedUsers: query.data?.blocked ?? [],

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
