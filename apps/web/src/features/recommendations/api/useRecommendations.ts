import { useQuery } from '@tanstack/react-query'

import { recommendations } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'
import type {
  CommunityRecommendation,
  PersonRecommendation,
  Reason,
  RoomRecommendation,
} from '@/lib/api'

export const recommendationKeys = {
  all: ['recommendations'] as const,
  rooms: (category?: string) =>
    [...recommendationKeys.all, 'rooms', category ?? 'all'] as const,
  people: () => [...recommendationKeys.all, 'people'] as const,
  communities: () => [...recommendationKeys.all, 'communities'] as const,
}

/**
 * How long the client trusts a list.
 *
 * Slightly under the server's two-minute cache, so a refetch that does escape
 * this one lands on a warm entry rather than re-running the joins. Going longer
 * would just mean showing something staler than the server already has.
 */
const STALE_TIME = 90_000

/**
 * Moments ranked for the signed-in account.
 *
 * `enabled` on sign-in rather than unconditional: these endpoints are
 * viewer-scoped and 401 without a token, and a signed-out home screen has the
 * generic discovery list to fall back on.
 */
export function useRecommendedRooms(category?: string, limit?: number) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: recommendationKeys.rooms(category),
    queryFn: () => recommendations.rooms(null, { category, limit }),
    enabled: signedIn,
    staleTime: STALE_TIME,
  })
}

/** People the signed-in account might know. */
export function useRecommendedPeople(limit?: number) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: recommendationKeys.people(),
    queryFn: () => recommendations.people(null, { limit }),
    enabled: signedIn,
    staleTime: STALE_TIME,
  })
}

/** Communities the signed-in account might want. */
export function useRecommendedCommunities(limit?: number) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: recommendationKeys.communities(),
    queryFn: () => recommendations.communities(null, { limit }),
    enabled: signedIn,
    staleTime: STALE_TIME,
  })
}

/**
 * The one-line "why you're seeing this", or null when there is nothing to say.
 *
 * Joined with "·" rather than a comma so it reads as separate facts rather than
 * a list, and capped at whatever the server sent — which is already capped at
 * two, because a third clause wraps on a phone.
 */
export function explain(reasons: Reason[]): string | null {
  if (reasons.length === 0) return null
  return reasons.map((reason) => reason.detail).join(' · ')
}

export type {
  CommunityRecommendation,
  PersonRecommendation,
  Reason,
  RoomRecommendation,
}
