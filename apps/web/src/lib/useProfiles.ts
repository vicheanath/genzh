import { useCallback, useEffect, useRef, useState } from 'react'

import { users as usersApi, type PublicProfile, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/**
 * Resolves user ids to profiles, once each.
 *
 * Messages and participants arrive as ids. Fetching a profile per message would
 * be one request per row; this keeps a module-lifetime cache and an in-flight
 * map so N messages from the same author cost exactly one request.
 */
const cache = new Map<Uuid, PublicProfile>()

export function useProfiles(ids: Uuid[]) {
  const { getToken } = useAuth()
  const [, force] = useState(0)
  const inFlight = useRef(new Set<Uuid>())

  const key = ids.join(',')

  useEffect(() => {
    const missing = ids.filter((id) => !cache.has(id) && !inFlight.current.has(id))
    if (missing.length === 0) return

    let cancelled = false
    for (const id of missing) inFlight.current.add(id)

    void (async () => {
      try {
        const token = await getToken()
        const fetched = await Promise.all(
          missing.map((id) =>
            usersApi.get(token, id).catch(() => null),
          ),
        )
        if (cancelled) return
        for (const profile of fetched) {
          if (profile) cache.set(profile.id, profile)
        }
        force((n) => n + 1)
      } finally {
        for (const id of missing) inFlight.current.delete(id)
      }
    })()

    return () => {
      cancelled = true
    }
    // `key` stands in for the id list; comparing the array itself would refetch
    // on every render because the reference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getToken])

  return useCallback((id: Uuid) => cache.get(id) ?? null, [])
}
