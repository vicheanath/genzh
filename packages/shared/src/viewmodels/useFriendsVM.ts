import { useCallback } from 'react'
import {
  useRemoveFriendMutation,
  useRespondFriendRequestMutation,
  useSendFriendRequestMutation,
} from '../queries/friends.queries'
import { useSocialOverviewQuery } from '../queries/bff.queries'
import type { Uuid } from '../api/types'

/**
 * The friends screen, on one read instead of three.
 *
 * Friends, the requests waiting on you and the ones you sent all arrive in the
 * same payload — and because that payload also carries blocks, the screen's
 * companion `useBlockedUsersVM` shares this exact cache entry rather than
 * fetching a fourth time.
 */
export function useFriendsVM(token: string | null) {
  const overviewQuery = useSocialOverviewQuery(token)
  const overview = overviewQuery.data ?? null

  const sendRequestMutation = useSendFriendRequestMutation(token)
  const respondMutation = useRespondFriendRequestMutation(token)
  const removeFriendMutation = useRemoveFriendMutation(token)

  const friendIds = overview?.friends ?? []
  const pendingRequests = overview?.incoming_requests ?? []
  const sentRequests = overview?.outgoing_requests ?? []

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
    isLoading: overviewQuery.isLoading,
    isSending: sendRequestMutation.isPending,
    isResponding: respondMutation.isPending,
    isRemoving: removeFriendMutation.isPending,

    // Errors
    error: overviewQuery.error,
    sendError: sendRequestMutation.error,
    respondError: respondMutation.error,

    // Actions
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    refresh: () => {
      overviewQuery.refetch()
    },
  }
}
