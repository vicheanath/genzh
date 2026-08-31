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
    /**
     * One entry per *set* of ids a screen asked for.
     *
     * The profiles themselves live under `detail`, one per person; this only
     * records that a particular list has been resolved, so a re-render with the
     * same ids is a cache hit rather than a fan-out.
     */
    batch: (ids: Uuid[]) => [...queryKeys.users.all, 'batch', [...ids].sort().join(',')] as const,
  },
  communities: {
    all: ['communities'] as const,
    lists: () => [...queryKeys.communities.all, 'list'] as const,
    templates: () => [...queryKeys.communities.all, 'templates'] as const,
    detail: (id: Uuid) => [...queryKeys.communities.all, 'detail', id] as const,
    members: (id: Uuid) => [...queryKeys.communities.detail(id), 'members'] as const,
    roles: (id: Uuid) => [...queryKeys.communities.detail(id), 'roles'] as const,
    invites: (id: Uuid) => [...queryKeys.communities.detail(id), 'invites'] as const,
    invitePreview: (code: string) => [...queryKeys.communities.all, 'invitePreview', code] as const,
  },
  rooms: {
    all: ['rooms'] as const,
    lists: (communityId?: Uuid) => [...queryKeys.rooms.all, 'list', { communityId }] as const,
    detail: (id: Uuid) => [...queryKeys.rooms.all, 'detail', id] as const,
    participants: (id: Uuid) => [...queryKeys.rooms.detail(id), 'participants'] as const,
    /** Public rooms to browse, optionally narrowed to one category. */
    discovery: (category?: string) => [...queryKeys.rooms.all, 'discovery', { category }] as const,
    /** The swipeable column of throwaway rooms, optionally narrowed to one category. */
    feed: (category?: string) => [...queryKeys.rooms.all, 'feed', { category }] as const,
    /** The rooms you are already in, direct messages included. */
    mine: () => [...queryKeys.rooms.all, 'mine'] as const,
  },
  /**
   * A community's custom emoji.
   *
   * `forRoom` is keyed by room even though the answer is per *community*: the
   * chat client knows the room and not always the community, and a room's set
   * is invalidated by the community mutations below through nothing cleverer
   * than a refetch — the alternative is teaching every room which community it
   * belongs to purely to share one cache entry.
   */
  emojis: {
    all: ['emojis'] as const,
    forCommunity: (communityId: Uuid) =>
      [...queryKeys.emojis.all, 'community', communityId] as const,
    forRoom: (roomId: Uuid) => [...queryKeys.emojis.all, 'room', roomId] as const,
  },
  /**
   * GIF search results.
   *
   * Keyed by the query text, so going back to a term the picker has already
   * searched is instant — people scrub back and forth between two words far
   * more than they type a third.
   */
  gifs: {
    all: ['gifs'] as const,
    trending: () => [...queryKeys.gifs.all, 'trending'] as const,
    search: (query: string) => [...queryKeys.gifs.all, 'search', query] as const,
  },
  messages: {
    all: ['messages'] as const,
    list: (roomId: Uuid) => [...queryKeys.messages.all, 'room', roomId] as const,
    pins: (roomId: Uuid) => [...queryKeys.messages.list(roomId), 'pins'] as const,
    search: (query: string, roomId?: Uuid) => [...queryKeys.messages.all, 'search', { query, roomId }] as const,
    unread: () => [...queryKeys.messages.all, 'unread'] as const,
  },
  friends: {
    all: ['friends'] as const,
    list: () => [...queryKeys.friends.all, 'list'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => [...queryKeys.notifications.all, 'list'] as const,
  },
  economy: {
    all: ['economy'] as const,
    balance: () => [...queryKeys.economy.all, 'balance'] as const,
  },
  /**
   * Ranked suggestions, keyed by surface rather than by the resource they
   * return.
   *
   * A recommended room is not the same cache entry as the same room in
   * discovery: the ranking is viewer-scoped and carries `reasons` the plain
   * room has no field for, so invalidating rooms must not silently drop it.
   */
  recommendations: {
    all: ['recommendations'] as const,
    rooms: (category?: string) =>
      [...queryKeys.recommendations.all, 'rooms', category ?? 'all'] as const,
    people: () => [...queryKeys.recommendations.all, 'people'] as const,
    communities: () => [...queryKeys.recommendations.all, 'communities'] as const,
  },
  /** Platform-wide announcements every signed-in client polls for. */
  broadcasts: {
    all: ['broadcasts'] as const,
    active: () => [...queryKeys.broadcasts.all, 'active'] as const,
  },

  store: {
    all: ['store'] as const,
    items: () => [...queryKeys.store.all, 'items'] as const,
    inventory: () => [...queryKeys.store.all, 'inventory'] as const,
    /**
     * What the account is *wearing*, which is not a subset of what it owns.
     *
     * Equipping changes this without changing the inventory, and buying
     * changes the inventory without changing this, so the two invalidate
     * independently.
     */
    equipped: () => [...queryKeys.store.all, 'equipped'] as const,
  },
  /**
   * The composite views.
   *
   * Kept apart from the per-resource keys above because they answer a *screen*
   * rather than a table: invalidating `rooms.detail` should not throw away a
   * room session whose media credential took a round-trip to mint.
   */
  bff: {
    all: ['bff'] as const,
    roomSession: (id: Uuid) => [...queryKeys.bff.all, 'room', id, 'session'] as const,

    /**
     * The app-shell boot payload.
     *
     * Fetched once per session and spread into the per-resource caches below,
     * so it is deliberately the one composite that nothing invalidates: after
     * boot, every screen is reading the caches it seeded, and those are kept
     * fresh by their own mutations.
     */
    meOverview: () => [...queryKeys.bff.all, 'me', 'overview'] as const,

    /**
     * These two hang *under* the resource they compose rather than beside it,
     * which is the opposite of `roomSession` above and deliberate.
     *
     * A room session is kept apart because re-fetching it costs a media
     * credential, so a broad `rooms.detail` invalidation must not reach it.
     * These two are ordinary idempotent reads with no such cost, and they are
     * the *only* copy their screen reads — so they have to be invalidated by
     * every mutation that already invalidates the resource. Nesting the key
     * gets that from React Query's prefix matching instead of asking a dozen
     * mutation sites to remember a second key.
     */
    communityOverview: (id: Uuid) =>
      [...queryKeys.communities.detail(id), 'overview'] as const,
    socialOverview: () => [...queryKeys.friends.all, 'overview'] as const,
  },
} as const
