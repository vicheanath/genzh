//! Request correlation.
//!
//! Every request gets an id, which is:
//!
//! * echoed in the `x-request-id` response header, so a user can quote it;
//! * attached to the tracing span, so every log line the request produces
//!   carries it;
//! * reused from an inbound `x-request-id` when one is present, so a trace
//!   survives a proxy hop.
//!
//! This is the control-plane half of the correlation story. The media plane
//! does the same with `connection_id`, and the two meet at `room_id` and
//! `user_id`.

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use uuid::Uuid;

/// Header carrying the correlation id.
pub const REQUEST_ID_HEADER: &str = "x-request-id";

/// The id of the request being handled, available to handlers via extensions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RequestId(pub Uuid);

impl std::fmt::Display for RequestId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

/// Assign or adopt a request id, and put it on every log line.
pub async fn propagate_request_id(mut request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(RequestId)
        .unwrap_or_else(|| RequestId(Uuid::new_v4()));

    request.extensions_mut().insert(request_id);

    let span = tracing::info_span!(
        "http",
        request_id = %request_id,
        method = %request.method(),
        path = %request.uri().path(),
    );

    let mut response = {
        use tracing::Instrument;
        next.run(request).instrument(span).await
    };

    if let Ok(value) = HeaderValue::from_str(&request_id.to_string()) {
        response.headers_mut().insert(REQUEST_ID_HEADER, value);
    }

    response
}
