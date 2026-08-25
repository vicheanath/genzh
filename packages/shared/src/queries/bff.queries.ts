import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { rooms } from '../api/endpoints'
import type { RoomSessionResponse, Uuid } from '../api/types'
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
