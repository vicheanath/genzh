//! Turning a spent budget into a 429.
//!
//! The counting lives in `genzh_infrastructure::rate_limit`, behind the
//! `RateLimiter` trait; this file is only the HTTP half — which budget a path
//! draws from, what a refusal looks like on the wire, and what to do when the
//! limiter itself cannot answer. Keeping the two apart is what lets the counter
//! move to Redis without touching the response shape, and the response shape
//! change without touching the counter.

use axum::extract::Request;
use axum::extract::{ConnectInfo, State};
use axum::http::header::RETRY_AFTER;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;

use crate::error::ApiError;
use crate::state::AppState;

/// Rate-limit by client address.
///
/// Keyed on the peer address rather than on the authenticated user, because
/// the endpoints most worth protecting — login, registration, refresh — are
/// precisely the ones with no authenticated user yet.
///
/// Behind a proxy the peer address is the proxy. Trusting `X-Forwarded-For`
/// instead would let any client pick its own bucket, so the correct fix is for
/// the proxy to enforce this or to be configured as trusted — not to believe a
/// header.
pub async fn enforce(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    // Authentication endpoints get the tighter budget.
    let (limiter, scope) = if path.starts_with("/api/v1/auth/") {
        (&state.auth_rate_limiter, "auth")
    } else {
        (&state.rate_limiter, "api")
    };

    let key = format!("{scope}:{}", peer.ip());
    match limiter.check(&key).await {
        Ok(decision) if decision.allowed => next.run(request).await,
        Ok(decision) => {
            tracing::warn!(peer = %peer.ip(), scope, "rate limited");
            refuse(decision.retry_after)
        }
        // A limiter that cannot answer fails open. The alternative — refusing
        // every request because a counter is unreachable — turns a degraded
        // dependency into a total outage, and the budget defends against abuse
        // rather than protecting correctness.
        Err(error) => {
            tracing::error!(%error, scope, "rate limiter unavailable; allowing request");
            next.run(request).await
        }
    }
}

/// A 429 that says when to come back.
fn refuse(retry_after: std::time::Duration) -> Response {
    let mut response = ApiError::RateLimited.into_response();
    // Rounded up so a sub-second wait advertises one second rather than zero,
    // which a client would read as "retry immediately".
    let seconds = retry_after.as_secs_f64().ceil().max(1.0) as u64;
    if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
        response.headers_mut().insert(RETRY_AFTER, value);
    }
    response
}
