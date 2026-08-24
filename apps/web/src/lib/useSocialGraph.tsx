import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  blocks as blocksApi,
  friends as friendsApi,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { chatSocket, type ChatServerEvent } from '@/lib/ws/ChatSocket'

/**
 * What this user is to you.
 *
 * `outgoing` and `incoming` are separate states rather than one "pending",
 * because the button they earn is different: one is withdrawn, the other is
 * answered.
 */
export type Relationship = 'self' | 'friends' | 'outgoing' | 'incoming' | 'blocked' | 'none'

interface SocialGraphValue {
  relationship: (userId: Uuid) => Relationship
  isFriend: (userId: Uuid) => boolean
  friendIds: ReadonlySet<Uuid>
  loading: boolean
  /** Refetch after something changed the graph — a request, an accept, a block. */
  refresh: () => void
}

const SocialGraphContext = createContext<SocialGraphValue | null>(null)

/**
 * Your side of the friend graph, in one place.
 *
 * Every screen that shows a person also has to decide what to offer them — and
 * before this each one answered that on its own, or did not answer it at all:
 * the profile card offered "Add Friend" to people you had been friends with for
 * months, and offered it again to someone whose request was already sitting in
 * your own Pending tab.
 *
 * Held for the session rather than fetched per card. Four lists describe the
 * whole graph and they change rarely, so a dialog that opens on a name pays
 * nothing, while the alternative — four requests each time a profile opens —
 * would make the answer arrive after the buttons did.
 */
export function SocialGraphProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()

  const [friendIds, setFriendIds] = useState<ReadonlySet<Uuid>>(() => new Set())
  const [incoming, setIncoming] = useState<ReadonlySet<Uuid>>(() => new Set())
  const [outgoing, setOutgoing] = useState<ReadonlySet<Uuid>>(() => new Set())
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<Uuid>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const signedIn = Boolean(user)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!signedIn) {
      setFriendIds(new Set())
      setIncoming(new Set())
      setOutgoing(new Set())
      setBlockedIds(new Set())
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const token = await getToken()
        const [friends, pending, sent, blocked] = await Promise.all([
          friendsApi.list(token),
          friendsApi.pending(token),
          friendsApi.sent(token),
          blocksApi.list(token),
        ])
        if (cancelled) return
        setFriendIds(new Set(friends))
        setIncoming(new Set(pending.map((request) => request.requester_id)))
        setOutgoing(new Set(sent.map((request) => request.addressee_id)))
        setBlockedIds(new Set(blocked))
      } catch {
        // A graph that cannot be read leaves every relationship at `none`,
        // which offers to add a friend you may already have. That is a wasted
        // click; blanking the screens that ask would be worse.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [signedIn, getToken, nonce])

  // The other side accepting is the one change that happens without this tab
  // doing anything, and it is exactly the one that would leave a stale "Request
  // sent" sitting where a Call button belongs.
  useEffect(() => {
    if (!signedIn) return

    return chatSocket.on<ChatServerEvent>('notification_created', (event) => {
      if (event.type !== 'notification_created') return
      const { kind } = event.notification
      if (kind === 'friend_request' || kind === 'friend_accepted') refresh()
    })
  }, [signedIn, refresh])

  const value = useMemo<SocialGraphValue>(() => {
    const relationship = (userId: Uuid): Relationship => {
      if (!userId) return 'none'
      if (userId === user?.id) return 'self'
      // Blocked first: it outranks everything, and blocking somebody does not
      // erase the friendship row underneath it.
      if (blockedIds.has(userId)) return 'blocked'
      if (friendIds.has(userId)) return 'friends'
      if (incoming.has(userId)) return 'incoming'
      if (outgoing.has(userId)) return 'outgoing'
      return 'none'
    }

    return {
      relationship,
      isFriend: (userId: Uuid) => friendIds.has(userId),
      friendIds,
      loading,
      refresh,
    }
  }, [user?.id, friendIds, incoming, outgoing, blockedIds, loading, refresh])

  return <SocialGraphContext.Provider value={value}>{children}</SocialGraphContext.Provider>
}

/**
 * Ask what you are to somebody.
 *
 * Falls back to "we know nothing" without a provider, so a component can ask
 * without every test mounting one.
 */
export function useSocialGraph(): SocialGraphValue {
  const context = useContext(SocialGraphContext)
  const fallback = useMemo<SocialGraphValue>(
    () => ({
      relationship: () => 'none',
      isFriend: () => false,
      friendIds: new Set(),
      loading: false,
      refresh: () => {},
    }),
    [],
  )
  return context ?? fallback
}
