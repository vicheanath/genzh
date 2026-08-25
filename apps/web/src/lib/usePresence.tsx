import { useMemo } from 'react'

import { useOnlineUsers } from '@/features/api'
import type { Uuid } from '@/lib/api'

/**
 * Who is online.
 *
 * Two sources, and both are needed. The socket carries *changes*, so a screen
 * that only listened would show everyone offline until they happened to
 * reconnect; the endpoint carries the starting point, so a screen that only
 * fetched would go stale the moment somebody closed their laptop.
 *
 * Both now land in one query — `useOnlineUsers` fetches it, the realtime bridge
 * applies the deltas on top — so this is a reader over the cache rather than a
 * provider holding a third copy. That is why there is no `<PresenceProvider>`
 * any more: there is nothing left for it to own.
 */
interface PresenceValue {
  isOnline: (userId: Uuid) => boolean
  onlineIds: ReadonlySet<Uuid>
}

export function usePresence(): PresenceValue {
  const { data } = useOnlineUsers()

  return useMemo(() => {
    const onlineIds = new Set(data ?? [])
    return {
      onlineIds,
      isOnline: (userId: Uuid) => onlineIds.has(userId),
    }
  }, [data])
}
