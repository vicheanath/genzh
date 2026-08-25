import { useQuery } from '@tanstack/react-query'

import { auth, communities, rooms, social } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type { Uuid } from './types'

/** Cache keys for the composite views, kept apart from the per-resource keys. */
export const bffKeys = {
  all: ['bff'] as const,
  meOverview: () => [...bffKeys.all, 'me', 'overview'] as const,
  communityOverview: (id: Uuid) => [...bffKeys.all, 'community', id, 'overview'] as const,
  roomSession: (id: Uuid) => [...bffKeys.all, 'room', id, 'session'] as const,
  socialOverview: () => [...bffKeys.all, 'me', 'social'] as const,
}

/** The app shell's boot payload, in one round-trip instead of seven. */
export function useMeOverviewQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: bffKeys.meOverview(),
    queryFn: () => auth.overview(null),
    enabled: signedIn,
    staleTime: 1000 * 60 * 2,
  })
}

/** Everything a community screen renders. */
export function useCommunityOverviewQuery(communityId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityId ? bffKeys.communityOverview(communityId) : [...bffKeys.all, 'idle'],
    queryFn: () => communities.overview(null, communityId!),
    enabled: signedIn && Boolean(communityId),
  })
}

/**
 * Open a room session.
 *
 * Deliberately inert once fetched: the request mints a media credential, so it
 * must not re-fire on a window focus or a reconnect. Live updates arrive over
 * the websocket; a genuine re-join invalidates `bffKeys.roomSession(id)`.
 */
export function useRoomSessionQuery(roomId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomId ? bffKeys.roomSession(roomId) : [...bffKeys.all, 'room', 'idle'],
    queryFn: () => rooms.session(null, roomId!),
    enabled: signedIn && Boolean(roomId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
}

/** Friends, presence, requests and blocks for the social screen. */
export function useSocialOverviewQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: bffKeys.socialOverview(),
    queryFn: () => social.overview(null),
    enabled: signedIn,
  })
}
