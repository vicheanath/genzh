import { request } from './client'
import type {
  AuthConfig,
  AuthResponse,
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CurrentUser,
  DiscoveryResponse,
  Friendship,
  MediaJoinResponse,
  Message,
  MessagePage,
  Profile,
  PublicProfile,
  ReactionSummary,
  RoleWithPermissions,
  Room,
  RoomParticipant,
  RoomStatus,
  RoomType,
  RoomVisibility,
  RoomWithPermissions,
  TokenPair,
  NotificationPage,
  Timestamp,
  UpdateProfileInput,
  UserRoom,
  Uuid,
} from './types'

/**
 * The API surface, one function per endpoint.
 *
 * Each takes the access token explicitly rather than reading it from a module
 * global: that keeps these pure and testable, and makes it impossible to fire a
 * request with a stale token captured in a closure.
 */

// ── auth ──────────────────────────────────────────────────────────────────

export const auth = {
  config: () => request<AuthConfig>('/api/v1/auth/config'),

  register: (input: {
    handle: string
    email: string
    password: string
    display_name?: string
  }) => request<AuthResponse>('/api/v1/auth/register', { method: 'POST', body: input }),

  login: (input: { identifier: string; password: string }) =>
    request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: input }),

  refresh: (refresh_token: string) =>
    request<TokenPair>('/api/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token },
    }),

  logout: (refresh_token: string) =>
    request<void>('/api/v1/auth/logout', { method: 'POST', body: { refresh_token } }),

  me: (token: string) => request<CurrentUser>('/api/v1/me', { token }),

  updateProfile: (token: string, input: UpdateProfileInput) =>
    request<Profile>('/api/v1/me', { method: 'PATCH', body: input, token }),
}

// ── users ─────────────────────────────────────────────────────────────────

export const users = {
  get: (token: string, userId: Uuid) =>
    request<PublicProfile>(`/api/v1/users/${userId}`, { token }),
}

// ── communities ───────────────────────────────────────────────────────────

export const communities = {
  list: (token: string) => request<Community[]>('/api/v1/communities', { token }),

  get: (token: string, id: Uuid) =>
    request<CommunityWithPermissions>(`/api/v1/communities/${id}`, { token }),

  create: (token: string, input: { name: string; description?: string; icon_url?: string }) =>
    request<CommunityWithPermissions>('/api/v1/communities', {
      method: 'POST',
      body: input,
      token,
    }),

  join: (token: string, id: Uuid) =>
    request<CommunityMember>(`/api/v1/communities/${id}/members`, {
      method: 'POST',
      body: {},
      token,
    }),

  members: (token: string, id: Uuid, limit = 100) =>
    request<CommunityMember[]>(`/api/v1/communities/${id}/members?limit=${limit}`, { token }),

  update: (
    token: string,
    id: Uuid,
    input: { name?: string; description?: string; icon_url?: string },
  ) =>
    request<Community>(`/api/v1/communities/${id}`, {
      method: 'PATCH',
      body: input,
      token,
    }),

  leave: (token: string, id: Uuid, userId: Uuid) =>
    request<void>(`/api/v1/communities/${id}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  delete: (token: string, id: Uuid) =>
    request<void>(`/api/v1/communities/${id}`, {
      method: 'DELETE',
      token,
    }),

  roles: (token: string, id: Uuid) =>
    request<RoleWithPermissions[]>(`/api/v1/communities/${id}/roles`, { token }),

  createRole: (
    token: string,
    id: Uuid,
    input: { name: string; color?: string; position?: number; permissions?: string[] },
  ) =>
    request<RoleWithPermissions>(`/api/v1/communities/${id}/roles`, {
      method: 'POST',
      body: input,
      token,
    }),

  updateRole: (
    token: string,
    id: Uuid,
    roleId: Uuid,
    input: { name?: string; color?: string; position?: number; permissions?: string[] },
  ) =>
    request<RoleWithPermissions>(`/api/v1/communities/${id}/roles/${roleId}`, {
      method: 'PATCH',
      body: input,
      token,
    }),

  assignRole: (token: string, id: Uuid, userId: Uuid, roleId: Uuid) =>
    request<void>(`/api/v1/communities/${id}/members/${userId}/roles`, {
      method: 'POST',
      body: { role_id: roleId },
      token,
    }),
}

// ── rooms ─────────────────────────────────────────────────────────────────

export const rooms = {
  discovery: (token: string, category?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<DiscoveryResponse>(`/api/v1/rooms/discovery${query}`, { token })
  },

  trending: (token: string) =>
    request<Room[]>('/api/v1/rooms/trending', { token }),

  live: (token: string) =>
    request<Room[]>('/api/v1/rooms/live', { token }),

  random: (token: string, category?: string, room_type?: RoomType) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (room_type) params.set('room_type', room_type)
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<Room | null>(`/api/v1/rooms/random${query}`, { token })
  },

  list: (token: string, communityId: Uuid) =>
    request<Room[]>(`/api/v1/communities/${communityId}/rooms`, { token }),

  get: (token: string, id: Uuid) =>
    request<RoomWithPermissions>(`/api/v1/rooms/${id}`, { token }),

  mine: (token: string) =>
    request<UserRoom[]>('/api/v1/rooms/mine', { token }),

  createStandalone: (
    token: string,
    input: {
      name: string
      room_type: RoomType
      topic?: string
      category?: string
      visibility?: RoomVisibility
      is_anonymous?: boolean
      duration_minutes?: number
      max_participants?: number
      participant_ids?: Uuid[]
    },
  ) =>
    request<Room>('/api/v1/rooms', {
      method: 'POST',
      body: input,
      token,
    }),

  create: (
    token: string,
    communityId: Uuid,
    input: {
      name: string
      room_type: RoomType
      topic?: string
      category?: string
      visibility?: RoomVisibility
      is_anonymous?: boolean
      duration_minutes?: number
      position?: number
      max_participants?: number
    },
  ) =>
    request<Room>(`/api/v1/communities/${communityId}/rooms`, {
      method: 'POST',
      body: input,
      token,
    }),

  join: (token: string, id: Uuid) =>
    request<RoomWithPermissions>(`/api/v1/rooms/${id}/join`, {
      method: 'POST',
      body: {},
      token,
    }),

  leave: (token: string, id: Uuid) =>
    request<void>(`/api/v1/rooms/${id}/leave`, {
      method: 'POST',
      body: {},
      token,
    }),

  participants: (token: string, id: Uuid) =>
    request<RoomParticipant[]>(`/api/v1/rooms/${id}/participants`, { token }),

  setPersona: (token: string, id: Uuid, is_anonymous: boolean) =>
    request<RoomParticipant>(`/api/v1/rooms/${id}/persona`, {
      method: 'PATCH',
      body: { is_anonymous },
      token,
    }),

  update: (
    token: string,
    id: Uuid,
    input: {
      name?: string
      topic?: string
      category?: string
      visibility?: RoomVisibility
      status?: RoomStatus
      position?: number
      max_participants?: number
    },
  ) =>
    request<Room>(`/api/v1/rooms/${id}`, {
      method: 'PATCH',
      body: input,
      token,
    }),

  delete: (token: string, id: Uuid) =>
    request<void>(`/api/v1/rooms/${id}`, {
      method: 'DELETE',
      token,
    }),

  openDM: (token: string, targetUserId: Uuid) =>
    request<Room>(`/api/v1/rooms/dm/${targetUserId}`, {
      method: 'POST',
      token,
    }),
}

// ── messages ──────────────────────────────────────────────────────────────

export const messages = {
  /**
   * One page of a room's messages, newest first.
   *
   * The cursor is both halves of the previous page's `next_before` /
   * `next_before_id`. Sending only the timestamp still works, but can skip
   * messages that share one.
   */
  history: (token: string, roomId: Uuid, before?: string, beforeId?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.set('before', before)
    if (beforeId) params.set('before_id', beforeId)
    return request<MessagePage>(`/api/v1/rooms/${roomId}/messages?${params}`, { token })
  },

  post: (token: string, roomId: Uuid, content: string, is_anonymous?: boolean) =>
    request<Message>(`/api/v1/rooms/${roomId}/messages`, {
      method: 'POST',
      body: { content, is_anonymous },
      token,
    }),

  edit: (token: string, messageId: Uuid, content: string) =>
    request<Message>(`/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      body: { content },
      token,
    }),

  remove: (token: string, messageId: Uuid) =>
    request<void>(`/api/v1/messages/${messageId}`, { method: 'DELETE', token }),

  // Both reaction calls return the message's *whole* new tally rather than a
  // delta, so the client never has to reconstruct a count it can be told.
  react: (token: string, messageId: Uuid, reaction: string) =>
    request<ReactionSummary[]>(`/api/v1/messages/${messageId}/reactions`, {
      method: 'PUT',
      body: { reaction },
      token,
    }),

  unreact: (token: string, messageId: Uuid, reaction: string) =>
    request<ReactionSummary[]>(`/api/v1/messages/${messageId}/reactions`, {
      method: 'DELETE',
      body: { reaction },
      token,
    }),
}

// ── social ────────────────────────────────────────────────────────────────

export const friends = {
  /** Accepted friends, as ids. Resolve them through `useProfiles`. */
  list: (token: string) => request<Uuid[]>('/api/v1/friends', { token }),

  /** Requests awaiting this user's answer. */
  pending: (token: string) =>
    request<Friendship[]>('/api/v1/friends/requests', { token }),

  /** Requests this user has sent that nobody has answered yet. */
  sent: (token: string) =>
    request<Friendship[]>('/api/v1/friends/sent', { token }),

  request: (token: string, userId: Uuid) =>
    request<Friendship>('/api/v1/friends', {
      method: 'POST',
      body: { user_id: userId },
      token,
    }),

  respond: (token: string, requesterId: Uuid, accept: boolean) =>
    request<Friendship>(`/api/v1/friends/${requesterId}/respond`, {
      method: 'POST',
      body: { accept },
      token,
    }),

  remove: (token: string, userId: Uuid) =>
    request<void>(`/api/v1/friends/${userId}`, { method: 'DELETE', token }),
}

// ── notifications ─────────────────────────────────────────────────────────

export const notifications = {
  list: (token: string, before?: Timestamp, limit?: number) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<NotificationPage>(`/api/v1/notifications${query}`, { token })
  },

  markRead: (token: string, id: Uuid) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: 'POST', token }),

  markAllRead: (token: string) =>
    request<void>('/api/v1/notifications/read', { method: 'POST', token }),
}

// ── presence ──────────────────────────────────────────────────────────────

export const presence = {
  /**
   * Who, of `ids`, is online right now.
   *
   * Omitting `ids` returns everyone connected — what the friends list wants,
   * since it has no id list of its own until the friendships have loaded.
   */
  online: (token: string, ids?: Uuid[]) => {
    const query = ids && ids.length > 0 ? `?ids=${ids.join(',')}` : ''
    return request<{ online: Uuid[] }>(`/api/v1/presence${query}`, { token })
  },
}

export const blocks = {
  list: (token: string) => request<Uuid[]>('/api/v1/blocks', { token }),

  block: (token: string, userId: Uuid) =>
    request<void>(`/api/v1/blocks/${userId}`, { method: 'PUT', token }),

  unblock: (token: string, userId: Uuid) =>
    request<void>(`/api/v1/blocks/${userId}`, { method: 'DELETE', token }),
}

// ── media ─────────────────────────────────────────────────────────────────

export const media = {
  join: (token: string, roomId: Uuid) =>
    request<MediaJoinResponse>(`/api/v1/rooms/${roomId}/media/join`, {
      method: 'POST',
      token,
    }),

  leave: (token: string, roomId: Uuid) =>
    request<void>(`/api/v1/rooms/${roomId}/media/leave`, { method: 'POST', token }),
}
