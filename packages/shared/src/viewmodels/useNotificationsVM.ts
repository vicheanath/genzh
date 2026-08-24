import { useCallback, useMemo } from 'react'
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '../queries/notifications.queries'
import type { Timestamp, Uuid } from '../api/types'

export function useNotificationsVM(
  token: string | null,
  before?: Timestamp,
  limit?: number,
) {
  const query = useNotificationsQuery(token, before, limit)
  const markReadMutation = useMarkNotificationReadMutation(token)
  const markAllReadMutation = useMarkAllNotificationsReadMutation(token)

  const notifications = useMemo(() => query.data?.notifications ?? [], [query.data])
  const unreadCount = query.data?.unread ?? 0

  const markAsRead = useCallback(
    async (notificationId: Uuid) => {
      return markReadMutation.mutateAsync(notificationId)
    },
    [markReadMutation],
  )

  const markAllAsRead = useCallback(async () => {
    return markAllReadMutation.mutateAsync()
  }, [markAllReadMutation])

  return {
    // Model state
    notifications,
    unreadCount,
    nextBefore: query.data?.next_before,

    // Status
    isLoading: query.isLoading,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,

    // Errors
    error: query.error,

    // Actions
    markAsRead,
    markAllAsRead,
    refresh: query.refetch,
  }
}
