import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, messages as messagesApi, type Message, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/** Where the next page starts. Both halves, or paging can skip messages. */
interface Cursor {
  before: string
  beforeId?: string
}

export interface MessageHistory {
  items: Message[]
  /** Replace the list — used by the realtime handlers. */
  setItems: React.Dispatch<React.SetStateAction<Message[]>>
  /** True only for the first page. Older pages report through `loadingOlder`. */
  loading: boolean
  loadingOlder: boolean
  /** False once the room's whole history is held. */
  hasMore: boolean
  error: string | null
  /** Fetch the page before the oldest message held. Safe to call spuriously. */
  loadOlder: () => Promise<void>
  /**
   * How many messages the last `loadOlder` prepended.
   *
   * The list has to keep the reader's position when rows appear above them, and
   * that adjustment must happen before the browser paints. Exposing the count
   * lets the view do it in a layout effect rather than guessing.
   */
  prependedAt: number
}

/**
 * A room's messages: the latest page first, older ones as the reader goes back.
 *
 * Pulled out of the chat view because the loading rules are not about
 * rendering — the same behaviour is wanted by a direct conversation, a
 * community channel, and anything else that shows a transcript. The view keeps
 * scroll and composition; this keeps what has been fetched.
 *
 * Newest-first on the wire, oldest-first in `items`: the API pages backwards
 * from now, and the UI reads downwards.
 */
export function useMessageHistory(roomId: Uuid): MessageHistory {
  const { getToken } = useAuth()

  const [items, setItems] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [prependedAt, setPrependedAt] = useState(0)

  // A ref, not the state, guards re-entry: `setLoadingOlder(true)` does not
  // take effect until the next render, so two scroll events in one frame would
  // both see `loadingOlder === false` and fire the same request twice.
  const fetchingOlder = useRef(false)
  const exhausted = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    exhausted.current = false

    void (async () => {
      try {
        const page = await messagesApi.history(await getToken(), roomId)
        if (cancelled) return

        setItems([...page.messages].reverse())
        setCursor(
          page.next_before
            ? { before: page.next_before, beforeId: page.next_before_id }
            : null,
        )
        exhausted.current = !page.next_before
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [getToken, roomId])

  const loadOlder = useCallback(async () => {
    if (fetchingOlder.current || exhausted.current) return

    // Read through a functional update rather than closing over `cursor`, so a
    // caller wired to a scroll handler cannot fire with a stale one.
    let current: Cursor | null = null
    setCursor((value) => {
      current = value
      return value
    })
    if (!current) return

    fetchingOlder.current = true
    setLoadingOlder(true)

    try {
      const page = await messagesApi.history(
        await getToken(),
        roomId,
        (current as Cursor).before,
        (current as Cursor).beforeId,
      )
      const older = [...page.messages].reverse()

      setItems((existing) => mergeMessages(older, existing))
      setCursor(
        page.next_before
          ? { before: page.next_before, beforeId: page.next_before_id }
          : null,
      )
      exhausted.current = !page.next_before

      // Signals the view to re-anchor. A counter rather than a boolean: two
      // pages in a row must both fire, and a boolean would coalesce.
      if (older.length > 0) setPrependedAt((n) => n + 1)
    } catch {
      // Left silent on purpose — a failed page is retried by scrolling again,
      // and a toast per attempt would stack up while the reader flicks upward.
    } finally {
      fetchingOlder.current = false
      setLoadingOlder(false)
    }
  }, [getToken, roomId])

  return {
    items,
    setItems,
    loading,
    loadingOlder,
    hasMore: cursor !== null,
    error,
    loadOlder,
    prependedAt,
  }
}

/**
 * Combine two message lists, newest state winning, ordered by time.
 *
 * Pages overlap and realtime events re-deliver, so a naive concatenation would
 * duplicate. Keying by id makes the merge idempotent; ties on `created_at` fall
 * back to the id so the order matches the server's `(created_at, id)` sort
 * rather than depending on which page happened to arrive first.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]))

  for (const message of incoming) {
    const previous = byId.get(message.id)
    byId.set(message.id, {
      ...message,
      // An API older than inline reaction tallies omits the field entirely.
      // Defaulting keeps a stale server from blanking the transcript on `.length`.
      reactions: message.reactions ?? previous?.reactions ?? [],
    })
  }

  return [...byId.values()].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}
