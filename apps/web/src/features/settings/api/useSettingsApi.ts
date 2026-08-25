import { useQuery, useQueryClient } from '@tanstack/react-query'

import { users } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type { PublicProfile, Uuid } from './types'

export const settingsKeys = {
  all: ['settings'] as const,
  publicProfile: (userId: Uuid) => ['users', 'detail', userId] as const,
}

/**
 * Somebody else's profile.
 *
 * Keyed under `users`, not `settings`, because it is the same record the member
 * list and the mention picker read — one cache entry per person, whichever
 * screen asked first.
 */
export function usePublicProfileQuery(userId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: userId ? settingsKeys.publicProfile(userId) : ['users', 'detail', 'idle'],
    queryFn: () => users.get(null, userId!),
    enabled: signedIn && Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
}

/** Profiles for a set of ids, resolved through the same per-user cache. */
export function usePublicProfiles(userIds: Uuid[]) {
  const signedIn = useIsSignedIn()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['users', 'batch', [...userIds].sort().join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        userIds.map(async (id) => {
          const profile = await queryClient
            .fetchQuery({
              queryKey: settingsKeys.publicProfile(id),
              queryFn: () => users.get(null, id),
              staleTime: 1000 * 60 * 5,
            })
            .catch(() => null)
          return [id, profile] as const
        }),
      )
      return new Map(
        entries.filter((entry): entry is [Uuid, PublicProfile] => entry[1] !== null),
      )
    },
    enabled: signedIn && userIds.length > 0,
    staleTime: 1000 * 60 * 5,
  })
}
