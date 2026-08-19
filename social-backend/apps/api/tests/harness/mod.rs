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
//! Point `TEST_DATABASE_URL` (or `DATABASE_URL`) at a database and they run.
//! `docker compose up -d postgres` is enough.

#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use social_media_core::ice::IceConfig;
use tower::ServiceExt;

/// The media secret the harness signs with, so tests can verify tokens exactly
/// the way the media server does.
pub const TEST_MEDIA_SECRET: &str = "integration-test-media-secret-value-32b";

/// A running API, wired to a real database.
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
    let url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()?;

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

    if let Err(error) = social_infrastructure::run_migrations(&pool).await {
        eprintln!("SKIP: migrations failed: {error}");
        return None;
    }

    let state = api::AppState::build(api_config(url)).await.ok()?;
    Some(TestApi { router: api::router::build(state), pool })
}

/// Announce a skip so it shows up in `cargo test -- --nocapture`.
pub fn skip(test: &str) {
    eprintln!(
        "SKIP {test}: set TEST_DATABASE_URL (or DATABASE_URL) to run the integration tests"
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

        media_token_secret: TEST_MEDIA_SECRET.to_owned(),
        media_token_ttl_seconds: 120,
        media_server_urls: "ws://media.test:8081/ws/media".to_owned(),

        ice: IceConfig::from_parts(Some("stun:stun.test:3478"), None, None, None, false)
            .expect("valid ice config"),

        max_body_bytes: 256 * 1024,
        request_timeout_seconds: 10,
        cors_allowed_origins: String::new(),
        // High enough that a test run cannot trip it.
        rate_limit_per_minute: 100_000,
        auth_rate_limit_per_minute: 100_000,
    }
}

/// One HTTP response, already parsed.
pub struct TestResponse {
    /// Status code.
    pub status: StatusCode,
    /// Body, parsed as JSON when it is JSON.
    pub json: Value,
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

        let response = self.router.clone().oneshot(request).await.expect("router responds");
        let status = response.status();
        let bytes = response.into_body().collect().await.expect("body").to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);

        TestResponse { status, json }
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
            user_id: response.json["user"]["id"].as_str().expect("user id").to_owned(),
            handle,
            password,
            access_token: response.json["access_token"].as_str().expect("access").to_owned(),
            refresh_token: response.json["refresh_token"].as_str().expect("refresh").to_owned(),
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

/// Verify a media token exactly as the media server would.
pub fn media_verifier() -> Arc<social_media_core::token::MediaTokenSigner> {
    Arc::new(social_media_core::token::MediaTokenSigner::new(
        TEST_MEDIA_SECRET.as_bytes(),
        "social.api",
        120,
    ))
}
