import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { messages } from '../api/endpoints'
import type { Uuid } from '../api/types'
import { queryKeys } from './keys'

export function useMessagesQuery(
  token: string | null,
  roomId: Uuid | null | undefined,
  options?: { before?: string; beforeId?: string; limit?: number },
) {
  return useQuery({
    queryKey: roomId
      ? [...queryKeys.messages.list(roomId), options?.before, options?.beforeId, options?.limit]
      : ['messages', 'list', null],
    queryFn: () => {
      if (!token || !roomId) throw new Error('Missing token or roomId')
      return messages.history(token, roomId, options?.before, options?.beforeId, options?.limit)
    },
    enabled: Boolean(token && roomId),
  })
}

export function useSendMessageMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      roomId,
      content,
      isAnonymous,
    }: {
      roomId: Uuid
      content: string
      isAnonymous?: boolean
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return messages.post(token, roomId, content, isAnonymous)
    },
    onSuccess: (_newMessage, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) })
    },
  })
}

export function useAddReactionMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      reaction,
    }: {
      roomId: Uuid
      messageId: Uuid
      reaction: string
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return messages.react(token, messageId, reaction)
    },
    onSuccess: (_summary, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) })
    },
  })
}

export function useRemoveReactionMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      reaction,
    }: {
      roomId: Uuid
      messageId: Uuid
      reaction: string
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return messages.unreact(token, messageId, reaction)
    },
    onSuccess: (_summary, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) })
    },
  })
}

export function useEditMessageMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      content,
    }: {
      roomId: Uuid
      messageId: Uuid
      content: string
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return messages.edit(token, messageId, content)
    },
    onSuccess: (_updatedMessage, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) })
    },
  })
}

export function useDeleteMessageMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
    }: {
      roomId: Uuid
      messageId: Uuid
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return messages.remove(token, messageId)
    },
    onSuccess: (_data, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) })
    },
  })
}

