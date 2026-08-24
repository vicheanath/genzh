import { useCallback, useMemo } from 'react'
import {
  useAddReactionMutation,
  useMessagesQuery,
  useRemoveReactionMutation,
  useSendMessageMutation,
} from '../queries/messages.queries'
import type { Uuid } from '../api/types'

export function useChatVM(token: string | null, roomId: Uuid | null | undefined) {
  const messagesQuery = useMessagesQuery(token, roomId)
  const sendMutation = useSendMessageMutation(token)
  const addReactionMutation = useAddReactionMutation(token)
  const removeReactionMutation = useRemoveReactionMutation(token)

  const messages = useMemo(() => {
    return messagesQuery.data?.messages ?? []
  }, [messagesQuery.data])

  const nextBefore = messagesQuery.data?.next_before
  const hasMore = Boolean(nextBefore)

  const sendMessage = useCallback(
    async (content: string, isAnonymous?: boolean) => {
      if (!roomId) throw new Error('No active room')
      return sendMutation.mutateAsync({ roomId, content, isAnonymous })
    },
    [roomId, sendMutation],
  )

  const toggleReaction = useCallback(
    async (messageId: Uuid, emoji: string, alreadyReacted: boolean) => {
      if (!roomId) return
      if (alreadyReacted) {
        return removeReactionMutation.mutateAsync({ roomId, messageId, reaction: emoji })
      } else {
        return addReactionMutation.mutateAsync({ roomId, messageId, reaction: emoji })
      }
    },
    [roomId, addReactionMutation, removeReactionMutation],
  )

  return {
    // Model state
    messages,
    hasMore,
    nextBefore,

    // Status
    isLoading: messagesQuery.isLoading,
    isSending: sendMutation.isPending,
    isReacting: addReactionMutation.isPending || removeReactionMutation.isPending,

    // Errors
    error: messagesQuery.error,
    sendError: sendMutation.error,

    // Actions
    sendMessage,
    toggleReaction,
    refetch: messagesQuery.refetch,
  }
}
