import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, usePublicProfilesQuery, type PublicProfile, type Uuid } from '@genzh/shared';

import { useAuth } from '../context/AuthContext';

/**
 * Resolves user ids to profiles, once each.
 *
 * Messages and participants arrive as ids. Fetching a profile per message would
 * be one request per row, so each id becomes its own `users.detail` cache entry
 * and N messages from the same author cost exactly one request — deduplicated
 * by the query cache rather than by the module-level map and in-flight set this
 * used to keep, which nothing could invalidate when a profile changed.
 *
 * Returns a lookup rather than a list because that is how every caller uses it:
 * a transcript row or a roster tile already has the id and wants the face.
 */
export function useProfiles(ids: Uuid[]) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data } = usePublicProfilesQuery(token, ids);

  return useCallback(
    (id: Uuid) =>
      // The batch result first, so resolving one re-renders the caller; the
      // per-user entries behind it catch anyone primed by an edit.
      data?.get(id) ??
      queryClient.getQueryData<PublicProfile>(queryKeys.users.detail(id)) ??
      null,
    [data, queryClient],
  );
}

/**
 * Overwrite one cached profile.
 *
 * Editing your own profile updates `useAuth().user`, but the transcript draws
 * authors from this cache — so without this your own name and avatar stay stale
 * on your own messages until a reload. The edit already knows the new values;
 * this hands them over rather than making every screen refetch.
 */
export function usePrimeProfile() {
  const queryClient = useQueryClient();
  return useCallback(
    (profile: PublicProfile) => {
      queryClient.setQueryData(queryKeys.users.detail(profile.id), profile);
    },
    [queryClient],
  );
}
