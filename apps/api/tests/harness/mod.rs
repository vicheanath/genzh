//! Shared harness for the API integration tests.
//!
//! ## Why these tests skip instead of failing
//!
//! They exercise real SQL against real PostgreSQL — that is the point, since a
//! repository test against a mock proves only that the mock agrees with
//! itself. But `cargo test --workspace` has to pass on a fresh clone with
//! nothing installed, so when no database is configured each test prints what
//! it skipped and returns.
//!
//! `docker compose up -d postgres` is enough to make them run.
//!
//! ## Why they never touch your development database
//!
//! Every test registers accounts and creates communities, and nothing deletes
//! them afterwards. Pointed at the database you actually browse, a few hundred
//! runs bury the handful of real accounts under thousands of `alice_9f3b…`
//! ones — which is exactly what happened before this.
//!
//! So the harness derives its own database from `DATABASE_URL` by suffixing the
//! name with `_test`, and drops and rebuilds it from the migrations once at the
//! start of each `cargo test` run. `TEST_DATABASE_URL` overrides where it goes,
//! but the name must still end in `_test` — the suite deletes it, and that
//! guard is what keeps a slip of the wrist from deleting something real.

#![allow(dead_code)]

use std::net::SocketAddr;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

/// The LiveKit API key and secret the harness signs with, so tests can verify
/// tokens exactly the way LiveKit would.
pub const TEST_LIVEKIT_API_KEY: &str = "integration-test-key";
pub const TEST_LIVEKIT_API_SECRET: &str = "integration-test-livekit-secret-value-32b";

/// A running API, wired to a real database.
#[derive(Clone)]
pub struct TestApi {
    router: Router,
    /// Kept so tests can assert directly against the schema.
    pub pool: sqlx::PgPool,
}

/// Build the API against the configured test database.
///
/// Returns `None` when no database is available, which the caller turns into
/// a skip.
pub async fn boot() -> Option<TestApi> {
    boot_with(|_| {}).await
}

/// Build the API, with a chance to replace the volatile-state implementations
/// first.
///
/// Presence, request budgets and real-time fan-out are `Arc<dyn …>` on
/// [`api::AppState`], so a test can swap in an implementation that behaves
/// differently — one that is down, or one with a budget of a single request —
/// and drive the real router against it. Nothing but this closure changes,
/// which is the property the ports exist to provide.
pub async fn boot_with(configure: impl FnOnce(&mut api::AppState)) -> Option<TestApi> {
    let url = test_database_url()?;

    // Creating, migrating and emptying the database happens once per process,
    // not once per test: Rust runs tests in parallel threads, and truncating
    // per boot would wipe a sibling test's rows out from under it mid-run.
    if !prepare_database(&url).await {
        return None;
    }

    let pool = match sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .connect(&url)
        .await
    {
        Ok(pool) => pool,
        Err(error) => {
            eprintln!("SKIP: cannot reach the test database: {error}");
            return None;
        }
    };

    let mut state = api::AppState::build(api_config(url)).await.ok()?;
    configure(&mut state);

    Some(TestApi {
        router: api::router::build(state),
        pool,
    })
}

/// Where the tests are allowed to write.
///
/// `TEST_DATABASE_URL` wins outright. Otherwise `DATABASE_URL` has its database
/// name suffixed with `_test` — deliberately *derived* rather than used as-is,
/// so running the suite can never write to the database you browse, even if you
/// forget to set anything.
fn test_database_url() -> Option<String> {
    if let Ok(explicit) = std::env::var("TEST_DATABASE_URL") {
        return Some(explicit);
    }

    let base = std::env::var("DATABASE_URL").ok()?;
    let (prefix, name) = base.rsplit_once('/')?;
    // Strip any query string before suffixing, or the name becomes
    // `genzh?sslmode=require_test`.
    let (name, query) = match name.split_once('?') {
        Some((name, query)) => (name, format!("?{query}")),
        None => (name, String::new()),
    };
    Some(format!("{prefix}/{name}_test{query}"))
}

/// Create the database if it is missing, migrate it, and empty it — once.
async fn prepare_database(url: &str) -> bool {
    static PREPARED: tokio::sync::OnceCell<bool> = tokio::sync::OnceCell::const_new();
    *PREPARED.get_or_init(|| prepare_once(url.to_owned())).await
}

async fn prepare_once(url: String) -> bool {
    use sqlx::Connection;

    let Some((prefix, tail)) = url.rsplit_once('/') else {
        eprintln!("SKIP: could not read a database name out of the test URL");
        return false;
    };
    let name = tail.split('?').next().unwrap_or(tail);

    // The suite drops and recreates its database, so refuse to point at
    // anything that is not obviously disposable. Without this, one careless
    // `TEST_DATABASE_URL` deletes a real database.
    if !name.ends_with("_test") {
        eprintln!(
            "SKIP: refusing to use `{name}` — the integration suite drops and recreates \
             its database, so the name must end in `_test`"
        );
        return false;
    }

    // `CREATE DATABASE` has to be issued from another database, so this
    // connects to `postgres` — the maintenance database every server has.
    let mut admin = match sqlx::PgConnection::connect(&format!("{prefix}/postgres")).await {
        Ok(admin) => admin,
        Err(error) => {
            eprintln!("SKIP: cannot reach PostgreSQL: {error}");
            return false;
        }
    };

    // Dropped and rebuilt rather than emptied.
    //
    // Truncating looked cheaper and was wrong: migration 0002 *seeds* the
    // permission catalogue, and a truncate takes those rows with it while the
    // migration — already recorded as applied — never runs again. Every
    // registration then failed on a missing permission. Rebuilding from the
    // migrations is the only version that cannot drift from them.
    //
    // `AssertSqlSafe` because a database name is an identifier and cannot be a
    // bind parameter. Audited: the name is derived from the developer's own
    // `DATABASE_URL`, is never request-supplied, has been checked to end in
    // `_test`, and is double-quoted.
    if let Err(error) = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
        r#"DROP DATABASE IF EXISTS "{name}" WITH (FORCE)"#
    )))
    .execute(&mut admin)
    .await
    {
        eprintln!("SKIP: could not drop the test database: {error}");
        return false;
    }

    if let Err(error) = sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
        r#"CREATE DATABASE "{name}""#
    )))
    .execute(&mut admin)
    .await
    {
        eprintln!("SKIP: could not create the test database: {error}");
        return false;
    }

    let pool = match sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .connect(&url)
        .await
    {
        Ok(pool) => pool,
        Err(error) => {
            eprintln!("SKIP: cannot reach the test database: {error}");
            return false;
        }
    };

    if let Err(error) = genzh_infrastructure::run_migrations(&pool).await {
        eprintln!("SKIP: migrations failed: {error}");
        return false;
    }

    true
}

/// Announce a skip so it shows up in `cargo test -- --nocapture`.
pub fn skip(test: &str) {
    eprintln!(
        "SKIP {test}: set DATABASE_URL (the suite uses a derived `…_test` database) \
         or TEST_DATABASE_URL to run the integration tests"
    );
}

fn api_config(database_url: String) -> api::Config {
    api::Config {
        bind: "127.0.0.1:0".parse().expect("valid address"),
        database_url,
        database_max_connections: 4,
        // The harness applies them itself, before the state is built.
        run_migrations: false,

        jwt_secret: "integration-test-jwt-secret-value-32b".to_owned(),
        jwt_issuer: "social.api".to_owned(),
        jwt_audience: "social.client".to_owned(),
        access_ttl_seconds: 900,
        refresh_ttl_seconds: 3600,

        livekit_api_key: TEST_LIVEKIT_API_KEY.to_owned(),
        livekit_api_secret: TEST_LIVEKIT_API_SECRET.to_owned(),
        livekit_url: "ws://livekit.test:7880".to_owned(),
        livekit_token_ttl_seconds: 120,

        max_body_bytes: 256 * 1024,
        request_timeout_seconds: 10,
        cors_allowed_origins: String::new(),
        // High enough that a test run cannot trip it.
        rate_limit_per_minute: 100_000,
        auth_rate_limit_per_minute: 100_000,

        // Likewise for the anti-spam budgets: a test that posts ten messages to
        // set up a scenario is not a flood, and a suite that had to sleep to
        // avoid one would be a slow suite. The tests that care about the guard
        // set their own policy.
        message_burst_limit: 100_000,
        message_burst_window_seconds: 60,
        message_repeat_window_seconds: 0,
        message_repeat_limit: 100_000,

        app_env: "test".to_owned(),
        allow_password_signup: true,
        frontend_url: "http://localhost:5173".to_owned(),

        google_client_id: None,
        google_client_secret: None,
        google_redirect_uri: None,

        discord_client_id: None,
        discord_client_secret: None,
        discord_redirect_uri: None,

        // No key, so `/gifs/*` reports itself unavailable rather than reaching
        // for the network — which is what a test run wants regardless.
        tenor_api_key: None,
        tenor_client_key: "genzh-test".to_owned(),

        // Long enough that no sweep fires during a test run. The harness never
        // starts the scheduler, so these only have to be values that parse —
        // but a test that did start it should not have rows pruned underneath
        // it either.
        cron: api::config::CronConfig {
            session_prune_interval: Duration::from_secs(3600),
            store_sweep_interval: Duration::from_secs(3600),
            ephemeral_room_expire_interval: Duration::from_secs(3600),
            playground_reap_interval: Duration::from_secs(3600),
            playground_empty_grace: Duration::from_secs(3600),
            invite_prune_interval: Duration::from_secs(3600),
            notification_prune_interval: Duration::from_secs(3600),
            notification_read_retention: Duration::from_secs(30 * 86400),
            notification_unread_retention: Duration::from_secs(90 * 86400),
            security_prune_interval: Duration::from_secs(3600),
            support_cleanup_interval: Duration::from_secs(3600),
            support_stale_after: Duration::from_secs(14 * 86400),
        },
    }
}

/// One HTTP response, already parsed.
pub struct TestResponse {
    /// Status code.
    pub status: StatusCode,
    /// Body, parsed as JSON when it is JSON.
    pub json: Value,
    /// Response headers, for the assertions a body cannot make — `Retry-After`
    /// on a refusal, above all.
    pub headers: axum::http::HeaderMap,
}

impl TestResponse {
    /// Assert the status, printing the body when it does not match — the
    /// difference between a useful failure and a bare `assert_eq!`.
    pub fn expect_status(self, expected: StatusCode) -> Self {
        assert_eq!(
            self.status,
            expected,
            "unexpected status; body was {}",
            serde_json::to_string_pretty(&self.json).unwrap_or_default()
        );
        self
    }

    /// The `error.code` of an error response.
    pub fn error_code(&self) -> &str {
        self.json["error"]["code"].as_str().unwrap_or_default()
    }

    /// One header, as a string.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name)?.to_str().ok()
    }
}

impl TestApi {
    /// Send a request through the real router.
    pub async fn send(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> TestResponse {
        let mut builder = Request::builder().method(method).uri(path);

        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }

        let request_body = match body {
            Some(value) => {
                builder = builder.header("content-type", "application/json");
                Body::from(serde_json::to_vec(&value).expect("serialisable body"))
            }
            None => Body::empty(),
        };

        let mut request = builder.body(request_body).expect("valid request");

        // The rate-limit middleware keys on the peer address, which a real
        // server supplies via `into_make_service_with_connect_info`.
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 51_000))));

        let response = self
            .router
            .clone()
            .oneshot(request)
            .await
            .expect("router responds");
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);

        TestResponse {
            status,
            json,
            headers,
        }
    }

    /// Register a fresh account.
    pub async fn register(&self, label: &str) -> Account {
        // Unique per run so tests can share one database without colliding.
        let unique = uuid::Uuid::new_v4().simple().to_string();
        let handle = format!("{label}_{}", &unique[..12]);
        let password = "a-sufficiently-long-password".to_owned();

        let response = self
            .send(
                "POST",
                "/api/v1/auth/register",
                None,
                Some(serde_json::json!({
                    "handle": handle,
                    "email": format!("{handle}@example.test"),
                    "password": password,
                    "display_name": label,
                })),
            )
            .await
            .expect_status(StatusCode::OK);

        Account {
            user_id: response.json["user"]["id"]
                .as_str()
                .expect("user id")
                .to_owned(),
            handle,
            password,
            access_token: response.json["access_token"]
                .as_str()
                .expect("access")
                .to_owned(),
            refresh_token: response.json["refresh_token"]
                .as_str()
                .expect("refresh")
                .to_owned(),
        }
    }

    /// Create a community owned by `account`.
    pub async fn create_community(&self, account: &Account, name: &str) -> String {
        self.send(
            "POST",
            "/api/v1/communities",
            Some(&account.access_token),
            Some(serde_json::json!({ "name": name })),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json["id"]
            .as_str()
            .expect("community id")
            .to_owned()
    }

    /// Create a room in a community.
    pub async fn create_room(
        &self,
        account: &Account,
        community_id: &str,
        name: &str,
        room_type: &str,
    ) -> String {
        self.send(
            "POST",
            &format!("/api/v1/communities/{community_id}/rooms"),
            Some(&account.access_token),
            Some(serde_json::json!({ "name": name, "room_type": room_type })),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json["id"]
            .as_str()
            .expect("room id")
            .to_owned()
    }

    /// Post a message to a room.
    pub async fn post_message(
        &self,
        account: &Account,
        room_id: &str,
        content: &str,
    ) -> String {
        let resp = self.send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&account.access_token),
            Some(serde_json::json!({ "content": content })),
        )
        .await
        .expect_status(StatusCode::CREATED);

        resp.json["message"]["id"]
            .as_str()
            .or_else(|| resp.json["id"].as_str())
            .expect("message id")
            .to_owned()
    }
}

/// A registered test account.
pub struct Account {
    /// Account id.
    pub user_id: String,
    /// Login handle.
    pub handle: String,
    /// Plaintext password, for re-login tests.
    pub password: String,
    /// Bearer token.
    pub access_token: String,
    /// Refresh token.
    pub refresh_token: String,
}

/// The claims a decoded LiveKit access token carries, narrowed to what the
/// tests assert against.
pub struct LiveKitClaims {
    pub iss: String,
    pub sub: String,
    pub name: String,
    pub room: String,
    pub can_publish: bool,
    pub can_subscribe: bool,
    pub can_publish_data: bool,
}

/// Verifies a LiveKit access token exactly as LiveKit itself would: same
/// algorithm, same shared secret.
pub struct LiveKitVerifier {
    key: jsonwebtoken::DecodingKey,
}

impl LiveKitVerifier {
    pub fn verify(&self, token: &str) -> Result<LiveKitClaims, jsonwebtoken::errors::Error> {
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.set_required_spec_claims(&["exp", "sub", "iss"]);
        let decoded = jsonwebtoken::decode::<Value>(token, &self.key, &validation)?;
        let claims = decoded.claims;
        let video = &claims["video"];

        Ok(LiveKitClaims {
            iss: claims["iss"].as_str().unwrap_or_default().to_owned(),
            sub: claims["sub"].as_str().unwrap_or_default().to_owned(),
            name: claims["name"].as_str().unwrap_or_default().to_owned(),
            room: video["room"].as_str().unwrap_or_default().to_owned(),
            can_publish: video["canPublish"].as_bool().unwrap_or(false),
            can_subscribe: video["canSubscribe"].as_bool().unwrap_or(false),
            can_publish_data: video["canPublishData"].as_bool().unwrap_or(false),
        })
    }
}

/// Verify a LiveKit access token exactly as LiveKit itself would.
pub fn media_verifier() -> LiveKitVerifier {
    LiveKitVerifier {
        key: jsonwebtoken::DecodingKey::from_secret(TEST_LIVEKIT_API_SECRET.as_bytes()),
    }
}
