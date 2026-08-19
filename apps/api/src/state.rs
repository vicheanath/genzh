//! Application state — the dependency-injection container.
//!
//! Handlers receive this and nothing else. Constructing it is the only place
//! that knows how the services fit together, which is what keeps the wiring
//! out of the routing table and out of the handlers.

use std::sync::Arc;

use genzh_auth::{AuthService, JwtService};
use genzh_community::CommunityService;
use genzh_graph::SocialService;
use genzh_infrastructure::{DbPool, PgConfig, RepositoryResult, connect};
use genzh_media_core::token::MediaTokenSigner;
use genzh_messaging::MessagingService;
use genzh_room::{MediaSessionService, RoomService, StaticMediaServers};

use crate::config::Config;
use crate::middleware::rate_limit::{InMemoryRateLimiter, RateLimiter};

/// Everything a handler can reach.
///
/// Cheap to clone: every field is either an `Arc` or a handle that is itself
/// `Arc`-backed, so Axum cloning this per request costs a few refcount bumps.
#[derive(Clone)]
pub struct AppState {
    /// Connection pool, for health checks.
    pub pool: DbPool,
    /// Registration, login, sessions.
    pub auth: AuthService,
    /// Communities, members, roles.
    pub communities: CommunityService,
    /// Rooms and room authorization.
    pub rooms: RoomService,
    /// Messages and reactions.
    pub messaging: MessagingService,
    /// Friendships and blocks.
    pub social: SocialService,
    /// Media join authorization and token minting.
    pub media: Arc<MediaSessionService>,
    /// The configuration this process started with.
    pub config: Arc<Config>,
    /// General per-address request budget.
    pub rate_limiter: Arc<dyn RateLimiter>,
    /// Tighter budget for credential endpoints.
    pub auth_rate_limiter: Arc<dyn RateLimiter>,
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
        let rooms = RoomService::new(pool.clone(), communities.clone());
        let messaging = MessagingService::new(pool.clone(), rooms.clone());
        let social = SocialService::new(pool.clone());

        let signer = Arc::new(MediaTokenSigner::new(
            config.media_token_secret.as_bytes(),
            &config.jwt_issuer,
            config.media_token_ttl_seconds,
        ));
        let servers = Arc::new(StaticMediaServers::from_env_value(
            &config.media_server_urls,
        ));

        let media = Arc::new(MediaSessionService::new(
            rooms.clone(),
            signer,
            servers,
            config.ice.clone(),
        ));

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
            rooms,
            messaging,
            social,
            media,
            config: Arc::new(config),
        })
    }
}
