import type {
  Message,
  MessagePage,
  ReactionSummary,
  RoomAnonymousIdentity,
  Timestamp,
  Uuid,
} from '@/lib/api'

export interface SendMessagePayload {
  content: string
  is_anonymous?: boolean
}

export interface EditMessagePayload {
  content: string
}

export interface ReactionPayload {
  messageId: Uuid
  reaction: string
}

export interface MessageHistoryParams {
  roomId: Uuid
  before?: string
  beforeId?: string
  limit?: number
}

export type { Message, MessagePage, ReactionSummary, RoomAnonymousIdentity, Timestamp, Uuid }
