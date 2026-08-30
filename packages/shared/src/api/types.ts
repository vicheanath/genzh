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
  /** The latest message this row stands for. */
  message_id: Uuid | null
  /** The latest excerpt, not the first. */
  preview: string | null
  /**
   * How many events this row stands for.
   *
   * One row covers everything one person said in one room since you last
   * looked, so this is 3 when they sent three messages — not three rows.
   */
  count: number
  read_at: Timestamp | null
  /** When the first of these events happened. */
  created_at: Timestamp
  /** When the last of them did. What the list is ordered by. */
  updated_at: Timestamp
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
/**
 * One page of a console list, and the cursor for the next.
 *
 * The cursor has two halves because every one of these lists is ordered by
 * `(created_at, id)` and the cursor has to match that exactly. A cursor of the
 * timestamp alone cannot: entries written by one bulk action all carry the
 * identical `now()`, so a page boundary landing inside that group would skip
 * the rest of it. Send both halves back, or neither.
 *
 * `next_cursor === null` means there is no further page.
 */
export interface Page<T> {
  items: T[]
  next_cursor: Timestamp | null
  next_cursor_id: Uuid | null
}

/** Cursor parameters for requesting the page after a {@link Page}. */
export interface PageCursor {
  before?: Timestamp
  before_id?: Uuid
}

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

export interface SupportQueue extends Page<SupportTicket> {
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

export interface SystemSetting {
  key: string
  value: unknown
  updated_at: Timestamp
  updated_by: Uuid | null
}

export interface IpBan {
  id: Uuid
  ip_or_cidr: string
  reason: string
  banned_by: Uuid | null
  created_at: Timestamp
  expires_at: Timestamp | null
}

export interface BlockedEmailDomain {
  domain: string
  reason: string | null
  created_by: Uuid | null
  created_at: Timestamp
}

export interface AutomodRule {
  id: Uuid
  name: string
  pattern: string
  is_regex: boolean
  action: 'block' | 'flag_report' | string
  is_active: boolean
  created_by: Uuid | null
  created_at: Timestamp
}

export interface NewAutomodRuleInput {
  name: string
  pattern: string
  is_regex?: boolean
  action?: string
}

export interface SystemHealthTelemetry {
  database_status: string
  pool_size: number
  pool_idle_connections: number
  uptime_seconds: number
  server_timestamp: Timestamp
}


/** One background job, as the console renders it. */
export interface JobReport {
  /** Registered name, e.g. `rooms.prune_stale_participants`. */
  name: string
  /** Executions since this process started — the counters reset on restart. */
  total_runs: number
  successes: number
  failures: number
  last_run_at: Timestamp | null
  last_duration_ms: number | null
  last_error: string | null
  /**
   * Whether the *most recent* run succeeded — not "has never failed". A job
   * that failed once overnight and has been fine since is not an alert.
   */
  healthy: boolean
}

/** What a bulk enforcement pass did to one account. */
export interface BulkOutcome {
  user_id: Uuid
  /** `null` when the account could not be read at all. */
  handle: string | null
  succeeded: boolean
  error: string | null
}

/**
 * The result of a bulk pass.
 *
 * Per-account rather than all-or-nothing: a selection of forty accounts will
 * contain one that cannot be acted on, and failing the batch would leave all
 * forty untouched.
 */
export interface BulkReport {
  succeeded: number
  failed: number
  outcomes: BulkOutcome[]
}

/** Which console list a `console_changed` socket signal refers to. */
export type ConsoleTopic =
  | 'support_queue'
  | 'live_media'
  | 'broadcasts'
  | 'users'
  | 'audit_log'

// ── recommendations ───────────────────────────────────────────────────────

/** Why something was recommended. */
export type ReasonKind =
  | 'shared_community'
  | 'friend_activity'
  | 'mutual_friends'
  | 'category_affinity'
  | 'activity'
  | 'popularity'
  | 'freshness'

/**
 * One contribution to a recommendation's score.
 *
 * `detail` is a ready-made sentence fragment from the server, so the client
 * does not have to reimplement pluralisation and phrasing for seven kinds.
 * `magnitude` is the underlying count, for a client that wants to render it
 * differently.
 */
export interface Reason {
  kind: ReasonKind
  magnitude: number
  contribution: number
  detail: string
}

/** A recommended room, with the room's own fields flattened in. */
export type RoomRecommendation = Room & {
  score: number
  reasons: Reason[]
}

export interface PersonRecommendation {
  user_id: Uuid
  handle: string
  display_name: string | null
  avatar_url: string | null
  score: number
  reasons: Reason[]
}

export interface CommunityRecommendation {
  community_id: Uuid
  name: string
  description: string | null
  icon_url: string | null
  member_count: number
  score: number
  reasons: Reason[]
}

/** A ranked list, plus whether it was personalised at all. */
export interface Recommendations<T> {
  items: T[]
  /**
   * False when the viewer has no friends, communities or history, so the list
   * is ranked on popularity alone. Say "popular right now" rather than "for
   * you" — the difference between a feed that reads as generic and one that
   * reads as broken.
   */
  personalized: boolean
}

/** What the recommendation engine has to work with, platform-wide. */
export interface RecommendationCoverage {
  cold_accounts: number
  total_accounts: number
  /**
   * Rooms that could be recommended to anybody. When this is small, a thin feed
   * is a content problem rather than a ranking one.
   */
  eligible_rooms: number
  eligible_communities: number
  cached_entries: number
}

/** One account's feed, with the signals behind it. Admin only. */
export interface RecommendationExplain {
  user_id: Uuid
  surface: string
  personalized: boolean
  friends: number
  communities: number
  known_rooms: number
  /** Shape depends on `surface`; each entry carries `score` and `reasons`. */
  items: Array<Record<string, unknown>>
}

// ── points, referrals & the cosmetics store ────────────────────────────────

/**
 * Where on a profile an item is worn. One item per slot.
 *
 * They compose rather than compete: a name colour and a name font are worn
 * together, and so are a frame and an avatar effect.
 */
export type ItemType =
  | 'frame'
  | 'badge'
  | 'banner'
  | 'name_color'
  /** The typeface the display name is set in. */
  | 'name_font'
  /** A short tag beside the name — "Certified Yapper", "Night Owl". */
  | 'title'
  /** Particles or an aura over the avatar, worn alongside a frame. */
  | 'avatar_effect'
  /** A tint on the messages this person sends. */
  | 'chat_bubble'

/** Presentation only — rarity gates nothing. */
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'

/**
 * One item in the cosmetics catalog.
 *
 * Everything here is created by staff in the platform console, prices
 * included. There is no seeded catalog, so an empty store is a real state the
 * UI has to render rather than an error.
 */
export interface StoreItem {
  id: Uuid
  sku: string
  name: string
  description: string
  item_type: ItemType
  rarity: ItemRarity
  price_points: number
  /** SVG / animated WebP. Null for items drawn entirely from `style_config`. */
  asset_url: string | null
  /** Gradients, glow colours and animation keys the client renders directly. */
  style_config: CosmeticStyle
  is_active: boolean
  is_limited: boolean
  /** Null is unlimited. */
  stock_limit: number | null
  sort_order: number
  created_by: Uuid | null
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * The free-form render hints on an item.
 *
 * Staff type this as JSON in the console, so every field is optional and the
 * renderer falls back rather than throwing on a key nobody filled in.
 */
export interface CosmeticStyle {
  /** CSS gradient or colour, for name colours, frames and bubbles. */
  gradient?: string
  /** Flat colour, when a gradient would be too much. */
  color?: string
  /** Glow colour behind a badge, frame or name. */
  glow?: string
  /**
   * Named animation the client knows how to play.
   *
   * `pulse` · `spin` · `aurora` · `shimmer` · `float` · `flicker`. A key the
   * client does not know is ignored, so an item never animates by accident.
   */
  animation?: string
  /** Emoji or icon key drawn when there is no `asset_url`. */
  icon?: string
  /** Background for a banner or chat bubble, when no image is set. */
  background?: string
  /** Shadow behind a painted name. */
  textShadow?: string

  // ── name_font ──
  /** The font stack, e.g. `'Orbitron', sans-serif`. Must name a loaded family. */
  fontFamily?: string
  fontWeight?: string | number
  letterSpacing?: string
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  fontStyle?: 'normal' | 'italic'

  // ── title ──
  /** The words on the tag. Kept short — it sits on one line beside a name. */
  text?: string
  /** Border colour for the tag. */
  borderColor?: string

  // ── avatar_effect ──
  /**
   * Which effect to draw: `sparkles` · `orbit` · `flames` · `bubbles` ·
   * `snow` · `hearts` · `stars`. Unknown keys draw nothing.
   */
  effect?: string
  /** How many particles, 1–12. Clamped by the renderer. */
  particles?: number

  [key: string]: unknown
}

/** A catalog row with the viewer's own relationship to it attached. */
export interface StoreListing extends StoreItem {
  owned: boolean
  equipped: boolean
  owned_count: number
  in_stock: boolean
}

/** An item somebody owns. */
export interface InventoryItem {
  id: Uuid
  user_id: Uuid
  item: StoreItem
  /** What it cost at the time, which repricing does not rewrite. */
  paid_points: number
  source: 'purchase' | 'grant' | 'reward' | string
  acquired_at: Timestamp
  equipped: boolean
}

/** What somebody is wearing, resolved to whole items. */
export interface EquippedCosmetics {
  user_id: Uuid
  frame: StoreItem | null
  badge: StoreItem | null
  banner: StoreItem | null
  name_color: StoreItem | null
  name_font: StoreItem | null
  title: StoreItem | null
  avatar_effect: StoreItem | null
  chat_bubble: StoreItem | null
  updated_at: Timestamp | null
}

/**
 * One slot change.
 *
 * An omitted key leaves that slot alone; an explicit `null` clears it. Sending
 * `{}` is therefore a no-op rather than a strip-everything.
 */
export interface EquipInput {
  frame_item_id?: Uuid | null
  badge_item_id?: Uuid | null
  banner_item_id?: Uuid | null
  name_color_item_id?: Uuid | null
  name_font_item_id?: Uuid | null
  title_item_id?: Uuid | null
  avatar_effect_item_id?: Uuid | null
  chat_bubble_item_id?: Uuid | null
}

export interface BalanceTransaction {
  id: Uuid
  user_id: Uuid
  amount: number
  reason: string
  metadata: Record<string, unknown>
  created_at: Timestamp
}

export interface BalanceOverview {
  balance: number
  lifetime_earned: number
  daily_streak: number
  can_claim_daily: boolean
  /** When the next check-in unlocks; null when it already has. */
  next_claim_at: Timestamp | null
  /** What the next check-in pays, streak included. */
  next_claim_points: number
  recent_transactions: BalanceTransaction[]
}

export interface DailyCheckinResult {
  points_awarded: number
  new_balance: number
  daily_streak: number
}

export interface ReferralRecord {
  id: Uuid
  referrer_id: Uuid
  referee_id: Uuid | null
  referral_code: string
  status: string
  reward_points: number
  created_at: Timestamp
  completed_at: Timestamp | null
  referee_handle: string | null
  referee_display_name: string | null
  referee_avatar_url: string | null
}

export interface ReferralMilestone {
  label: string
  invites: number
  bonus_points: number
  reached: boolean
}

export interface ReferralOverview {
  referral_code: string
  /** Already assembled by the server — paste it, do not rebuild it. */
  share_url: string
  total_referred: number
  total_earned_points: number
  has_claimed_code: boolean
  referrals: ReferralRecord[]
  milestones: ReferralMilestone[]
}

export interface ClaimReferralResult {
  message: string
  points_awarded: number
  new_balance: number
}

/**
 * Create or edit a catalog item.
 *
 * Everything is optional because the same shape serves both: a create needs
 * `sku`, `name`, `item_type` and a price, and an update leaves out whatever it
 * is not changing.
 */
export interface StoreItemInput {
  sku?: string
  name?: string
  description?: string
  item_type?: ItemType
  rarity?: ItemRarity
  price_points?: number
  asset_url?: string | null
  style_config?: CosmeticStyle
  is_active?: boolean
  is_limited?: boolean
  stock_limit?: number | null
  sort_order?: number
}

export interface GrantPointsInput {
  user_id: Uuid
  /** Negative corrects a balance downwards. */
  amount: number
  note?: string
}

export interface GrantPointsResult {
  amount: number
  new_balance: number
}
