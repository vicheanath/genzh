import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { messages } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import { mergeMessages } from './cache'
import type { EditMessagePayload, MessagePage, ReactionPayload, SendMessagePayload, Uuid } from './types'

export const chatKeys = {
  all: ['chat'] as const,
  room: (roomId: Uuid) => [...chatKeys.all, 'room', roomId] as const,
  messages: (roomId: Uuid) => [...chatKeys.room(roomId), 'messages'] as const,
  pins: (roomId: Uuid) => [...chatKeys.room(roomId), 'pins'] as const,
  search: (query: string, roomId?: Uuid) => [...chatKeys.all, 'search', { query, roomId }] as const,
  unread: () => [...chatKeys.all, 'unread'] as const,
}

/** Where the next page starts. Both halves, or paging can skip messages. */
export interface MessageCursor {
  before?: string
  beforeId?: string
}

/**
 * A room's transcript: the latest page first, older ones as the reader goes back.
 *
 * Newest-first on the wire, oldest-first in `items`: the API pages backwards
 * from now, and the UI reads downwards. The flattening happens in `select`, so
 * the cache keeps the server's own page shape and the socket can write into it
 * without the view having to re-derive anything.
 */
export function useRoomMessagesInfinite(roomId: Uuid | null | undefined, limit = 50) {
  const signedIn = useIsSignedIn()

  return useInfiniteQuery({
    queryKey: roomId ? chatKeys.messages(roomId) : [...chatKeys.all, 'idle'],
    queryFn: ({ pageParam }) =>
      messages.history(null, roomId!, pageParam?.before, pageParam?.beforeId, limit),
    initialPageParam: undefined as MessageCursor | undefined,
    getNextPageParam: (lastPage: MessagePage) =>
      lastPage.next_before
        ? { before: lastPage.next_before, beforeId: lastPage.next_before_id }
        : undefined,
    enabled: signedIn && Boolean(roomId),
    // The transcript is kept current by the socket, not by refetching: a
    // background refetch would re-fire every page the reader has scrolled back
    // through, to arrive at what the socket already delivered.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    select: (data) => ({
      ...data,
      items: mergeMessages([], data.pages.flatMap((page) => page.messages)),
    }),
  })
}

export function useSendMessageMutation(roomId: Uuid | null | undefined) {
  return useMutation({
    mutationFn: (payload: SendMessagePayload) =>
      messages.post(null, roomId!, payload.content, payload.is_anonymous, payload.reply_to_id),
    // No invalidation: the server echoes the message back over the socket, and
    // the bridge writes it into the cache. Refetching here would race that.
  })
}

export function useEditMessageMutation() {
  return useMutation({
    mutationFn: ({ messageId, payload }: { messageId: Uuid; payload: EditMessagePayload }) =>
      messages.edit(null, messageId, payload.content),
  })
}

export function useDeleteMessageMutation() {
  return useMutation({
    mutationFn: (messageId: Uuid) => messages.remove(null, messageId),
  })
}

export function useReactionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, reaction, action }: ReactionPayload & { action: 'add' | 'remove' }) =>
      action === 'add'
        ? messages.react(null, messageId, reaction)
        : messages.unreact(null, messageId, reaction),
    onSuccess: (reactions, { messageId }) => {
      // The call answers with the message's whole new tally, so the sender sees
      // it land without waiting for the broadcast to come back around.
      queryClient.setQueriesData<{ pages: MessagePage[] }>(
        { queryKey: chatKeys.all },
        (cached) =>
          cached && {
            ...cached,
            pages: cached.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === messageId ? { ...message, reactions } : message,
              ),
            })),
          },
      )
    },
  })
}

export function useRoomPinsQuery(roomId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: roomId ? chatKeys.pins(roomId) : [...chatKeys.all, 'idle', 'pins'],
    queryFn: () => messages.pins(null, roomId!),
    enabled: signedIn && Boolean(roomId),
  })
}

export function usePinMessageMutation(roomId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: Uuid) => messages.pin(null, messageId),
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.pins(roomId) })
      }
    },
  })
}

export function useUnpinMessageMutation(roomId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: Uuid) => messages.unpin(null, messageId),
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.pins(roomId) })
      }
    },
  })
}

export function useSearchMessagesQuery(query: string, roomId?: Uuid, limit = 30) {
  const signedIn = useIsSignedIn()
  const trimmed = query.trim()
  return useQuery({
    queryKey: chatKeys.search(trimmed, roomId),
    queryFn: () => messages.search(null, { q: trimmed, room_id: roomId, limit }),
    enabled: signedIn && trimmed.length > 0,
    staleTime: 30_000,
  })
}

export function useUnreadOverviewQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: chatKeys.unread(),
    queryFn: () => messages.unread(null),
    enabled: signedIn,
    refetchInterval: 15_000,
  })
}

export function useMarkRoomReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: Uuid) => messages.markRead(null, roomId),
    onSuccess: (_, roomId) => {
      queryClient.setQueryData<import('@/lib/api').RoomUnread[]>(chatKeys.unread(), (old) => {
        if (!old) return old
        return old.map((entry) => (entry.room_id === roomId ? { ...entry, unread: 0 } : entry))
      })
    },
  })
}

export function useMuteRoomMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roomId, muted }: { roomId: Uuid; muted: boolean }) =>
      messages.setMuted(null, roomId, muted),
    onSuccess: (_, { roomId, muted }) => {
      queryClient.setQueryData<import('@/lib/api').RoomUnread[]>(chatKeys.unread(), (old) => {
        if (!old) return old
        return old.map((entry) => (entry.room_id === roomId ? { ...entry, muted } : entry))
      })
    },
  })
}

