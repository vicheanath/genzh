import { useMemo } from 'react'

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsInfinite,
  type AppNotification,
} from '@/features/api'
import type { Uuid } from '@/lib/api'

interface NotificationsValue {
  items: AppNotification[]
  unread: number
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  markRead: (id: Uuid) => void
  markAllRead: () => void
}

/**
 * The notification inbox.
 *
 * A reader over the query cache: `useNotificationsInfinite` fetches it, the
 * mutations write to it optimistically, and the realtime bridge prepends what
 * arrives over the socket. There is no `<NotificationsProvider>` any more —
 * the cache is the shared instance, so the bell and the panel read the same
 * rows without a context in between.
 */
export function useNotifications(): NotificationsValue {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useNotificationsInfinite()
  const { mutate: markRead } = useMarkNotificationReadMutation()
  const { mutate: markAllRead } = useMarkAllNotificationsReadMutation()

  return useMemo(
    () => ({
      items: data?.items ?? [],
      unread: data?.unread ?? 0,
      loading: isLoading,
      hasMore: hasNextPage,
      loadingMore: isFetchingNextPage,
      loadMore: () => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
      },
      markRead: (id: Uuid) => markRead(id),
      markAllRead: () => markAllRead(),
    }),
    [data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage, markRead, markAllRead],
  )
}
