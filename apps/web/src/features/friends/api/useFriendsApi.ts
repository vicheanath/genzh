import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { blocks, friends, presence } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type { Uuid } from './types'

export const friendKeys = {
  all: ['friends'] as const,
  list: () => [...friendKeys.all, 'list'] as const,
  pending: () => [...friendKeys.all, 'pending'] as const,
  sent: () => [...friendKeys.all, 'sent'] as const,
  blocked: () => ['blocks', 'list'] as const,
  presence: () => ['presence', 'online'] as const,
}

/** Everything the friend graph is made of, invalidated as one. */
export const socialGraphKeys = [
  friendKeys.list(),
  friendKeys.pending(),
  friendKeys.sent(),
  friendKeys.blocked(),
]

export function useFriendsList() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: friendKeys.list(),
    queryFn: () => friends.list(null),
    enabled: signedIn,
  })
}

export function usePendingFriendRequests() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: friendKeys.pending(),
    queryFn: () => friends.pending(null),
    enabled: signedIn,
  })
}

export function useSentFriendRequests() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: friendKeys.sent(),
    queryFn: () => friends.sent(null),
    enabled: signedIn,
  })
}

export function useBlockedUsers() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: friendKeys.blocked(),
    queryFn: () => blocks.list(null),
    enabled: signedIn,
  })
}

/**
 * Who is online, as of now.
 *
 * The starting point only — the socket carries the changes on top of it, and
 * the bridge writes them into this same key. Without the fetch every avatar
 * would read offline until its owner happened to reconnect; without the socket
 * the list would go stale the moment somebody closed their laptop.
 */
export function useOnlineUsers() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: friendKeys.presence(),
    queryFn: () => presence.online(null).then((result) => result.online),
    enabled: signedIn,
    staleTime: 1000 * 60,
  })
}

function useGraphInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of socialGraphKeys) queryClient.invalidateQueries({ queryKey })
  }
}

export function useSendFriendRequestMutation() {
  const invalidateGraph = useGraphInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => friends.request(null, userId),
    onSuccess: invalidateGraph,
  })
}

export function useRespondFriendRequestMutation() {
  const invalidateGraph = useGraphInvalidation()
  return useMutation({
    mutationFn: ({ requesterId, accept }: { requesterId: Uuid; accept: boolean }) =>
      friends.respond(null, requesterId, accept),
    onSuccess: invalidateGraph,
  })
}

export function useRemoveFriendMutation() {
  const invalidateGraph = useGraphInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => friends.remove(null, userId),
    onSuccess: invalidateGraph,
  })
}

export function useBlockUserMutation() {
  const invalidateGraph = useGraphInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => blocks.block(null, userId),
    onSuccess: invalidateGraph,
  })
}

export function useUnblockUserMutation() {
  const invalidateGraph = useGraphInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => blocks.unblock(null, userId),
    onSuccess: invalidateGraph,
  })
}
