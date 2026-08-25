import { useCallback } from 'react'
import {
  useAssignRoleMutation,
  useCommunityMembersQuery,
  useCommunityQuery,
  useCommunityRolesQuery,
  useCreateRoleMutation,
  useDeleteCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  useRemoveRoleMutation,
  useUpdateCommunityMutation,
} from '../queries/communities.queries'
import {
  useCreateCommunityRoomMutation,
  useDeleteRoomMutation,
  useRoomsQuery,
  type CreateCommunityRoomInput,
} from '../queries/rooms.queries'
import type { Uuid } from '../api/types'

export function useCommunityDetailVM(token: string | null, communityId: Uuid | null | undefined) {
  const communityQuery = useCommunityQuery(token, communityId)
  const membersQuery = useCommunityMembersQuery(token, communityId)
  const rolesQuery = useCommunityRolesQuery(token, communityId)
  const roomsQuery = useRoomsQuery(token, communityId ?? undefined)

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
    isUpdatingCommunity: updateCommunityMutation.isPending,
    isDeletingCommunity: deleteCommunityMutation.isPending,
    isCreatingRole: createRoleMutation.isPending,
    isAssigningRole: assignRoleMutation.isPending,
    isRemovingRole: removeRoleMutation.isPending,
    isCreatingRoom: createRoomMutation.isPending,
    isDeletingRoom: deleteRoomMutation.isPending,

    // Errors
    error: communityQuery.error || membersQuery.error || roomsQuery.error,

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
    refetchCommunity: communityQuery.refetch,
    refetchMembers: membersQuery.refetch,
    refetchRoles: rolesQuery.refetch,
    refetchRooms: roomsQuery.refetch,
  }
}

