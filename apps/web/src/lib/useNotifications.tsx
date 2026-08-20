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
  notifications as notificationsApi,
  type AppNotification,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { chatSocket, type ChatServerEvent } from '@/lib/ws/ChatSocket'

interface NotificationsValue {
  items: AppNotification[]
  unread: number
  loading: boolean
  markRead: (id: Uuid) => Promise<void>
  markAllRead: () => Promise<void>
  reload: () => void
}

const NotificationsContext = createContext<NotificationsValue | null>(null)

/**
 * The notification inbox.
 *
 * Same two-source shape as presence: the list is fetched once so anything that
 * arrived while you were away is there, and the socket appends what happens
 * while you are looking. The server stores every notification before pushing
 * it, so what arrives live is the same row a reload would show — a pushed item
 * never vanishes on refresh.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const signedIn = Boolean(user)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!signedIn) {
      setItems([])
      setUnread(0)
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const page = await notificationsApi.list(await getToken())
        if (cancelled) return
        setItems(page.notifications)
        setUnread(page.unread)
      } catch {
        // An unreachable inbox should not break the shell around it.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [signedIn, getToken, nonce])

  useEffect(() => {
    if (!signedIn) return

    return chatSocket.on<ChatServerEvent>('notification_created', (event) => {
      if (event.type !== 'notification_created') return

      setItems((current) => {
        // The server deduplicates, but a reconnect can replay; matching on id
        // keeps a double delivery from doubling the list.
        if (current.some((item) => item.id === event.notification.id)) return current
        return [event.notification, ...current]
      })
      setUnread((count) => count + 1)
    })
  }, [signedIn])

  const markRead = useCallback(
    async (id: Uuid) => {
      // Optimistic: the badge should drop the instant it is clicked, and the
      // request is idempotent, so a failure costs nothing but a stale count
      // until the next load.
      let wasUnread = false
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id || item.read_at) return item
          wasUnread = true
          return { ...item, read_at: new Date().toISOString() }
        }),
      )
      if (wasUnread) setUnread((count) => Math.max(0, count - 1))

      try {
        await notificationsApi.markRead(await getToken(), id)
      } catch {
        // Left as-is; the next reload reconciles.
      }
    },
    [getToken],
  )

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString()
    setItems((current) =>
      current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
    )
    setUnread(0)

    try {
      await notificationsApi.markAllRead(await getToken())
    } catch {
      // Left as-is; the next reload reconciles.
    }
  }, [getToken])

  const value = useMemo<NotificationsValue>(
    () => ({ items, unread, loading, markRead, markAllRead, reload }),
    [items, unread, loading, markRead, markAllRead, reload],
  )

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsValue {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return context
}
