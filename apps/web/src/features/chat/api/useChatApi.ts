import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { messages } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import { mergeMessages } from './cache'
import type { EditMessagePayload, MessagePage, ReactionPayload, SendMessagePayload, Uuid } from './types'

export const chatKeys = {
  all: ['chat'] as const,
  room: (roomId: Uuid) => [...chatKeys.all, 'room', roomId] as const,
  messages: (roomId: Uuid) => [...chatKeys.room(roomId), 'messages'] as const,
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
      messages.post(null, roomId!, payload.content, payload.is_anonymous),
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
