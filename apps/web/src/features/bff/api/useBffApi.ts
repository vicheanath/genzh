import { useQuery } from '@tanstack/react-query'
import { bffApi } from './bffApi'
import type { Uuid } from './types'

/** Cache keys for the composite views, kept apart from the per-resource keys. */
export const bffKeys = {
  all: ['bff'] as const,
  meOverview: () => [...bffKeys.all, 'me', 'overview'] as const,
  communityOverview: (id: Uuid) => [...bffKeys.all, 'community', id, 'overview'] as const,
  roomSession: (id: Uuid) => [...bffKeys.all, 'room', id, 'session'] as const,
  socialOverview: () => [...bffKeys.all, 'me', 'social'] as const,
}

/** The app shell's boot payload. */
export function useMeOverviewQuery(token: string | null) {
  return useQuery({
    queryKey: bffKeys.meOverview(),
    queryFn: () =>
      token ? bffApi.meOverview(token) : Promise.reject(new Error('Unauthenticated')),
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 2,
  })
}

/** Everything a community screen renders. */
export function useCommunityOverviewQuery(token: string | null, communityId: Uuid | null) {
  return useQuery({
    queryKey: communityId
      ? bffKeys.communityOverview(communityId)
      : [...bffKeys.all, 'community', 'none'],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Unauthenticated or missing community ID')
      return bffApi.communityOverview(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

/**
 * Open a room session.
 *
 * Deliberately inert once fetched: the request mints a media credential, so it
 * must not re-fire on a window focus or a reconnect. Live updates arrive over
 * the websocket; a genuine re-join invalidates `bffKeys.roomSession(id)`.
 */
export function useRoomSessionQuery(token: string | null, roomId: Uuid | null) {
  return useQuery({
    queryKey: roomId ? bffKeys.roomSession(roomId) : [...bffKeys.all, 'room', 'none'],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room ID')
      return bffApi.openRoomSession(token, roomId)
    },
    enabled: Boolean(token && roomId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
}

/** Friends, presence, requests and blocks for the social screen. */
export function useSocialOverviewQuery(token: string | null) {
  return useQuery({
    queryKey: bffKeys.socialOverview(),
    queryFn: () =>
      token ? bffApi.socialOverview(token) : Promise.reject(new Error('Unauthenticated')),
    enabled: Boolean(token),
  })
}
