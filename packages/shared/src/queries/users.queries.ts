import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { blocks, users } from '../api/endpoints'
import type { PublicProfile, Uuid } from '../api/types'
import { queryKeys } from './keys'

/**
 * How long a profile stays fresh.
 *
 * A display name or an avatar changes rarely and matters little when it is a
 * few minutes stale, and these are read by every transcript row and roster
 * tile — so the default thirty seconds would refetch a wall of people over and
 * over for a name that did not move.
 */
const PROFILE_STALE_MS = 1000 * 60 * 5

export function useUserProfileQuery(token: string | null, userId: Uuid | null | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.users.detail(userId) : ['users', 'detail', null],
    queryFn: () => {
      if (!token || !userId) throw new Error('Missing token or userId')
      return users.get(token, userId)
    },
    enabled: Boolean(token && userId),
  })
}

/**
 * Profiles for a set of ids, resolved through the same per-user cache.
 *
 * Messages and rosters arrive as ids. Fetching a profile per row would be one
 * request per row, so each id becomes its own `users.detail` entry and N rows
 * by the same author cost exactly one request — deduplicated by the query cache
 * rather than by a module-level map, which nothing could invalidate when a
 * profile changed.
 *
 * A failed lookup is dropped rather than thrown: one blocked or deleted account
 * in a roster of thirty should leave the other twenty-nine drawn.
 */
export function usePublicProfilesQuery(token: string | null, userIds: Uuid[]) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: queryKeys.users.batch(userIds),
    queryFn: async () => {
      if (!token) throw new Error('Unauthenticated')
      const entries = await Promise.all(
        userIds.map(async (id) => {
          const profile = await queryClient
            .fetchQuery({
              queryKey: queryKeys.users.detail(id),
              queryFn: () => users.get(token, id),
              staleTime: PROFILE_STALE_MS,
            })
            .catch(() => null)
          return [id, profile] as const
        }),
      )
      return new Map(
        entries.filter((entry): entry is [Uuid, PublicProfile] => entry[1] !== null),
      )
    },
    enabled: Boolean(token) && userIds.length > 0,
    staleTime: PROFILE_STALE_MS,
  })
}

export function useBlockedUsersQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.users.blocked(),
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.list(token)
    },
    enabled: Boolean(token),
  })
}

export function useBlockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.block(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.blocked() })
      // Blocks also travel in the social overview, which hangs under
      // `friends` — nothing above would reach it.
      queryClient.invalidateQueries({ queryKey: queryKeys.bff.socialOverview() })
    },
  })
}

export function useUnblockUserMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return blocks.unblock(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.blocked() })
      // Blocks also travel in the social overview, which hangs under
      // `friends` — nothing above would reach it.
      queryClient.invalidateQueries({ queryKey: queryKeys.bff.socialOverview() })
    },
  })
}
