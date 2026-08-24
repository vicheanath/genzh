import type { Uuid } from '../api/types'

/**
 * Standardized Query Key Factory.
 * Hierarchical keys allow granular cache invalidation across the app.
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    config: () => [...queryKeys.auth.all, 'config'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },
  users: {
    all: ['users'] as const,
    detail: (id: Uuid) => [...queryKeys.users.all, 'detail', id] as const,
    blocked: () => [...queryKeys.users.all, 'blocked'] as const,
  },
  communities: {
    all: ['communities'] as const,
    lists: () => [...queryKeys.communities.all, 'list'] as const,
    detail: (id: Uuid) => [...queryKeys.communities.all, 'detail', id] as const,
    members: (id: Uuid) => [...queryKeys.communities.detail(id), 'members'] as const,
    roles: (id: Uuid) => [...queryKeys.communities.detail(id), 'roles'] as const,
  },
  rooms: {
    all: ['rooms'] as const,
    lists: (communityId?: Uuid) => [...queryKeys.rooms.all, 'list', { communityId }] as const,
    detail: (id: Uuid) => [...queryKeys.rooms.all, 'detail', id] as const,
    participants: (id: Uuid) => [...queryKeys.rooms.detail(id), 'participants'] as const,
    /** Public rooms to browse, optionally narrowed to one category. */
    discovery: (category?: string) => [...queryKeys.rooms.all, 'discovery', { category }] as const,
    /** The rooms you are already in, direct messages included. */
    mine: () => [...queryKeys.rooms.all, 'mine'] as const,
  },
  messages: {
    all: ['messages'] as const,
    list: (roomId: Uuid) => [...queryKeys.messages.all, 'room', roomId] as const,
  },
  friends: {
    all: ['friends'] as const,
    list: () => [...queryKeys.friends.all, 'list'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => [...queryKeys.notifications.all, 'list'] as const,
  },
} as const
