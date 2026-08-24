import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '../api/endpoints'
import type { NotificationPage, Timestamp, Uuid } from '../api/types'
import { queryKeys } from './keys'

export function useNotificationsQuery(
  token: string | null,
  before?: Timestamp,
  limit?: number,
) {
  return useQuery({
    queryKey: [...queryKeys.notifications.list(), before, limit],
    queryFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return notifications.list(token, before, limit)
    },
    enabled: Boolean(token),
  })
}

/**
 * Mark one notification read.
 *
 * Optimistic, because the badge is the whole point: a count that drops a round
 * trip after the tap reads as a tap that missed. The call is idempotent and the
 * `onError` rollback puts the old page back if it did not land.
 */
export function useMarkNotificationReadMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return notifications.markRead(token, notificationId)
    },
    onMutate: async (notificationId: Uuid) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list() })
      const previous = queryClient.getQueriesData<NotificationPage>({
        queryKey: queryKeys.notifications.list(),
      })

      const readAt = new Date().toISOString()
      for (const [key] of previous) {
        queryClient.setQueryData<NotificationPage>(key, (page) => {
          if (!page) return page
          let wasUnread = false
          const next = page.notifications.map((item) => {
            if (item.id !== notificationId || item.read_at) return item
            wasUnread = true
            return { ...item, read_at: readAt }
          })
          return {
            ...page,
            notifications: next,
            unread: wasUnread ? Math.max(0, page.unread - 1) : page.unread,
          }
        })
      }

      return { previous }
    },
    onError: (_error, _id, context) => {
      for (const [key, page] of context?.previous ?? []) {
        queryClient.setQueryData(key, page)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
    },
  })
}

export function useMarkAllNotificationsReadMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return notifications.markAllRead(token)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list() })
      const previous = queryClient.getQueriesData<NotificationPage>({
        queryKey: queryKeys.notifications.list(),
      })

      const readAt = new Date().toISOString()
      for (const [key] of previous) {
        queryClient.setQueryData<NotificationPage>(key, (page) =>
          page
            ? {
                ...page,
                notifications: page.notifications.map((item) =>
                  item.read_at ? item : { ...item, read_at: readAt },
                ),
                unread: 0,
              }
            : page,
        )
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      for (const [key, page] of context?.previous ?? []) {
        queryClient.setQueryData(key, page)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
    },
  })
}
