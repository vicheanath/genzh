import type {
  Invite,
  InvitePreview,
  Message,
  MessagePage,
  MessageSearchParams,
  ReactionSummary,
  RoomAnonymousIdentity,
  RoomUnread,
  Timestamp,
  Uuid,
} from '@/lib/api'

export interface SendMessagePayload {
  content: string
  is_anonymous?: boolean
  reply_to_id?: Uuid
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

export type {
  Invite,
  InvitePreview,
  Message,
  MessagePage,
  MessageSearchParams,
  ReactionSummary,
  RoomAnonymousIdentity,
  RoomUnread,
  Timestamp,
  Uuid,
}
