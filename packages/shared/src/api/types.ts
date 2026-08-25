/**
 * Wire types, mirroring the Rust DTOs in `apps/api/src/routes`.
 */

export type Uuid = string
/** RFC 3339, always UTC. */
export type Timestamp = string

export type RoomType =
  | 'text'
  | 'voice'
  | 'video'
  | 'activity'
  | 'stage'
  | 'poll'
  | 'debate'
  | 'game'
  | 'confession'
  | 'quick_chat'

export type RoomStatus = 'created' | 'waiting' | 'active' | 'ending' | 'ended'
export type RoomVisibility = 'public' | 'unlisted' | 'friends_only' | 'private'
export type RoomParticipantRole = 'owner' | 'moderator' | 'participant' | 'observer'

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
  /**
   * Authority above any one community, so a client knows whether to offer the
   * console at all. `user` for almost everybody.
   *
   * Optional because an older server does not send it — treat a missing value
   * as `user`, never as staff.
   */
  platform_role?: PlatformRole
}

export interface PublicProfile {
  id: Uuid
  handle: string
  display_name: string
  bio?: string | null
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

/** A channel a community template creates. */
export interface TemplateRoom {
  name: string
  topic: string | null
  room_type: RoomType
  position: number
}

/** A role a community template adds on top of the ones every community gets. */
export interface TemplateRole {
  name: string
  color: string | null
  permissions: Permission[]
}

/**
 * A starting shape for a community: its channels and its roles.
 *
 * Served by the API rather than declared per client. The server is what builds
 * these, so a client holding its own copy could offer a template that no longer
 * exists, or promise channels it does not create.
 */
export interface CommunityTemplate {
  key: string
  name: string
  icon: string
  description: string
  /** Prefilled into the create form. Empty for the blank template. */
  suggested_name: string
  suggested_description: string
  rooms: TemplateRoom[]
  extra_roles: TemplateRole[]
}

export interface CommunityMember {
  community_id: Uuid
  user_id: Uuid
  nickname: string | null
  joined_at: Timestamp
  /**
   * Roles explicitly assigned to this member, highest position first.
   *
   * `@everyone` is not in here: every member holds it, so a badge for it would
   * appear against all of them and distinguish nobody.
   */
  roles: Role[]
}

export interface RoomAnonymousIdentity {
  room_id: Uuid
  user_id: Uuid
  alias_name: string
  avatar_seed: string
  accent_color: string
  created_at: Timestamp
}

export interface RoomParticipant {
  room_id: Uuid
  user_id: Uuid
  role: RoomParticipantRole
  is_muted: boolean
  is_anonymous: boolean
  joined_at: Timestamp
  last_seen_at: Timestamp
}

export interface Room {
  id: Uuid
  community_id: Uuid | null
  owner_id?: Uuid | null
  name: string
  topic: string | null
  category: string
  room_type: RoomType
  visibility: RoomVisibility
  status: RoomStatus
  is_anonymous: boolean
  position: number
  max_participants: number | null
  current_participants: number
  started_at?: Timestamp | null
  expires_at?: Timestamp | null
  ended_at?: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface RoomWithPermissions extends Room {
  your_permissions: Permission[]
  anonymous_identity?: RoomAnonymousIdentity | null
}

/**
 * A room from the caller's own list.
 *
 * `dm_peer_id` is who a direct conversation is *with*, resolved per caller. The
 * stored `name` cannot answer that: it is fixed to whoever opened the DM, so it
 * names the wrong person for the other half of every conversation.
 */
export interface UserRoom extends Room {
  dm_peer_id?: Uuid | null
}

// ── notifications ─────────────────────────────────────────────────────────

export type NotificationKind =
  | 'mention'
  | 'everyone'
  | 'direct_message'
  | 'friend_request'
  | 'friend_accepted'

export interface AppNotification {
  id: Uuid
  user_id: Uuid
  kind: NotificationKind
  /** Absent when the cause was anonymous, or the actor has been deleted. */
  actor_id: Uuid | null
  room_id: Uuid | null
  message_id: Uuid | null
  preview: string | null
  read_at: Timestamp | null
  created_at: Timestamp
}

export interface NotificationPage {
  notifications: AppNotification[]
  next_before?: Timestamp
  unread: number
}

export interface DiscoveryResponse {
  trending: Room[]
  live_now: Room[]
  categories: string[]
  rooms: Room[]
}

/** Reaction counts on one message, as the calling user sees them. */
export interface ReactionSummary {
  reaction: string
  count: number
  /** Whether the calling user is one of the reactors. */
  me: boolean
}

export interface Message {
  id: Uuid
  room_id: Uuid
  author_id: Uuid
  content: string
  is_anonymous?: boolean
  reply_to_id?: Uuid | null
  edited_at: Timestamp | null
  created_at: Timestamp
  reactions: ReactionSummary[]
  anonymous_author?: RoomAnonymousIdentity | null
}

export interface RoomUnread {
  room_id: Uuid
  unread: number
  muted: boolean
  last_read_at: Timestamp | null
}

export interface Invite {
  code: string
  community_id: Uuid
  created_by: Uuid | null
  expires_at: Timestamp | null
  max_uses: number | null
  uses: number
  revoked_at: Timestamp | null
  created_at: Timestamp
}

export interface InvitePreview {
  code: string
  community_id: Uuid
  name: string
  description: string | null
  icon_url: string | null
  member_count: number
  expires_at: Timestamp | null
  max_uses: number | null
  uses: number
}

export interface CreateInviteInput {
  expires_in_hours?: number
  max_uses?: number
}

export interface MessageSearchParams {
  q: string
  room_id?: Uuid
  limit?: number
}

export interface MessagePage {
  messages: Message[]
  /** Cursor for the next (older) page. Null at the start of the room. */
  next_before: Timestamp | null
  /** Tie-breaker for that cursor; send both or paging can skip messages. */
  next_before_id?: Uuid
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined'

export interface Friendship {
  requester_id: Uuid
  addressee_id: Uuid
  status: FriendshipStatus
  created_at: Timestamp
  updated_at: Timestamp
}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  avatar_url?: string
  avatar_effect?: string
  accent_color?: string
}

export interface Role {
  id: Uuid
  community_id: Uuid
  name: string
  color: string | null
  position: number
  is_default: boolean
  created_at: Timestamp
}

export interface Role {
  id: Uuid
  community_id: Uuid
  name: string
  color: string | null
  position: number
  is_default: boolean
  created_at: Timestamp
}

export interface RoleWithPermissions extends Role {
  /**
   * What the role grants, as permission keys.
   *
   * The same vocabulary `your_permissions` uses and the same the create/update
   * bodies take, so a role can be read, edited and sent back unchanged.
   */
  permissions: Permission[]
}

export interface CreateRoleInput {
  name: string
  color?: string
  position?: number
  permissions?: Permission[]
}

export interface MediaJoinResponse {
  room_id: Uuid
  participant_id: string
  media_url: string
  token: string
  expires_at: Timestamp
  ice_servers: Array<{ urls: string | string[]; username?: string; credential?: string }>
}

/**
 * Why a call that never connected stopped.
 *
 * Three reasons rather than one flag, because each says something different to
 * the person left holding the phone: a call that was declined was seen, one
 * that was cancelled was not, and one that ended was the caller's choice.
 */
export type CallEndReason = 'cancelled' | 'declined' | 'ended'

export interface AuthConfig {
  app_env: string
  allow_password_signup: boolean
  oauth_providers: {
    google: boolean
    discord: boolean
  }
}

// ── Composite view payloads ───────────────────────────────────────────────
//
// One response per *screen* rather than per table. The server composes these
// (its BFF layer) so a screen costs one round-trip instead of a waterfall.

/** `GET /api/v1/me/overview` — everything the app shell renders at boot. */
export interface MeOverviewResponse {
  me: CurrentUser
  communities: Community[]
  rooms: UserRoom[]
  friends: Uuid[]
  online_friends: Uuid[]
  pending_requests_count: number
  unread_notifications: number
  config: AuthConfig
}

/** `GET /api/v1/communities/{id}/overview` — a whole community screen. */
export interface CommunityOverviewResponse {
  community: CommunityWithPermissions
  rooms: Room[]
  members: CommunityMember[]
  roles: RoleWithPermissions[]
}

/** `POST /api/v1/rooms/{id}/session` — an opened room, media token included. */
export interface RoomSessionResponse {
  room: RoomWithPermissions
  participants: RoomParticipant[]
  recent_messages: MessagePage
  media_session: MediaJoinResponse | null
}

/** `GET /api/v1/me/social` — the caller's social graph in one payload. */
export interface SocialOverviewResponse {
  friends: Uuid[]
  online_friends: Uuid[]
  incoming_requests: Friendship[]
  outgoing_requests: Friendship[]
  blocked: Uuid[]
}



// ── platform staff, support and the audit log ────────────────────────────

/**
 * Authority above any one community.
 *
 * `Permission` answers "what may this member do *here*" and is scoped to the
 * community that granted it. This is the tier above that: who may answer a
 * support ticket, and who may suspend an account across the whole platform.
 */
export type PlatformRole = 'user' | 'support' | 'admin'

/** An account as staff see it. Deliberately no credentials of any kind. */
export interface StaffUserView {
  id: Uuid
  handle: string
  email: string
  display_name: string | null
  is_active: boolean
  platform_role: PlatformRole
  suspended_at: Timestamp | null
  suspension_reason: string | null
  created_at: Timestamp
}

/** One entry in the audit log. */
export interface AuditEntry {
  id: Uuid
  /** Null once the actor's account is deleted — the entry outlives them. */
  actor_id: Uuid | null
  /** Denormalised, so the entry still names somebody after that deletion. */
  actor_handle: string | null
  action: string
  subject_type: string | null
  subject_id: Uuid | null
  summary: string
  metadata: Record<string, unknown>
  created_at: Timestamp
}

export type TicketKind = 'report' | 'help'
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'
export type TicketSubjectType = 'message' | 'user' | 'room' | 'community'

export interface SupportTicket {
  id: Uuid
  kind: TicketKind
  reporter_id: Uuid
  subject_type: TicketSubjectType | null
  subject_id: Uuid | null
  category: string
  subject: string
  details: string
  status: TicketStatus
  assignee_id: Uuid | null
  created_at: Timestamp
  updated_at: Timestamp
  resolved_at: Timestamp | null
}

export interface SupportMessage {
  id: Uuid
  ticket_id: Uuid
  /** Null for anything the system wrote. */
  author_id: Uuid | null
  body: string
  /**
   * An internal note. Only ever true on a staff read — the server strips these
   * from the reporter's view of their own ticket.
   */
  staff_only: boolean
  created_at: Timestamp
}

export interface SupportTicketDetail {
  ticket: SupportTicket
  messages: SupportMessage[]
}

export interface SupportQueue {
  tickets: SupportTicket[]
  /** Every waiting ticket, not just the page returned — it drives the badge. */
  open_count: number
}

/** System overview statistics for the admin dashboard. */
export interface AdminStats {
  total_users: number
  active_users: number
  suspended_users: number
  staff_users: number
  open_tickets: number
  resolved_tickets: number
  total_communities: number
  total_rooms: number
  total_audit_entries: number
}

/** What somebody raising a report or asking for help supplies. */
export interface OpenTicketInput {
  kind: TicketKind
  subject_type?: TicketSubjectType
  subject_id?: Uuid
  category: string
  subject: string
  details: string
}

export interface AdminCommunityView {
  id: Uuid
  name: String
  description: string | null
  owner_id: Uuid
  owner_handle: string | null
  member_count: number
  room_count: number
  is_quarantined: boolean
  quarantined_at: Timestamp | null
  quarantine_reason: string | null
  created_at: Timestamp
}

export interface SystemBroadcast {
  id: Uuid
  title: string
  message: string
  level: 'info' | 'warning' | 'danger' | string
  is_active: boolean
  created_by: Uuid | null
  created_at: Timestamp
  expires_at: Timestamp | null
}

export interface NewBroadcastInput {
  title: string
  message: string
  level?: string
  expires_at?: Timestamp
}

export interface LiveMediaSessionView {
  room_id: Uuid
  room_name: string
  room_type: string
  community_name: string | null
  participant_count: number
  status: string
  started_at: Timestamp | null
}

