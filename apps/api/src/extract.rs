//! Extractors that fail in the API's own error shape.
//!
//! Axum's built-in rejections are plain text with their own status codes,
//! which means a malformed request body would be the one response in the whole
//! API that is not `{"error": {...}}`. Wrapping the extractor is cheaper than
//! asking every client to handle two error formats.

use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Request};

use crate::error::ApiError;

/// `Json`, but rejections become [`ApiError::BadRequest`].
#[derive(Debug, Clone, Copy, Default)]
pub struct ApiJson<T>(pub T);

impl<T, S> FromRequest<S> for ApiJson<T>
where
    axum::Json<T>: FromRequest<S, Rejection = JsonRejection>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        match axum::Json::<T>::from_request(request, state).await {
            Ok(axum::Json(value)) => Ok(ApiJson(value)),
            Err(rejection) => Err(ApiError::BadRequest(describe(&rejection))),
        }
    }
}

/// Turn a rejection into a message that helps without echoing the body back.
fn describe(rejection: &JsonRejection) -> String {
    match rejection {
        JsonRejection::JsonDataError(error) => {
            // serde's message names the offending field, which is exactly what
            // a client developer needs and reveals nothing about the server.
            format!("Request body is not valid: {}", root_cause(error))
        }
        JsonRejection::JsonSyntaxError(_) => "Request body is not valid JSON".to_owned(),
        JsonRejection::MissingJsonContentType(_) => {
            "Expected a Content-Type of application/json".to_owned()
        }
        JsonRejection::BytesRejection(_) => "Request body could not be read".to_owned(),
        _ => "Request body could not be processed".to_owned(),
    }
}

fn root_cause(error: &impl std::error::Error) -> String {
    let mut current: &dyn std::error::Error = error;
    while let Some(source) = current.source() {
        current = source;
    }
    current.to_string()
}
