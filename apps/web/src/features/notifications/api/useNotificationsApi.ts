import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { notifications } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type { AppNotification, NotificationPage, Timestamp, Uuid } from './types'

export const notificationKeys = {
  all: ['notifications'] as const,
  feed: () => [...notificationKeys.all, 'feed'] as const,
}

type Feed = { pages: NotificationPage[] }

/**
 * The notification inbox.
 *
 * The list is fetched so anything that arrived while you were away is there,
 * and the socket bridge prepends what happens while you are looking. The server
 * stores every notification before pushing it, so what arrives live is the same
 * row a reload would show — a pushed item never vanishes on refresh.
 *
 * `unread` is the server's own count rather than a tally of the rows currently
 * loaded: the badge has to be right before you have scrolled the whole feed.
 */
export function useNotificationsInfinite(limit = 20) {
  const signedIn = useIsSignedIn()
  return useInfiniteQuery({
    queryKey: notificationKeys.feed(),
    queryFn: ({ pageParam }) => notifications.list(null, pageParam, limit),
    initialPageParam: undefined as Timestamp | undefined,
    getNextPageParam: (lastPage: NotificationPage) => lastPage.next_before,
    enabled: signedIn,
    select: (data) => ({
      ...data,
      items: data.pages.flatMap((page) => page.notifications),
      unread: data.pages[0]?.unread ?? 0,
    }),
  })
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: Uuid) => notifications.markRead(null, id),
    // Optimistic: the badge should drop the instant it is clicked, and the
    // request is idempotent, so a failure costs nothing but a stale count.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.feed() })
      const previous = queryClient.getQueryData<Feed>(notificationKeys.feed())

      let wasUnread = false
      for (const page of previous?.pages ?? []) {
        if (page.notifications.some((item) => item.id === id && !item.read_at)) wasUnread = true
      }

      editFeed(queryClient, {
        patch: (item) =>
          item.id === id && !item.read_at
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        unread: (count) => (wasUnread ? Math.max(0, count - 1) : count),
      })

      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.feed(), context.previous)
    },
  })
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notifications.markAllRead(null),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.feed() })
      const previous = queryClient.getQueryData<Feed>(notificationKeys.feed())
      const readAt = new Date().toISOString()

      editFeed(queryClient, {
        patch: (item) => (item.read_at ? item : { ...item, read_at: readAt }),
        unread: () => 0,
      })

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.feed(), context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.feed() })
    },
  })
}

/**
 * Rewrite the cached feed.
 *
 * `unread` lives on every page but only page 0's is read, so the count is
 * adjusted across all of them to keep a later refetch from resurrecting a stale
 * badge from a page the reader had already scrolled past.
 */
function editFeed(
  queryClient: QueryClient,
  edit: {
    patch?: (item: AppNotification) => AppNotification
    prepend?: AppNotification
    unread: (count: number) => number
  },
): void {
  queryClient.setQueryData<Feed>(notificationKeys.feed(), (cached) => {
    if (!cached || cached.pages.length === 0) return cached

    return {
      ...cached,
      pages: cached.pages.map((page, index) => {
        let items = edit.patch ? page.notifications.map(edit.patch) : page.notifications
        if (edit.prepend) {
          // Dropped from every page, not just the one it is going onto: a row
          // that grew was already somewhere in the feed, possibly pages down,
          // and re-delivery is possible on reconnect either way.
          const prepend = edit.prepend
          items = items.filter((item) => item.id !== prepend.id)
          if (index === 0) items = [prepend, ...items]
        }
        return { ...page, notifications: items, unread: edit.unread(page.unread) }
      }),
    }
  })
}

/**
 * A notification arrived over the socket. Called by the realtime bridge.
 *
 * `isNew` is false when the server folded this event into a row the reader
 * already has — the second message of a conversation updates the notification
 * the first one opened rather than making another. Such a row is rewritten in
 * place and lifted back to the top, and the badge is left alone: the
 * conversation is already counted, and counting it again would make one chat
 * look like five.
 */
export function applyNotificationCreated(
  queryClient: QueryClient,
  notification: AppNotification,
  isNew: boolean,
): void {
  const feed = queryClient.getQueryData<Feed>(notificationKeys.feed())
  const alreadyHeld =
    feed?.pages.some((page) => page.notifications.some((item) => item.id === notification.id)) ??
    false

  // A fold the reader has never seen — it happened while they were away, or its
  // row has been scrolled past — still belongs at the top, but the count it
  // arrived with was already in the server's total.
  const counts = isNew && !alreadyHeld && !notification.read_at

  editFeed(queryClient, {
    prepend: notification,
    unread: (count) => (counts ? count + 1 : count),
  })
}
