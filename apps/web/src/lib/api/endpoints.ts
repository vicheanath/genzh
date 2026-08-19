import { request } from './client'
import type {
  AuthResponse,
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CurrentUser,
  MediaJoinResponse,
  MessagePage,
  Message,
  PublicProfile,
  Room,
  RoomType,
  RoomWithPermissions,
  TokenPair,
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

  create: (token: string, input: { name: string; description?: string }) =>
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

  members: (token: string, id: Uuid) =>
    request<CommunityMember[]>(`/api/v1/communities/${id}/members`, { token }),
}

// ── rooms ─────────────────────────────────────────────────────────────────

export const rooms = {
  list: (token: string, communityId: Uuid) =>
    request<Room[]>(`/api/v1/communities/${communityId}/rooms`, { token }),

  get: (token: string, id: Uuid) =>
    request<RoomWithPermissions>(`/api/v1/rooms/${id}`, { token }),

  create: (
    token: string,
    communityId: Uuid,
    input: { name: string; room_type: RoomType; topic?: string },
  ) =>
    request<Room>(`/api/v1/communities/${communityId}/rooms`, {
      method: 'POST',
      body: input,
      token,
    }),
}

// ── messages ──────────────────────────────────────────────────────────────

export const messages = {
  history: (token: string, roomId: Uuid, before?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.set('before', before)
    return request<MessagePage>(`/api/v1/rooms/${roomId}/messages?${params}`, { token })
  },

  post: (token: string, roomId: Uuid, content: string) =>
    request<Message>(`/api/v1/rooms/${roomId}/messages`, {
      method: 'POST',
      body: { content },
      token,
    }),
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
