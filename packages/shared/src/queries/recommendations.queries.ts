import { useQuery } from '@tanstack/react-query'
import { recommendations } from '../api/endpoints'
import type { Reason } from '../api/types'
import { queryKeys } from './keys'

/**
 * How long a client trusts a ranking.
 *
 * Slightly under the server's two-minute cache, so a refetch that does escape
 * this one lands on a warm entry rather than re-running the joins. Going longer
 * would only mean showing something staler than the server already has.
 */
const STALE_TIME = 90_000

/**
 * Moments ranked for the signed-in account.
 *
 * Gated on a token rather than fetched unconditionally: these endpoints are
 * viewer-scoped and 401 without one, and every surface that shows them has the
 * generic discovery list to fall back on.
 */
export function useRecommendedRoomsQuery(
  token: string | null,
  params: { category?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: queryKeys.recommendations.rooms(params.category),
    queryFn: () => recommendations.rooms(token, params),
    enabled: Boolean(token),
    staleTime: STALE_TIME,
  })
}

/** People this viewer might know. */
export function useRecommendedPeopleQuery(token: string | null, limit?: number) {
  return useQuery({
    queryKey: queryKeys.recommendations.people(),
    queryFn: () => recommendations.people(token, { limit }),
    enabled: Boolean(token),
    staleTime: STALE_TIME,
  })
}

/** Communities to explore. */
export function useRecommendedCommunitiesQuery(token: string | null, limit?: number) {
  return useQuery({
    queryKey: queryKeys.recommendations.communities(),
    queryFn: () => recommendations.communities(token, { limit }),
    enabled: Boolean(token),
    staleTime: STALE_TIME,
  })
}

/**
 * The one-line "why you're seeing this", or null when there is nothing to say.
 *
 * Joined with "·" rather than a comma so it reads as separate facts rather than
 * a list, and capped at whatever the server sent — which is already capped at
 * two, because a third clause wraps on a phone.
 *
 * It lives here rather than in either client because pluralisation and phrasing
 * for seven reason kinds is exactly the logic that drifts once two clients each
 * own a copy of it.
 */
export function explain(reasons: Reason[]): string | null {
  if (reasons.length === 0) return null
  return reasons.map((reason) => reason.detail).join(' · ')
}
