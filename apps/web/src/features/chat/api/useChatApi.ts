import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from './chatApi'
import type {
  EditMessagePayload,
  MessagePage,
  ReactionPayload,
  SendMessagePayload,
  Uuid,
} from './types'

export const chatKeys = {
  all: ['chat'] as const,
  room: (roomId: Uuid) => [...chatKeys.all, 'room', roomId] as const,
  messages: (roomId: Uuid) => [...chatKeys.room(roomId), 'messages'] as const,
}

export function useRoomMessagesInfinite(
  token: string | null,
  roomId: Uuid | null,
  limit = 50,
) {
  return useInfiniteQuery({
    queryKey: roomId ? chatKeys.messages(roomId) : ['chat', 'unselected'],
    queryFn: ({ pageParam }) => {
      if (!token || !roomId) throw new Error('Unauthenticated or invalid room')
      return chatApi.fetchMessages(token, {
        roomId,
        before: pageParam?.before,
        beforeId: pageParam?.beforeId,
        limit,
      })
    },
    initialPageParam: undefined as { before?: string; beforeId?: string } | undefined,
    getNextPageParam: (lastPage: MessagePage) => {
      if (!lastPage.next_before) return undefined
      return {
        before: lastPage.next_before,
        beforeId: lastPage.next_before_id,
      }
    },
    enabled: Boolean(token && roomId),
  })
}

export function useSendMessageMutation(token: string | null, roomId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SendMessagePayload) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room')
      return chatApi.sendMessage(token, roomId, payload)
    },
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.messages(roomId) })
      }
    },
  })
}

export function useEditMessageMutation(token: string | null, roomId?: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      payload,
    }: {
      messageId: Uuid
      payload: EditMessagePayload
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return chatApi.editMessage(token, messageId, payload)
    },
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.messages(roomId) })
      }
    },
  })
}

export function useDeleteMessageMutation(token: string | null, roomId?: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return chatApi.deleteMessage(token, messageId)
    },
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.messages(roomId) })
      }
    },
  })
}

export function useReactionMutation(token: string | null, roomId?: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ReactionPayload & { action: 'add' | 'remove' }) => {
      if (!token) throw new Error('Unauthenticated')
      if (payload.action === 'add') {
        return chatApi.addReaction(token, payload)
      }
      return chatApi.removeReaction(token, payload)
    },
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.messages(roomId) })
      }
    },
  })
}
