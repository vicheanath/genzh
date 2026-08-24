import { messages as coreMessages } from '@/lib/api'
import type {
  EditMessagePayload,
  Message,
  MessageHistoryParams,
  MessagePage,
  ReactionPayload,
  ReactionSummary,
  SendMessagePayload,
  Uuid,
} from './types'

/**
 * Backend-for-Frontend (BFF) Chat API client.
 * Handles room message paging, sending messages, edits, deletions, and reactions.
 * Every method adheres to Single Responsibility and handles a dedicated backend communication flow.
 */
export const chatApi = {
  /** Fetch paginated room message history (newest first). */
  fetchMessages(token: string, params: MessageHistoryParams): Promise<MessagePage> {
    return coreMessages.history(
      token,
      params.roomId,
      params.before,
      params.beforeId,
      params.limit ?? 50,
    )
  },
  history(
    token: string,
    roomId: Uuid,
    before?: string,
    beforeId?: string,
    limit = 50,
  ): Promise<MessagePage> {
    return coreMessages.history(token, roomId, before, beforeId, limit)
  },

  /** Post a new message to a room. */
  sendMessage(
    token: string,
    roomId: Uuid,
    payload: SendMessagePayload,
  ): Promise<Message> {
    return coreMessages.post(token, roomId, payload.content, payload.is_anonymous)
  },
  post(
    token: string,
    roomId: Uuid,
    content: string,
    is_anonymous?: boolean,
  ): Promise<Message> {
    return coreMessages.post(token, roomId, content, is_anonymous)
  },

  /** Edit an existing message. */
  editMessage(
    token: string,
    messageId: Uuid,
    payload: EditMessagePayload,
  ): Promise<Message> {
    return coreMessages.edit(token, messageId, payload.content)
  },
  edit(token: string, messageId: Uuid, content: string): Promise<Message> {
    return coreMessages.edit(token, messageId, content)
  },

  /** Delete a message. */
  deleteMessage(token: string, messageId: Uuid): Promise<void> {
    return coreMessages.remove(token, messageId)
  },
  remove(token: string, messageId: Uuid): Promise<void> {
    return coreMessages.remove(token, messageId)
  },

  /** Add or toggle an emoji reaction on a message. */
  addReaction(
    token: string,
    payload: ReactionPayload,
  ): Promise<ReactionSummary[]> {
    return coreMessages.react(token, payload.messageId, payload.reaction)
  },
  react(token: string, messageId: Uuid, reaction: string): Promise<ReactionSummary[]> {
    return coreMessages.react(token, messageId, reaction)
  },

  /** Remove an emoji reaction from a message. */
  removeReaction(
    token: string,
    payload: ReactionPayload,
  ): Promise<ReactionSummary[]> {
    return coreMessages.unreact(token, payload.messageId, payload.reaction)
  },
  unreact(token: string, messageId: Uuid, reaction: string): Promise<ReactionSummary[]> {
    return coreMessages.unreact(token, messageId, reaction)
  },
}
