import type {
  AppNotification,
  NotificationKind,
  NotificationPage,
  Timestamp,
  Uuid,
} from '@/lib/api'

export interface NotificationQueryParams {
  before?: Timestamp
  limit?: number
}

export type { AppNotification, NotificationKind, NotificationPage, Timestamp, Uuid }
