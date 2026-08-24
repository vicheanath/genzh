import { useCallback } from 'react'
import {
  useCommunitiesQuery,
  useCreateCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
} from '../queries/communities.queries'
import type { Uuid } from '../api/types'

export function useCommunitiesVM(token: string | null) {
  const listQuery = useCommunitiesQuery(token)
  const createMutation = useCreateCommunityMutation(token)
  const joinMutation = useJoinCommunityMutation(token)
  const leaveMutation = useLeaveCommunityMutation(token)

  const createCommunity = useCallback(
    async (input: { name: string; description?: string; icon_url?: string }) => {
      return createMutation.mutateAsync(input)
    },
    [createMutation],
  )

  const joinCommunity = useCallback(
    async (communityId: Uuid) => {
      return joinMutation.mutateAsync(communityId)
    },
    [joinMutation],
  )

  const leaveCommunity = useCallback(
    async (communityId: Uuid, userId: Uuid) => {
      return leaveMutation.mutateAsync({ communityId, userId })
    },
    [leaveMutation],
  )

  return {
    // Model state
    communities: listQuery.data ?? [],

    // Loading states
    isLoading: listQuery.isLoading,
    isRefetching: listQuery.isRefetching,
    isCreating: createMutation.isPending,
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,

    // Errors
    error: listQuery.error,
    createError: createMutation.error,
    joinError: joinMutation.error,
    leaveError: leaveMutation.error,

    // Actions
    createCommunity,
    joinCommunity,
    leaveCommunity,
    refresh: listQuery.refetch,
  }
}
