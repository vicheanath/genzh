import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '../api/endpoints'
import type { Timestamp, Uuid } from '../api/types'
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

export function useMarkNotificationReadMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return notifications.markRead(token, notificationId)
    },
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
    },
  })
}
