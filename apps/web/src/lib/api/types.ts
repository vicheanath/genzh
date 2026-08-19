/**
 * Wire types, mirroring the Rust DTOs in `apps/api/src/routes`.
 *
 * Hand-written rather than generated: the surface is small, and a generator
 * would be a build step to maintain for types that change when the handlers do
 * — which is exactly when a compile error is most useful.
 */

export type Uuid = string
/** RFC 3339, always UTC. */
export type Timestamp = string

export type RoomType = 'text' | 'voice' | 'video' | 'activity'

export type Permission =
  | 'view_room'
  | 'send_message'
  | 'add_reaction'
  | 'speak'
  | 'use_video'
  | 'screen_share'
  | 'stream'
  | 'mute_members'
  | 'move_members'
  | 'manage_room'
  | 'manage_community'
  | 'manage_roles'
  | 'manage_members'
  | 'administrator'

export interface Profile {
  user_id: Uuid
  display_name: string
  bio: string | null
  avatar_url: string | null
  avatar_effect: string | null
  accent_color: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface CurrentUser {
  id: Uuid
  handle: string
  email: string
  profile: Profile
}

export interface PublicProfile {
  id: Uuid
  handle: string
  display_name: string
  avatar_url: string | null
  avatar_effect: string | null
  accent_color: string | null
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface AuthResponse extends TokenPair {
  user: CurrentUser
}

export interface Community {
  id: Uuid
  name: string
  description: string | null
  icon_url: string | null
  owner_id: Uuid
  created_at: Timestamp
  updated_at: Timestamp
}

export interface CommunityWithPermissions extends Community {
  your_permissions: Permission[]
}

export interface CommunityMember {
  community_id: Uuid
  user_id: Uuid
  nickname: string | null
  joined_at: Timestamp
}

export interface Room {
  id: Uuid
  community_id: Uuid
  name: string
  topic: string | null
  room_type: RoomType
  position: number
  max_participants: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface RoomWithPermissions extends Room {
  your_permissions: Permission[]
}

export interface Message {
  id: Uuid
  room_id: Uuid
  author_id: Uuid
  content: string
  edited_at: Timestamp | null
  created_at: Timestamp
}

export interface MessagePage {
  messages: Message[]
  next_before: Timestamp | null
}

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

export interface MediaJoinResponse {
  room_id: Uuid
  participant_id: Uuid
  media_url: string
  token: string
  expires_at: Timestamp
  ice_servers: IceServer[]
}
