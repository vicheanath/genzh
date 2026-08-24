import { notifications as coreNotifications } from '@/lib/api'
import type { NotificationPage, NotificationQueryParams, Uuid } from './types'

/**
 * Backend-for-Frontend (BFF) Notifications API client.
 * Manages notification feed paging, unread tracking, and read state transitions.
 */
export const notificationsApi = {
  /** Fetch paginated notification feed. */
  list(token: string, params?: NotificationQueryParams): Promise<NotificationPage> {
    return coreNotifications.list(token, params?.before, params?.limit)
  },

  /** Mark a single notification as read. */
  markRead(token: string, id: Uuid): Promise<void> {
    return coreNotifications.markRead(token, id)
  },

  /** Mark all notifications as read in bulk. */
  markAllRead(token: string): Promise<void> {
    return coreNotifications.markAllRead(token)
  },
}
