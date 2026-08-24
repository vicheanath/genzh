import type {
  DiscoveryResponse,
  MediaJoinResponse,
  Permission,
  Room,
  RoomAnonymousIdentity,
  RoomParticipant,
  RoomParticipantRole,
  RoomStatus,
  RoomType,
  RoomVisibility,
  RoomWithPermissions,
  Timestamp,
  UserRoom,
  Uuid,
} from '@/lib/api'

export interface CreateStandaloneRoomInput {
  name: string
  room_type: RoomType
  topic?: string
  category?: string
  visibility?: RoomVisibility
  is_anonymous?: boolean
  duration_minutes?: number
  max_participants?: number
  participant_ids?: Uuid[]
}

export interface CreateCommunityRoomInput {
  name: string
  room_type: RoomType
  topic?: string
  category?: string
  visibility?: RoomVisibility
  is_anonymous?: boolean
  duration_minutes?: number
  position?: number
  max_participants?: number
}

export interface UpdateRoomInput {
  name?: string
  topic?: string
  category?: string
  visibility?: RoomVisibility
  status?: RoomStatus
  position?: number
  max_participants?: number
}

export type {
  DiscoveryResponse,
  MediaJoinResponse,
  Permission,
  Room,
  RoomAnonymousIdentity,
  RoomParticipant,
  RoomParticipantRole,
  RoomStatus,
  RoomType,
  RoomVisibility,
  RoomWithPermissions,
  Timestamp,
  UserRoom,
  Uuid,
}
