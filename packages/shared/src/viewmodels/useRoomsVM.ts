import { useCallback } from 'react'
import {
  useCreateCommunityRoomMutation,
  useCreateStandaloneRoomMutation,
  useDeleteRoomMutation,
  useDiscoveryQuery,
  useMyRoomsQuery,
  useRoomsQuery,
  type CreateCommunityRoomInput,
  type CreateStandaloneRoomInput,
} from '../queries/rooms.queries'
import type { Uuid } from '../api/types'

export interface RoomsVMOptions {
  /** Narrow the room list to one community. Omit for the standalone list. */
  communityId?: Uuid
  /** Also load the discovery wall, optionally filtered to a category. */
  discovery?: { enabled: boolean; category?: string }
  /** Also load the rooms you are already in. */
  includeMine?: boolean
}

export function useRoomsVM(
  token: string | null,
  { communityId, discovery, includeMine }: RoomsVMOptions = {},
) {
  const roomsQuery = useRoomsQuery(token, communityId)
  // Both are opt-in: the sidebar wants neither, the home screen wants both, and
  // a view model that always fetches everything makes the cheap caller pay for
  // the expensive one.
  const discoveryQuery = useDiscoveryQuery(
    discovery?.enabled ? token : null,
    discovery?.category,
  )
  const myRoomsQuery = useMyRoomsQuery(includeMine ? token : null)
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
    discovery: discoveryQuery.data?.rooms ?? [],
    myRooms: myRoomsQuery.data ?? [],

    // Status
    isLoading: roomsQuery.isLoading,
    isLoadingDiscovery: discoveryQuery.isLoading,
    isLoadingMine: myRoomsQuery.isLoading,
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
    refreshDiscovery: discoveryQuery.refetch,
    refreshMine: myRoomsQuery.refetch,
  }
}
