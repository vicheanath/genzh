import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { communities, rooms, social } from '../api/endpoints'
import type { MeOverviewResponse, RoomSessionResponse, Uuid } from '../api/types'
import { queryKeys } from './keys'

/**
 * Spread one session across the per-resource caches it answers for.
 *
 * The point of a composite read is that everything it returned is now known.
 * Leaving it in a single `bff` entry would mean the room screen fetching the
 * room again, and the member list fetching participants again, immediately
 * after the payload that already contained both.
 *
 * The message page is deliberately not seeded: mobile's transcript keeps its
 * own paging state rather than reading the query cache, so an entry written
 * here would be one nothing reads and nothing invalidates.
 */
function seedFromSession(
  queryClient: QueryClient,
  roomId: Uuid,
  session: RoomSessionResponse,
): void {
  queryClient.setQueryData(queryKeys.bff.roomSession(roomId), session)
  queryClient.setQueryData(queryKeys.rooms.detail(roomId), session.room)
  queryClient.setQueryData(queryKeys.rooms.participants(roomId), session.participants)
}

/**
 * Why these pass `null` where the token would normally be threaded through.
 *
 * A non-null token is written straight onto the `Authorization` header, which
 * takes the request past the client's refresh-if-stale interceptor. `null`
 * leaves the header empty and lets the interceptor resolve a credential through
 * the token provider, refreshing it first when it has expired.
 *
 * That distinction is load-bearing here and nowhere else in this layer: a call
 * re-opens its session on every reconnect, which can be an hour into a session
 * whose access token went stale long ago. The token argument is still taken —
 * it says whether anybody is signed in at all — it just is not what gets sent.
 */

/**
 * A room session, opened as the screen mounts.
 *
 * Deliberately inert once fetched: opening a session joins the room and, in a
 * media room, mints a credential — so it must not re-fire on a reconnect or a
 * window focus. Live changes arrive over the websocket; a genuine re-join
 * invalidates `queryKeys.bff.roomSession(id)`.
 *
 * A call joins imperatively, from a button rather than a mount, and wants
 * `useOpenRoomSessionMutation` instead.
 */
export function useRoomSessionQuery(token: string | null, roomId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: roomId ? queryKeys.bff.roomSession(roomId) : ['bff', 'room', 'session', null],
    queryFn: async () => {
      if (!token || !roomId) throw new Error('Missing token or roomId')
      const session = await rooms.session(null, roomId)
      seedFromSession(queryClient, roomId, session)
      return session
    },
    enabled: Boolean(token && roomId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
}

/**
 * Open a room session on demand.
 *
 * This is the one round-trip that entering a room costs: it joins, and hands
 * back the room, the roster, the first page of history and the SFU credential
 * together. Everything it returned is written into the per-resource caches, so
 * the roster a call renders is already there by the time the media socket opens
 * — no participants fetch, no separate media join.
 */
export function useOpenRoomSessionMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return rooms.session(null, roomId)
    },
    onSuccess: (session, roomId) => {
      seedFromSession(queryClient, roomId, session)
      // Joining changed which rooms the caller is in, so the lists that answer
      // "where am I" are now a join out of date.
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() })
    },
  })
}

/**
 * A callback that spreads the boot payload across the caches it answers for.
 *
 * Returns a writer rather than running a query, because the one place that
 * should fetch this payload is session hydration: it already makes exactly one
 * call to validate the stored token, so asking that call for the whole shell
 * instead of just the account costs nothing extra and leaves every list warm
 * before the navigator mounts. A `useQuery` would fire *beside* hydration
 * rather than inside it, which is the race `AuthProvider` exists to avoid.
 *
 * A hook rather than a plain `(client, overview)` function so the client is
 * never passed across the package boundary. The app and this package resolve
 * `@tanstack/react-query` to two different patch versions, and while Metro
 * forces a single copy into the bundle, TypeScript still sees two nominally
 * incompatible `QueryClient` types. Taking the client from context here side-
 * steps that entirely — and matches how every other hook in this layer gets it.
 *
 * Only the four entries something actually reads are written. Counts
 * (`pending_requests_count`, `unread_notifications`) are left alone because
 * their owners cache lists, not totals; `friends` is left alone because the
 * social overview is now the only reader of the friend graph.
 */
export function useSeedMeOverview(): (overview: MeOverviewResponse) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (overview: MeOverviewResponse) => {
      queryClient.setQueryData(queryKeys.auth.me(), overview.me)
      queryClient.setQueryData(queryKeys.auth.config(), overview.config)
      queryClient.setQueryData(queryKeys.communities.lists(), overview.communities)
      queryClient.setQueryData(queryKeys.rooms.mine(), overview.rooms)
    },
    [queryClient],
  )
}

/**
 * A whole community screen: metadata, channels, members and roles.
 *
 * Replaces the four parallel reads the screen used to make. Both paths need
 * membership — `communities.get` and this handler each start from
 * `member_context` — so a non-member gets the same refusal as before.
 *
 * Two per-resource entries are seeded, and only two: the member list screen
 * and the mention autocomplete both mount `useCommunityMembersQuery` without
 * ever touching this hook, and the channel list is read through `useRoomsVM`.
 * The community record and its roles are deliberately not written — this hook
 * is now their only reader, so a second copy would just be one more thing to
 * keep in step.
 */
export function useCommunityOverviewQuery(
  token: string | null,
  communityId: Uuid | null | undefined,
) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: communityId
      ? queryKeys.bff.communityOverview(communityId)
      : ['communities', 'detail', null, 'overview'],
    queryFn: async () => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      const overview = await communities.overview(token, communityId)

      queryClient.setQueryData(queryKeys.communities.members(communityId), overview.members)
      queryClient.setQueryData(queryKeys.rooms.lists(communityId), overview.rooms)

      return overview
    },
    enabled: Boolean(token && communityId),
  })
}

/**
 * The social graph in one payload: friends, requests both ways, and blocks.
 *
 * Four reads became one. Nothing is seeded onward: this hook is the only
 * reader of the friend graph and the block list now, so there is no
 * per-resource cache left to warm.
 *
 * `online_friends` is carried too but deliberately ignored by the mobile app,
 * which reads presence from the socket-backed provider instead — a snapshot
 * taken at fetch time would go stale the moment somebody closed their laptop.
 */
export function useSocialOverviewQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.bff.socialOverview(),
    queryFn: async () => {
      if (!token) throw new Error('Unauthenticated')
      return social.overview(token)
    },
    enabled: Boolean(token),
  })
}
