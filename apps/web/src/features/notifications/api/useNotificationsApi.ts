import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from './notificationsApi'
import type { NotificationPage, Timestamp, Uuid } from './types'

export const notificationKeys = {
  all: ['notifications'] as const,
  feed: () => [...notificationKeys.all, 'feed'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

export function useNotificationsInfinite(token: string | null, limit = 20) {
  return useInfiniteQuery({
    queryKey: notificationKeys.feed(),
    queryFn: ({ pageParam }) => {
      if (!token) throw new Error('Unauthenticated')
      return notificationsApi.list(token, { before: pageParam, limit })
    },
    initialPageParam: undefined as Timestamp | undefined,
    getNextPageParam: (lastPage: NotificationPage) => lastPage.next_before,
    enabled: Boolean(token),
  })
}

export function useMarkNotificationReadMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return notificationsApi.markRead(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useMarkAllNotificationsReadMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Unauthenticated')
      return notificationsApi.markAllRead(token)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
