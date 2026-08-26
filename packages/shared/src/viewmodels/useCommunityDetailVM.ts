import { useCallback } from 'react'
import {
  useAssignRoleMutation,
  useCreateRoleMutation,
  useDeleteCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  useRemoveRoleMutation,
  useUpdateCommunityMutation,
} from '../queries/communities.queries'
import { useCommunityOverviewQuery } from '../queries/bff.queries'
import {
  useCreateCommunityRoomMutation,
  useDeleteRoomMutation,
  type CreateCommunityRoomInput,
} from '../queries/rooms.queries'
import type { Uuid } from '../api/types'

/**
 * One community screen, one request.
 *
 * This used to open with four parallel reads — the community, its members, its
 * roles and its channels — which on a phone meant four TLS round-trips before
 * anything rendered, and four separate loading states to reconcile. The server
 * already composes all four, so the screen asks for them together.
 *
 * The overview seeds the per-resource caches it answers for, so screens that
 * read those directly (the member list, mention autocomplete) still find their
 * data without a second fetch.
 */
export function useCommunityDetailVM(token: string | null, communityId: Uuid | null | undefined) {
  const overviewQuery = useCommunityOverviewQuery(token, communityId)
  const overview = overviewQuery.data ?? null

  const joinMutation = useJoinCommunityMutation(token)
  const leaveMutation = useLeaveCommunityMutation(token)
  const updateCommunityMutation = useUpdateCommunityMutation(token)
  const deleteCommunityMutation = useDeleteCommunityMutation(token)
  const createRoleMutation = useCreateRoleMutation(token)
  const assignRoleMutation = useAssignRoleMutation(token)
  const removeRoleMutation = useRemoveRoleMutation(token)
  const createRoomMutation = useCreateCommunityRoomMutation(token)
  const deleteRoomMutation = useDeleteRoomMutation(token)

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

  const updateCommunity = useCallback(
    async (input: { name?: string; description?: string; icon_url?: string }) => {
      if (!communityId) return
      return updateCommunityMutation.mutateAsync({ communityId, input })
    },
    [communityId, updateCommunityMutation],
  )

  const deleteCommunity = useCallback(async () => {
    if (!communityId) return
    return deleteCommunityMutation.mutateAsync(communityId)
  }, [communityId, deleteCommunityMutation])

  const createRole = useCallback(
    async (input: { name: string; color?: string; position?: number; permissions?: string[] }) => {
      if (!communityId) return
      return createRoleMutation.mutateAsync({ communityId, input })
    },
    [communityId, createRoleMutation],
  )

  const assignRole = useCallback(
    async (userId: Uuid, roleId: Uuid) => {
      if (!communityId) return
      return assignRoleMutation.mutateAsync({ communityId, userId, roleId })
    },
    [communityId, assignRoleMutation],
  )

  const removeRole = useCallback(
    async (userId: Uuid, roleId: Uuid) => {
      if (!communityId) return
      return removeRoleMutation.mutateAsync({ communityId, userId, roleId })
    },
    [communityId, removeRoleMutation],
  )

  const createRoom = useCallback(
    async (input: CreateCommunityRoomInput) => {
      if (!communityId) return
      return createRoomMutation.mutateAsync({ communityId, input })
    },
    [communityId, createRoomMutation],
  )

  const deleteRoom = useCallback(
    async (roomId: Uuid) => {
      return deleteRoomMutation.mutateAsync(roomId)
    },
    [deleteRoomMutation],
  )

  return {
    // Model state
    community: overview?.community ?? null,
    members: overview?.members ?? [],
    roles: overview?.roles ?? [],
    rooms: overview?.rooms ?? [],

    // Permissions
    yourPermissions: overview?.community.your_permissions ?? [],

    // Status
    isLoading: overviewQuery.isLoading,
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,
    isUpdatingCommunity: updateCommunityMutation.isPending,
    isDeletingCommunity: deleteCommunityMutation.isPending,
    isCreatingRole: createRoleMutation.isPending,
    isAssigningRole: assignRoleMutation.isPending,
    isRemovingRole: removeRoleMutation.isPending,
    isCreatingRoom: createRoomMutation.isPending,
    isDeletingRoom: deleteRoomMutation.isPending,

    // Errors
    error: overviewQuery.error,

    // Actions
    join,
    leave,
    updateCommunity,
    deleteCommunity,
    createRole,
    assignRole,
    removeRole,
    createRoom,
    deleteRoom,
    // The four used to be separable; they are one request now, so all four
    // names refetch the same thing rather than breaking every call site.
    refetchCommunity: overviewQuery.refetch,
    refetchMembers: overviewQuery.refetch,
    refetchRoles: overviewQuery.refetch,
    refetchRooms: overviewQuery.refetch,
  }
}

