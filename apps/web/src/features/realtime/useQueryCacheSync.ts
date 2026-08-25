import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import {
  applyMessageCreated,
  applyMessageDeleted,
  applyMessageUpdated,
  applyNotificationCreated,
  applyReactionsUpdated,
  friendKeys,
  roomKeys,
  socialGraphKeys,
} from '@/features/api'
import type { Uuid } from '@/lib/api'
import { chatSocket, type ChatServerEvent } from '@/lib/ws/ChatSocket'

/**
 * The one place a socket frame becomes cached state.
 *
 * Before this, five providers each opened their own subscription and kept their
 * own copy of what the server said, which meant a message could be in the chat
 * view and not in the transcript the notification panel counted, and the only
 * way to find out was to reload. Now the socket writes into the same cache the
 * queries fill, so there is exactly one answer to "what does this room hold"
 * regardless of whether it arrived by fetch or by frame.
 *
 * Everything here is a *cache write*, never a UI decision. Ringing a call and
 * showing "…is typing" are the view's business and stay in the components that
 * render them, subscribing through `useSocketEvent`.
 */
export function useQueryCacheSync(enabled: boolean): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const unsubscribes = [
      chatSocket.on<ChatServerEvent>('message_created', (event) => {
        if (event.type !== 'message_created') return
        applyMessageCreated(
          queryClient,
          event.room_id,
          event.message,
          event.reactions,
          event.anonymous_author,
        )
      }),

      chatSocket.on<ChatServerEvent>('message_updated', (event) => {
        if (event.type !== 'message_updated') return
        applyMessageUpdated(
          queryClient,
          event.room_id,
          event.message,
          event.reactions,
          event.anonymous_author,
        )
      }),

      chatSocket.on<ChatServerEvent>('message_deleted', (event) => {
        if (event.type !== 'message_deleted') return
        applyMessageDeleted(queryClient, event.room_id, event.message_id)
      }),

      chatSocket.on<ChatServerEvent>('reactions_updated', (event) => {
        if (event.type !== 'reactions_updated') return
        applyReactionsUpdated(queryClient, event.room_id, event.message_id, event.reactions)
      }),

      chatSocket.on<ChatServerEvent>('presence_changed', (event) => {
        if (event.type !== 'presence_changed') return
        applyPresence(queryClient, event.user_id, event.online)
      }),

      chatSocket.on<ChatServerEvent>('notification_created', (event) => {
        if (event.type !== 'notification_created') return
        applyNotificationCreated(queryClient, event.notification)

        // The other side accepting is the one change that happens without this
        // tab doing anything, and it is exactly the one that would leave a
        // stale "Request sent" sitting where a Call button belongs.
        const { kind } = event.notification
        if (kind === 'friend_request' || kind === 'friend_accepted') {
          for (const queryKey of socialGraphKeys) queryClient.invalidateQueries({ queryKey })
        }
      }),

      chatSocket.on<ChatServerEvent>('direct_room_opened', (event) => {
        if (event.type !== 'direct_room_opened') return
        queryClient.invalidateQueries({ queryKey: roomKeys.mine() })
      }),
    ]

    return () => {
      for (const off of unsubscribes) off()
    }
  }, [enabled, queryClient])
}

/** Apply one presence delta on top of the fetched starting point. */
function applyPresence(queryClient: QueryClient, userId: Uuid, online: boolean): void {
  queryClient.setQueryData<Uuid[]>(friendKeys.presence(), (current) => {
    if (!current) return current
    const without = current.filter((id) => id !== userId)
    return online ? [...without, userId] : without
  })
}
