//! Application state — the dependency-injection container.
//!
//! Handlers receive this and nothing else. Constructing it is the only place
//! that knows how the services fit together, which is what keeps the wiring
//! out of the routing table and out of the handlers.

use std::sync::Arc;

use genzh_admin::{
    AuditLog, BroadcastService, CommunityAdminService, LiveMediaService, StaffService,
    SupportService,
};
use genzh_auth::{AuthService, JwtService};
use genzh_community::{CommunityService, InviteService, RoleService};
use genzh_graph::SocialService;
use genzh_infrastructure::{
    DbPool, EventBus, FloodGuard, FloodPolicy, InMemoryEventBus, InMemoryFloodGuard,
    InMemoryPresenceStore, InMemoryRateLimiter, PgConfig, PresenceStore, RateLimiter,
    RepositoryResult, connect,
};
use genzh_media_core::token::MediaTokenSigner;
use genzh_messaging::MessagingService;
use genzh_notification::NotificationService;
use genzh_room::{
    DirectRooms, MediaSessionService, ReadStateService, RoomDirectory, RoomService,
    StaticMediaServers,
};

use crate::config::Config;
use crate::routes::ws::ChatServerEvent;

/// Events a WebSocket subscriber may fall behind by before it starts losing
/// them.
///
/// Sized for a burst — a busy room while a client is briefly stalled — not for a
/// backlog. Anything that must not be lost is written to PostgreSQL before it is
/// published.
const EVENT_BUFFER: usize = 4096;

/// Everything a handler can reach.
///
/// Cheap to clone: every field is either an `Arc` or a handle that is itself
/// `Arc`-backed, so Axum cloning this per request costs a few refcount bumps.
///
/// The volatile state — presence, request budgets, real-time fan-out — is held
/// as `Arc<dyn …>` rather than as the concrete in-memory types. Nothing that
/// reads these fields can tell what is behind them, which is the point:
/// [`AppState::build`] is the only code in the process that knows, so pointing
/// them at a shared store is a change to one constructor.
#[derive(Clone)]
pub struct AppState {
    /// Connection pool, for health checks.
    pub pool: DbPool,
    /// Registration, login, sessions.
    pub auth: AuthService,
    /// Communities and their membership.
    pub communities: CommunityService,
    /// Roles, and the rule that nobody may grant what they do not hold.
    pub roles: RoleService,
    /// Rooms and room authorization.
    pub rooms: RoomService,
    /// Two-person conversations.
    pub directs: DirectRooms,
    /// Finding rooms you are not in yet.
    pub directory: RoomDirectory,
    /// Messages and reactions.
    pub messaging: MessagingService,
    /// Friendships and blocks.
    pub social: SocialService,
    /// Recorded notifications.
    pub notifications: NotificationService,
    /// The record of what staff did. Append-only.
    pub audit: AuditLog,
    /// Platform staff, and enforcement against accounts.
    pub staff: StaffService,
    /// Reports and help requests.
    pub support: SupportService,
    /// Community safety & moderation.
    pub admin_communities: CommunityAdminService,
    /// Platform announcements.
    pub broadcasts: BroadcastService,
    /// Live SFU media session monitoring & termination.
    pub live_media: LiveMediaService,
    /// Invite links into communities.
    pub invites: InviteService,
    /// Where each person got to in each room.
    pub read_state: ReadStateService,
    /// Media join authorization and token minting.
    pub media: Arc<MediaSessionService>,
    /// The configuration this process started with.
    pub config: Arc<Config>,
    /// General per-address request budget.
    pub rate_limiter: Arc<dyn RateLimiter>,
    /// Tighter budget for credential endpoints.
    pub auth_rate_limiter: Arc<dyn RateLimiter>,
    /// Per-account posting budget, held here so the WebSocket loop can consult
    /// it for the commands that never become a message — typing, above all.
    pub flood: Arc<dyn FloodGuard>,
    /// Real-time fan-out to connected WebSocket clients.
    pub events: Arc<dyn EventBus<ChatServerEvent>>,
    /// Who is currently connected, derived from live WebSockets.
    pub presence: Arc<dyn PresenceStore>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState").finish_non_exhaustive()
    }
}

impl AppState {
    /// Wire everything together from the configuration.
    pub async fn build(config: Config) -> RepositoryResult<Self> {
        let mut pg = PgConfig::new(&config.database_url);
        pg.max_connections = config.database_max_connections;
        let pool = connect(&pg).await?;

        let jwt = Arc::new(JwtService::new(
            config.jwt_secret.as_bytes(),
            &config.jwt_issuer,
            &config.jwt_audience,
            config.access_ttl_seconds,
            config.refresh_ttl_seconds,
        ));

        let auth = AuthService::new(pool.clone(), jwt);
        let communities = CommunityService::new(pool.clone());
        let roles = communities.roles();
        // Rooms consult the social graph so a block makes a direct conversation
        // invisible; everything layered on rooms inherits that.
        let social = SocialService::new(pool.clone());
        let rooms = RoomService::new(pool.clone(), communities.clone(), social.clone());
        let directs = rooms.directs();
        let directory = rooms.directory();
        // The one guard both message paths share. Handing the same `Arc` to the
        // service and to the socket loop is deliberate: a flood that switches
        // from REST to WebSocket halfway through is still one flood.
        let flood = InMemoryFloodGuard::new(FloodPolicy {
            burst: config.message_burst_limit,
            window: std::time::Duration::from_secs(config.message_burst_window_seconds),
            repeat_window: std::time::Duration::from_secs(config.message_repeat_window_seconds),
            repeats: config.message_repeat_limit,
        });

        let messaging = MessagingService::new(pool.clone(), rooms.clone(), flood.clone());
        let notifications = NotificationService::new(pool.clone());

        // The audit log is handed to the services that write to it rather than
        // being reached for globally, so what is audited is visible in the
        // wiring instead of buried in call sites.
        let audit = AuditLog::new(pool.clone());
        let staff = StaffService::new(pool.clone(), audit.clone());
        let support = SupportService::new(pool.clone(), audit.clone());
        let admin_communities = CommunityAdminService::new(pool.clone(), audit.clone());
        let broadcasts = BroadcastService::new(pool.clone(), audit.clone());
        let live_media = LiveMediaService::new(pool.clone(), audit.clone());
        let invites = InviteService::new(pool.clone(), communities.clone());
        let read_state = ReadStateService::new(pool.clone());

        let signer = Arc::new(MediaTokenSigner::new(
            config.media_token_secret.as_bytes(),
            &config.jwt_issuer,
            config.media_token_ttl_seconds,
        ));

        // The media server prints the same fingerprint for the secret it
        // verifies with. If the two lines disagree, every join will be rejected
        // — and this is the only place either process can say so, because they
        // never exchange the key.
        tracing::info!(
            secret_fingerprint = %genzh_media_core::token::secret_fingerprint(
                config.media_token_secret.as_bytes()
            ),
            token_issuer = %config.jwt_issuer,
            token_ttl_seconds = signer.ttl_seconds(),
            "signing media tokens — this fingerprint must match the media server's"
        );
        let servers = Arc::new(StaticMediaServers::from_env_value(
            &config.media_server_urls,
        ));

        let media = Arc::new(MediaSessionService::new(
            rooms.clone(),
            signer,
            servers,
            config.ice.clone(),
        ));

        // ── volatile state ──────────────────────────────────────────────────
        // The only place in the process that names a concrete implementation of
        // these ports. Running more than one API instance means swapping these
        // three constructors for shared-store equivalents; every call site
        // already talks to the trait.
        Ok(Self {
            rate_limiter: InMemoryRateLimiter::new(
                config.rate_limit_per_minute,
                std::time::Duration::from_secs(60),
            ),
            // Login and registration are where credential stuffing lands, and
            // each attempt costs an Argon2 verification.
            auth_rate_limiter: InMemoryRateLimiter::new(
                config.auth_rate_limit_per_minute,
                std::time::Duration::from_secs(60),
            ),
            pool,
            auth,
            communities,
            roles,
            rooms,
            directs,
            directory,
            messaging,
            social,
            notifications,
            audit,
            staff,
            support,
            admin_communities,
            broadcasts,
            live_media,
            invites,
            read_state,
            media,
            flood,
            events: InMemoryEventBus::new(EVENT_BUFFER),
            presence: InMemoryPresenceStore::new(),
            config: Arc::new(config),
        })
    }

    /// Swap the flood guard, in the messaging service and the socket loop
    /// alike.
    ///
    /// The other volatile ports are plain fields, so a test replaces one by
    /// assigning to it. This one is held in two places — the service enforces
    /// it, the socket loop consults it — and a test that set only the field
    /// would be testing a guard nothing asks. Changing both together is the
    /// whole reason this is a method rather than a `pub` field.
    pub fn set_flood_guard(&mut self, guard: Arc<dyn FloodGuard>) {
        self.messaging = self.messaging.with_flood_guard(guard.clone());
        self.flood = guard;
    }

    /// Publish a real-time event to whoever is listening.
    ///
    /// Fan-out is a courtesy, not part of the request: a client that misses an
    /// event refetches and sees the truth, whereas failing the write because a
    /// broadcast did not land would lose the thing the user actually asked for.
    /// So a failure is logged here and goes no further — and it is decided in
    /// one place rather than at each of the dozen call sites that publish.
    pub async fn broadcast(&self, event: ChatServerEvent) {
        if let Err(error) = self.events.publish(event).await {
            tracing::warn!(%error, "could not publish a real-time event");
        }
    }
}
