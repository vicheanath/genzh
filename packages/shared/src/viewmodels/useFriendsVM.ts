import { useCallback } from 'react'
import {
  useFriendsListQuery,
  usePendingFriendsQuery,
  useRemoveFriendMutation,
  useRespondFriendRequestMutation,
  useSendFriendRequestMutation,
  useSentFriendsQuery,
} from '../queries/friends.queries'
import type { Uuid } from '../api/types'

export function useFriendsVM(token: string | null) {
  const listQuery = useFriendsListQuery(token)
  const pendingQuery = usePendingFriendsQuery(token)
  const sentQuery = useSentFriendsQuery(token)

  const sendRequestMutation = useSendFriendRequestMutation(token)
  const respondMutation = useRespondFriendRequestMutation(token)
  const removeFriendMutation = useRemoveFriendMutation(token)

  const friendIds = listQuery.data ?? []
  const pendingRequests = pendingQuery.data ?? []
  const sentRequests = sentQuery.data ?? []

  const sendFriendRequest = useCallback(
    async (userId: Uuid) => {
      return sendRequestMutation.mutateAsync(userId)
    },
    [sendRequestMutation],
  )

  const acceptFriendRequest = useCallback(
    async (requesterId: Uuid) => {
      return respondMutation.mutateAsync({ requesterId, accept: true })
    },
    [respondMutation],
  )

  const declineFriendRequest = useCallback(
    async (requesterId: Uuid) => {
      return respondMutation.mutateAsync({ requesterId, accept: false })
    },
    [respondMutation],
  )

  const removeFriend = useCallback(
    async (userId: Uuid) => {
      return removeFriendMutation.mutateAsync(userId)
    },
    [removeFriendMutation],
  )

  return {
    // Model state
    friendIds,
    pendingRequests,
    sentRequests,

    // Status
    isLoading: listQuery.isLoading || pendingQuery.isLoading || sentQuery.isLoading,
    isSending: sendRequestMutation.isPending,
    isResponding: respondMutation.isPending,
    isRemoving: removeFriendMutation.isPending,

    // Errors
    error: listQuery.error || pendingQuery.error || sentQuery.error,
    sendError: sendRequestMutation.error,
    respondError: respondMutation.error,

    // Actions
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    refresh: () => {
      listQuery.refetch()
      pendingQuery.refetch()
      sentQuery.refetch()
    },
  }
}
