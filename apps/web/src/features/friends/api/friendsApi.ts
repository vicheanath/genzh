import { blocks as coreBlocks, friends as coreFriends, presence as corePresence } from '@/lib/api'
import type { Friendship, Uuid } from './types'

/**
 * Backend-for-Frontend (BFF) Friends & Social API client.
 * Handles friends list, pending/sent friend requests, response handling, blocklist, and presence.
 * Each API method has a single responsibility and communicates directly with the backend.
 */
export const friendsApi = {
  /** List user IDs of all accepted friends. */
  list(token: string): Promise<Uuid[]> {
    return coreFriends.list(token)
  },
  listFriends(token: string): Promise<Uuid[]> {
    return coreFriends.list(token)
  },

  /** List incoming friend requests awaiting answer. */
  pending(token: string): Promise<Friendship[]> {
    return coreFriends.pending(token)
  },
  listPendingRequests(token: string): Promise<Friendship[]> {
    return coreFriends.pending(token)
  },

  /** List sent friend requests not yet answered. */
  sent(token: string): Promise<Friendship[]> {
    return coreFriends.sent(token)
  },
  listSentRequests(token: string): Promise<Friendship[]> {
    return coreFriends.sent(token)
  },

  /** Send a new friend request to a user. */
  request(token: string, userId: Uuid): Promise<Friendship> {
    return coreFriends.request(token, userId)
  },
  sendRequest(token: string, userId: Uuid): Promise<Friendship> {
    return coreFriends.request(token, userId)
  },

  /** Accept or decline a friend request. */
  respond(token: string, requesterId: Uuid, accept: boolean): Promise<Friendship> {
    return coreFriends.respond(token, requesterId, accept)
  },
  respondRequest(
    token: string,
    requesterId: Uuid,
    accept: boolean,
  ): Promise<Friendship> {
    return coreFriends.respond(token, requesterId, accept)
  },

  /** Remove a friend. */
  remove(token: string, userId: Uuid): Promise<void> {
    return coreFriends.remove(token, userId)
  },
  removeFriend(token: string, userId: Uuid): Promise<void> {
    return coreFriends.remove(token, userId)
  },

  /** Check online presence for friends/users. */
  presence(token: string, ids?: Uuid[]): Promise<{ online: Uuid[] }> {
    return corePresence.online(token, ids)
  },
  getOnlinePresence(token: string, ids?: Uuid[]): Promise<{ online: Uuid[] }> {
    return corePresence.online(token, ids)
  },

  /** List user IDs blocked by caller. */
  listBlocked(token: string): Promise<Uuid[]> {
    return coreBlocks.list(token)
  },
  listBlockedUsers(token: string): Promise<Uuid[]> {
    return coreBlocks.list(token)
  },

  /** Block a user. */
  block(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.block(token, userId)
  },
  blockUser(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.block(token, userId)
  },

  /** Unblock a user. */
  unblock(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.unblock(token, userId)
  },
  unblockUser(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.unblock(token, userId)
  },
}
