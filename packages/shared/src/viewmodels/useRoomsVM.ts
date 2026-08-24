import { useCallback } from 'react'
import {
  useCreateCommunityRoomMutation,
  useCreateStandaloneRoomMutation,
  useDeleteRoomMutation,
  useRoomsQuery,
  type CreateCommunityRoomInput,
  type CreateStandaloneRoomInput,
} from '../queries/rooms.queries'
import type { Uuid } from '../api/types'

export function useRoomsVM(token: string | null, communityId?: Uuid) {
  const roomsQuery = useRoomsQuery(token, communityId)
  const createStandaloneMutation = useCreateStandaloneRoomMutation(token)
  const createCommunityMutation = useCreateCommunityRoomMutation(token)
  const deleteMutation = useDeleteRoomMutation(token)

  const createStandaloneRoom = useCallback(
    async (input: CreateStandaloneRoomInput) => {
      return createStandaloneMutation.mutateAsync(input)
    },
    [createStandaloneMutation],
  )

  const createCommunityRoom = useCallback(
    async (targetCommunityId: Uuid, input: CreateCommunityRoomInput) => {
      return createCommunityMutation.mutateAsync({
        communityId: targetCommunityId,
        input,
      })
    },
    [createCommunityMutation],
  )

  const deleteRoom = useCallback(
    async (roomId: Uuid) => {
      return deleteMutation.mutateAsync(roomId)
    },
    [deleteMutation],
  )

  return {
    // Model state
    rooms: roomsQuery.data ?? [],

    // Status
    isLoading: roomsQuery.isLoading,
    isCreatingStandalone: createStandaloneMutation.isPending,
    isCreatingCommunity: createCommunityMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Errors
    error: roomsQuery.error,
    createStandaloneError: createStandaloneMutation.error,
    createCommunityError: createCommunityMutation.error,
    deleteError: deleteMutation.error,

    // Actions
    createStandaloneRoom,
    createCommunityRoom,
    deleteRoom,
    refresh: roomsQuery.refetch,
  }
}
