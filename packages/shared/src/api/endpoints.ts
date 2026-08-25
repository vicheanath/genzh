import { request } from './client'
import type {
  AdminStats,
  AuditEntry,
  AuthConfig,
  AuthResponse,
  CallEndReason,
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CommunityTemplate,
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
  MeOverviewResponse,
  CommunityOverviewResponse,
  RoomSessionResponse,
  SocialOverviewResponse,
  TokenPair,
  NotificationPage,
  OpenTicketInput,
  PlatformRole,
  StaffUserView,
  SupportMessage,
  SupportQueue,
  SupportTicket,
  SupportTicketDetail,
  TicketStatus,
  Timestamp,
  UpdateProfileInput,
  UserRoom,
  Uuid,
} from './types'

/**
 * The API surface, one function per endpoint.
 *
 * Each takes the access token as its first argument rather than reading it from
 * a module global: that keeps these pure and testable, and makes it impossible
 * to fire a request with a stale token captured in a closure.
 *
 * Passing `null` is the other half of that contract, and it means "no token in
 * hand — use the ambient one". The request interceptor then resolves it through
 * the provider registered by `setTokenProvider`, which is where refresh already
 * lives. Callers that hold a token (mobile) keep passing it; callers running
 * under a provider (web) pass `null` and stop threading a session through every
 * signature. Either way the token is never read from a global at call time.
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

  me: (token: string | null) => request<CurrentUser>('/api/v1/me', { token }),

  updateProfile: (token: string | null, input: UpdateProfileInput) =>
    request<Profile>('/api/v1/me', { method: 'PATCH', body: input, token }),

  /**
   * The whole app shell in one call: the account, its communities and rooms,
   * friends, presence, unread counts and the auth config.
   *
   * The server composes it, so booting costs one round-trip instead of seven.
   */
  overview: (token: string | null) => request<MeOverviewResponse>('/api/v1/me/overview', { token }),
}

// ── users ─────────────────────────────────────────────────────────────────

export const users = {
  get: (token: string | null, userId: Uuid) =>
    request<PublicProfile>(`/api/v1/users/${userId}`, { token }),
}

// ── communities ───────────────────────────────────────────────────────────

export const communities = {
  list: (token: string | null) => request<Community[]>('/api/v1/communities', { token }),

  get: (token: string | null, id: Uuid) =>
    request<CommunityWithPermissions>(`/api/v1/communities/${id}`, { token }),

  /**
   * The shapes a community can be created from.
   *
   * A static catalogue, so it is cached hard on the client — but it is fetched
   * rather than hard-coded, because the server is what actually builds the
   * channels and roles each one promises.
   */
  templates: (token: string | null) =>
    request<CommunityTemplate[]>('/api/v1/communities/templates', { token }),

  create: (
    token: string | null,
    input: {
      name: string
      description?: string
      icon_url?: string
      /** A key from `communities.templates`. Omitted means the default shape. */
      template?: string
    },
  ) =>
    request<CommunityWithPermissions>('/api/v1/communities', {
      method: 'POST',
      body: input,
      token,
    }),

  join: (token: string | null, id: Uuid) =>
    request<CommunityMember>(`/api/v1/communities/${id}/members`, {
      method: 'POST',
      body: {},
      token,
    }),

  members: (token: string | null, id: Uuid, limit = 100) =>
    request<CommunityMember[]>(`/api/v1/communities/${id}/members?limit=${limit}`, { token }),

  update: (
    token: string | null,
    id: Uuid,
    input: { name?: string; description?: string; icon_url?: string },
  ) =>
    request<Community>(`/api/v1/communities/${id}`, {
      method: 'PATCH',
      body: input,
      token,
    }),

  leave: (token: string | null, id: Uuid, userId: Uuid) =>
    request<void>(`/api/v1/communities/${id}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  delete: (token: string | null, id: Uuid) =>
    request<void>(`/api/v1/communities/${id}`, {
      method: 'DELETE',
      token,
    }),

  roles: (token: string | null, id: Uuid) =>
    request<RoleWithPermissions[]>(`/api/v1/communities/${id}/roles`, { token }),

  createRole: (
    token: string | null,
    id: Uuid,
    input: { name: string; color?: string; position?: number; permissions?: string[] },
  ) =>
    request<RoleWithPermissions>(`/api/v1/communities/${id}/roles`, {
      method: 'POST',
      body: input,
      token,
    }),

  updateRole: (
    token: string | null,
    id: Uuid,
    roleId: Uuid,
    input: { name?: string; color?: string; position?: number; permissions?: string[] },
  ) =>
    request<RoleWithPermissions>(`/api/v1/communities/${id}/roles/${roleId}`, {
      method: 'PATCH',
      body: input,
      token,
    }),

  removeRole: (token: string | null, id: Uuid, userId: Uuid, roleId: Uuid) =>
    request<void>(`/api/v1/communities/${id}/members/${userId}/roles/${roleId}`, {
      method: 'DELETE',
      token,
    }),

  assignRole: (token: string | null, id: Uuid, userId: Uuid, roleId: Uuid) =>
    request<void>(`/api/v1/communities/${id}/members/${userId}/roles`, {
      method: 'POST',
      body: { role_id: roleId },
      token,
    }),

  /**
   * The community screen in one call: the community and the caller's
   * permissions, its rooms, its members with their roles, and the role table.
   */
  overview: (token: string | null, id: Uuid) =>
    request<CommunityOverviewResponse>(`/api/v1/communities/${id}/overview`, { token }),

  // ── invite links ──────────────────────────────────────────────────────────
  createInvite: (
    token: string | null,
    communityId: Uuid,
    input: { expires_in_hours?: number; max_uses?: number } = {},
  ) =>
    request<import('./types').Invite>(`/api/v1/communities/${communityId}/invites`, {
      method: 'POST',
      body: input,
      token,
    }),

  listInvites: (token: string | null, communityId: Uuid) =>
    request<import('./types').Invite[]>(`/api/v1/communities/${communityId}/invites`, { token }),

  previewInvite: (token: string | null, code: string) =>
    request<import('./types').InvitePreview>(`/api/v1/invites/${code}`, { token }),

  redeemInvite: (token: string | null, code: string) =>
    request<CommunityWithPermissions>(`/api/v1/invites/${code}`, {
      method: 'POST',
      body: {},
      token,
    }),

  revokeInvite: (token: string | null, code: string) =>
    request<void>(`/api/v1/invites/${code}`, {
      method: 'DELETE',
      token,
    }),
}

// ── rooms ─────────────────────────────────────────────────────────────────

export const rooms = {
  discovery: (token: string | null, category?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<DiscoveryResponse>(`/api/v1/rooms/discovery${query}`, { token })
  },

  trending: (token: string | null) =>
    request<Room[]>('/api/v1/rooms/trending', { token }),

  live: (token: string | null) =>
    request<Room[]>('/api/v1/rooms/live', { token }),

  random: (token: string | null, category?: string, room_type?: RoomType) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (room_type) params.set('room_type', room_type)
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<Room | null>(`/api/v1/rooms/random${query}`, { token })
  },

  list: (token: string | null, communityId: Uuid) =>
    request<Room[]>(`/api/v1/communities/${communityId}/rooms`, { token }),

  get: (token: string | null, id: Uuid) =>
    request<RoomWithPermissions>(`/api/v1/rooms/${id}`, { token }),

  mine: (token: string | null) =>
    request<UserRoom[]>('/api/v1/rooms/mine', { token }),

  createStandalone: (
    token: string | null,
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
    token: string | null,
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

  join: (token: string | null, id: Uuid) =>
    request<RoomWithPermissions>(`/api/v1/rooms/${id}/join`, {
      method: 'POST',
      body: {},
      token,
    }),

  leave: (token: string | null, id: Uuid) =>
    request<void>(`/api/v1/rooms/${id}/leave`, {
      method: 'POST',
      body: {},
      token,
    }),

  participants: (token: string | null, id: Uuid) =>
    request<RoomParticipant[]>(`/api/v1/rooms/${id}/participants`, { token }),

  setPersona: (token: string | null, id: Uuid, is_anonymous: boolean) =>
    request<RoomParticipant>(`/api/v1/rooms/${id}/persona`, {
      method: 'PATCH',
      body: { is_anonymous },
      token,
    }),

  update: (
    token: string | null,
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

  delete: (token: string | null, id: Uuid) =>
    request<void>(`/api/v1/rooms/${id}`, {
      method: 'DELETE',
      token,
    }),

  openDM: (token: string | null, targetUserId: Uuid) =>
    request<Room>(`/api/v1/rooms/dm/${targetUserId}`, {
      method: 'POST',
      token,
    }),

  /**
   * Open a session in the room: metadata, participants, the first page of
   * history, and — for a voice/video/stage room — the SFU token.
   *
   * A POST, not a read: entering a media room mints a credential. Use `get`
   * when you only want to look at the room.
   */
  session: (token: string | null, id: Uuid) =>
    request<RoomSessionResponse>(`/api/v1/rooms/${id}/session`, {
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
  history: (token: string | null, roomId: Uuid, before?: string, beforeId?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.set('before', before)
    if (beforeId) params.set('before_id', beforeId)
    return request<MessagePage>(`/api/v1/rooms/${roomId}/messages?${params}`, { token })
  },

  post: (
    token: string | null,
    roomId: Uuid,
    content: string,
    is_anonymous?: boolean,
    reply_to_id?: Uuid,
  ) =>
    request<Message>(`/api/v1/rooms/${roomId}/messages`, {
      method: 'POST',
      body: { content, is_anonymous, reply_to_id },
      token,
    }),

  edit: (token: string | null, messageId: Uuid, content: string) =>
    request<Message>(`/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      body: { content },
      token,
    }),

  remove: (token: string | null, messageId: Uuid) =>
    request<void>(`/api/v1/messages/${messageId}`, { method: 'DELETE', token }),

  // Both reaction calls return the message's *whole* new tally rather than a
  // delta, so the client never has to reconstruct a count it can be told.
  react: (token: string | null, messageId: Uuid, reaction: string) =>
    request<ReactionSummary[]>(`/api/v1/messages/${messageId}/reactions`, {
      method: 'PUT',
      body: { reaction },
      token,
    }),

  unreact: (token: string | null, messageId: Uuid, reaction: string) =>
    request<ReactionSummary[]>(`/api/v1/messages/${messageId}/reactions`, {
      method: 'DELETE',
      body: { reaction },
      token,
    }),

  // ── pins ──────────────────────────────────────────────────────────────────
  pins: (token: string | null, roomId: Uuid) =>
    request<Message[]>(`/api/v1/rooms/${roomId}/pins`, { token }),

  pin: (token: string | null, messageId: Uuid) =>
    request<void>(`/api/v1/messages/${messageId}/pin`, {
      method: 'PUT',
      token,
    }),

  unpin: (token: string | null, messageId: Uuid) =>
    request<void>(`/api/v1/messages/${messageId}/pin`, {
      method: 'DELETE',
      token,
    }),

  // ── search ────────────────────────────────────────────────────────────────
  search: (
    token: string | null,
    params: { q: string; room_id?: Uuid; limit?: number },
  ) => {
    const query = new URLSearchParams({ q: params.q })
    if (params.room_id) query.set('room_id', params.room_id)
    if (params.limit) query.set('limit', String(params.limit))
    return request<Message[]>(`/api/v1/search/messages?${query.toString()}`, { token })
  },

  // ── read state and muting ─────────────────────────────────────────────────
  unread: (token: string | null) =>
    request<import('./types').RoomUnread[]>('/api/v1/me/unread', { token }),

  markRead: (token: string | null, roomId: Uuid) =>
    request<void>(`/api/v1/rooms/${roomId}/read`, {
      method: 'POST',
      body: {},
      token,
    }),

  setMuted: (token: string | null, roomId: Uuid, muted: boolean) =>
    request<void>(`/api/v1/rooms/${roomId}/mute`, {
      method: 'PUT',
      body: { muted },
      token,
    }),
}

// ── social ────────────────────────────────────────────────────────────────

export const friends = {
  /** Accepted friends, as ids. Resolve them through `useProfiles`. */
  list: (token: string | null) => request<Uuid[]>('/api/v1/friends', { token }),

  /** Requests awaiting this user's answer. */
  pending: (token: string | null) =>
    request<Friendship[]>('/api/v1/friends/requests', { token }),

  /** Requests this user has sent that nobody has answered yet. */
  sent: (token: string | null) =>
    request<Friendship[]>('/api/v1/friends/sent', { token }),

  request: (token: string | null, userId: Uuid) =>
    request<Friendship>('/api/v1/friends', {
      method: 'POST',
      body: { user_id: userId },
      token,
    }),

  respond: (token: string | null, requesterId: Uuid, accept: boolean) =>
    request<Friendship>(`/api/v1/friends/${requesterId}/respond`, {
      method: 'POST',
      body: { accept },
      token,
    }),

  remove: (token: string | null, userId: Uuid) =>
    request<void>(`/api/v1/friends/${userId}`, { method: 'DELETE', token }),
}

// ── notifications ─────────────────────────────────────────────────────────

export const notifications = {
  list: (token: string | null, before?: Timestamp, limit?: number) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<NotificationPage>(`/api/v1/notifications${query}`, { token })
  },

  markRead: (token: string | null, id: Uuid) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: 'POST', token }),

  markAllRead: (token: string | null) =>
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
  online: (token: string | null, ids?: Uuid[]) => {
    const query = ids && ids.length > 0 ? `?ids=${ids.join(',')}` : ''
    return request<{ online: Uuid[] }>(`/api/v1/presence${query}`, { token })
  },
}

export const social = {
  /**
   * The social screen in one call: friends, which of them are online, requests
   * in both directions, and the blocklist — five endpoints' worth.
   */
  overview: (token: string | null) =>
    request<SocialOverviewResponse>('/api/v1/me/social', { token }),
}

export const blocks = {
  list: (token: string | null) => request<Uuid[]>('/api/v1/blocks', { token }),

  block: (token: string | null, userId: Uuid) =>
    request<void>(`/api/v1/blocks/${userId}`, { method: 'PUT', token }),

  unblock: (token: string | null, userId: Uuid) =>
    request<void>(`/api/v1/blocks/${userId}`, { method: 'DELETE', token }),
}

// ── media ─────────────────────────────────────────────────────────────────

export const media = {
  join: (token: string | null, roomId: Uuid) =>
    request<MediaJoinResponse>(`/api/v1/rooms/${roomId}/media/join`, {
      method: 'POST',
      token,
    }),

  leave: (token: string | null, roomId: Uuid) =>
    request<void>(`/api/v1/rooms/${roomId}/media/leave`, { method: 'POST', token }),

  /**
   * Ring the other person in a direct conversation.
   *
   * A notice, not a handshake: the caller has already joined the room's media
   * session by the time this fires, and the callee accepts by joining the same
   * one. Nothing here mints a token, so a ring that goes unheard costs the call
   * nothing — whoever opens the conversation still walks into it.
   */
  ring: (token: string | null, roomId: Uuid, video: boolean) =>
    request<void>(`/api/v1/rooms/${roomId}/call/ring`, {
      method: 'POST',
      body: { video },
      token,
    }),

  /** Stop a call that has not connected — a hang-up before the answer, or a decline. */
  endCall: (token: string | null, roomId: Uuid, reason: CallEndReason) =>
    request<void>(`/api/v1/rooms/${roomId}/call/end`, {
      method: 'POST',
      body: { reason },
      token,
    }),
}

// ── support, as the person who raised it sees it ──────────────────────────

export const support = {
  /**
   * Raise a report or ask for help.
   *
   * Open to any signed-in account, including one that has been reported: the
   * queue is where abuse is judged, and refusing input from somebody already
   * accused would be judging it at the door.
   */
  open: (token: string | null, input: OpenTicketInput) =>
    request<SupportTicket>('/api/v1/support/tickets', {
      method: 'POST',
      body: input,
      token,
    }),

  /** The caller's own tickets. */
  mine: (token: string | null) =>
    request<SupportTicket[]>('/api/v1/support/tickets', { token }),

  /**
   * One of the caller's tickets, with its thread.
   *
   * The thread comes back without staff notes even when the caller *is* staff:
   * this is the reporter's view of their own ticket.
   */
  get: (token: string | null, id: Uuid) =>
    request<SupportTicketDetail>(`/api/v1/support/tickets/${id}`, { token }),

  reply: (token: string | null, id: Uuid, body: string) =>
    request<SupportMessage>(`/api/v1/support/tickets/${id}/messages`, {
      method: 'POST',
      body: { body },
      token,
    }),
}

// ── the platform console ──────────────────────────────────────────────────

/**
 * Staff-only. Every one of these 404s for an account without a platform role,
 * rather than 403 — the console's existence is not something an ordinary
 * account needs confirmed by probing it.
 */
export const admin = {
  /** Platform overview stats. */
  stats: (token: string | null) => request<AdminStats>('/api/v1/admin/stats', { token }),

  /** The audit log, newest first. Admin only. */
  audit: (
    token: string | null,
    params: {
      actor_id?: Uuid
      action?: string
      subject_id?: Uuid
      before?: Timestamp
      limit?: number
    } = {},
  ) => request<AuditEntry[]>('/api/v1/admin/audit', { token, params }),

  /** The actions the server actually writes, for the filter list. */
  auditActions: (token: string | null) =>
    request<string[]>('/api/v1/admin/audit/actions', { token }),

  /** Search accounts by handle or e-mail. Never a full listing. */
  searchUsers: (token: string | null, q: string, limit?: number) =>
    request<StaffUserView[]>('/api/v1/admin/users', { token, params: { q, limit } }),

  getUser: (token: string | null, id: Uuid) =>
    request<StaffUserView>(`/api/v1/admin/users/${id}`, { token }),

  /** Everyone with platform authority. Admin only. */
  listStaff: (token: string | null) =>
    request<StaffUserView[]>('/api/v1/admin/staff', { token }),

  suspendUser: (token: string | null, id: Uuid, reason: string) =>
    request<StaffUserView>(`/api/v1/admin/users/${id}/suspend`, {
      method: 'POST',
      body: { reason },
      token,
    }),

  reinstateUser: (token: string | null, id: Uuid) =>
    request<StaffUserView>(`/api/v1/admin/users/${id}/reinstate`, {
      method: 'POST',
      body: {},
      token,
    }),

  setPlatformRole: (token: string | null, id: Uuid, role: PlatformRole) =>
    request<StaffUserView>(`/api/v1/admin/users/${id}/platform-role`, {
      method: 'PUT',
      body: { role },
      token,
    }),

  /** The support queue. */
  tickets: (
    token: string | null,
    params: { status?: TicketStatus; kind?: string; assignee_id?: Uuid; limit?: number } = {},
  ) => request<SupportQueue>('/api/v1/admin/tickets', { token, params }),

  /** One ticket and its thread, staff notes included. */
  ticket: (token: string | null, id: Uuid) =>
    request<SupportTicketDetail>(`/api/v1/admin/tickets/${id}`, { token }),

  replyToTicket: (token: string | null, id: Uuid, body: string, staffOnly = false) =>
    request<SupportMessage>(`/api/v1/admin/tickets/${id}/messages`, {
      method: 'POST',
      body: { body, staff_only: staffOnly },
      token,
    }),

  /** `assignee_id: null` unassigns; omitting it leaves the assignee alone. */
  updateTicket: (
    token: string | null,
    id: Uuid,
    patch: { status?: TicketStatus; assignee_id?: Uuid | null },
  ) =>
    request<SupportTicket>(`/api/v1/admin/tickets/${id}`, {
      method: 'PATCH',
      body: patch,
      token,
    }),
}
