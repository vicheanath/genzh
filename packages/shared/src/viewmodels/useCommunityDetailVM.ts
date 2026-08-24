import { useCallback } from 'react'
import {
  useCommunityMembersQuery,
  useCommunityQuery,
  useCommunityRolesQuery,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
} from '../queries/communities.queries'
import { useRoomsQuery } from '../queries/rooms.queries'
import type { Uuid } from '../api/types'

export function useCommunityDetailVM(token: string | null, communityId: Uuid | null | undefined) {
  const communityQuery = useCommunityQuery(token, communityId)
  const membersQuery = useCommunityMembersQuery(token, communityId)
  const rolesQuery = useCommunityRolesQuery(token, communityId)
  const roomsQuery = useRoomsQuery(token, communityId ?? undefined)

  const joinMutation = useJoinCommunityMutation(token)
  const leaveMutation = useLeaveCommunityMutation(token)

  const join = useCallback(async () => {
    if (!communityId) return
    return joinMutation.mutateAsync(communityId)
  }, [communityId, joinMutation])

  const leave = useCallback(
    async (userId: Uuid) => {
      if (!communityId) return
      return leaveMutation.mutateAsync({ communityId, userId })
    },
    [communityId, leaveMutation],
  )

  return {
    // Model state
    community: communityQuery.data ?? null,
    members: membersQuery.data ?? [],
    roles: rolesQuery.data ?? [],
    rooms: roomsQuery.data ?? [],

    // Permissions
    yourPermissions: communityQuery.data?.your_permissions ?? [],

    // Status
    isLoading: communityQuery.isLoading || membersQuery.isLoading || roomsQuery.isLoading,
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,

    // Errors
    error: communityQuery.error || membersQuery.error || roomsQuery.error,

    // Actions
    join,
    leave,
    refetchCommunity: communityQuery.refetch,
    refetchMembers: membersQuery.refetch,
    refetchRooms: roomsQuery.refetch,
  }
}
