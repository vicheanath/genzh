import { useMemo } from 'react'

import {
  useBlockedUsers,
  useFriendsList,
  usePendingFriendRequests,
  useSentFriendRequests,
} from '@/features/api'
import type { Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/**
 * What this user is to you.
 *
 * `outgoing` and `incoming` are separate states rather than one "pending",
 * because the button they earn is different: one is withdrawn, the other is
 * answered.
 */
export type Relationship = 'self' | 'friends' | 'outgoing' | 'incoming' | 'blocked' | 'none'

interface SocialGraphValue {
  relationship: (userId: Uuid) => Relationship
  isFriend: (userId: Uuid) => boolean
  friendIds: ReadonlySet<Uuid>
  loading: boolean
}

/**
 * Your side of the friend graph, in one place.
 *
 * Every screen that shows a person also has to decide what to offer them — and
 * before this each one answered that on its own, or did not answer it at all:
 * the profile card offered "Add Friend" to people you had been friends with for
 * months, and offered it again to someone whose request was already sitting in
 * your own Pending tab.
 *
 * Four lists describe the whole graph and they change rarely, so the cache
 * holds them for the session and a dialog that opens on a name pays nothing.
 * Refreshing is not this hook's job: the mutations that change the graph
 * invalidate it, and the bridge invalidates it when the other side acts.
 */
export function useSocialGraph(): SocialGraphValue {
  const { user } = useAuth()
  const friends = useFriendsList()
  const incoming = usePendingFriendRequests()
  const outgoing = useSentFriendRequests()
  const blocked = useBlockedUsers()

  return useMemo(() => {
    const friendIds = new Set(friends.data ?? [])
    const incomingIds = new Set((incoming.data ?? []).map((request) => request.requester_id))
    const outgoingIds = new Set((outgoing.data ?? []).map((request) => request.addressee_id))
    const blockedIds = new Set(blocked.data ?? [])

    const relationship = (userId: Uuid): Relationship => {
      if (!userId) return 'none'
      if (userId === user?.id) return 'self'
      // Blocked first: it outranks everything, and blocking somebody does not
      // erase the friendship row underneath it.
      if (blockedIds.has(userId)) return 'blocked'
      if (friendIds.has(userId)) return 'friends'
      if (incomingIds.has(userId)) return 'incoming'
      if (outgoingIds.has(userId)) return 'outgoing'
      return 'none'
    }

    return {
      relationship,
      isFriend: (userId: Uuid) => friendIds.has(userId),
      friendIds,
      loading:
        friends.isLoading || incoming.isLoading || outgoing.isLoading || blocked.isLoading,
    }
  }, [user?.id, friends.data, friends.isLoading, incoming.data, incoming.isLoading, outgoing.data, outgoing.isLoading, blocked.data, blocked.isLoading])
}
