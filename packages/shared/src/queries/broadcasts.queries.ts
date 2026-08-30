import { useQuery } from '@tanstack/react-query'
import { broadcasts } from '../api/endpoints'
import { queryKeys } from './keys'

/**
 * How often a client asks whether staff have said anything.
 *
 * A broadcast is how the platform reaches people mid-session — planned
 * downtime, an incident, a rollback — so it is the one read in the app that is
 * polled rather than invalidated: nothing the client does can cause one, and
 * the socket carries room traffic rather than platform traffic.
 *
 * Two minutes is the compromise. Shorter would put a request on the wire every
 * time a phone wakes for anything; longer and "we are going down in five
 * minutes" arrives after the fact.
 */
const POLL_INTERVAL = 120_000

/**
 * Announcements that are live right now.
 *
 * The endpoint is public — it takes no token — because the banner has to be
 * readable on the screens shown before sign-in too, where an outage notice is
 * the *most* useful thing on the page.
 */
export function useActiveBroadcastsQuery() {
  return useQuery({
    queryKey: queryKeys.broadcasts.active(),
    queryFn: () => broadcasts.active(),
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    // A banner is never worth an error state: a failed poll leaves the last
    // answer on screen and tries again on the next tick.
    retry: false,
  })
}
