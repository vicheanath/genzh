//! GIF search, proxied to Tenor.
//!
//! The API sits in front of Tenor for two reasons. The key stays server-side —
//! shipping it to a browser publishes it — and the response is narrowed to the
//! handful of fields a picker draws. Tenor's `media_formats` object carries a
//! dozen renditions of every result; forwarding it whole would make the picker
//! ten times the bytes it needs to be, over a connection that is usually a
//! phone's.
//!
//! Nothing is cached here. Tenor's own CDN serves the images, and the search
//! results are a person typing — by the time a cache helped, they have typed
//! something else.

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// Tenor's v2 base. No trailing slash.
const TENOR_BASE: &str = "https://tenor.googleapis.com/v2";

/// How many results one page may hold.
///
/// Tenor's own ceiling is 50. The picker asks for far fewer; the clamp exists
/// so a client cannot turn one keystroke into the maximum request.
const LIMIT_MAX: u32 = 50;
/// Page size when the client does not ask for one.
const LIMIT_DEFAULT: u32 = 24;

/// How long to wait on Tenor before giving up.
///
/// Short: this sits between a person and a picker that is already open. A slow
/// answer is worse than "search is unavailable", because they are still typing.
const TIMEOUT_SECONDS: u64 = 6;

/// `GET /api/v1/gifs/search` query.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    /// What to search for.
    pub q: String,
    /// Page size.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Opaque cursor from a previous response's `next`.
    #[serde(default)]
    pub pos: Option<String>,
}

/// `GET /api/v1/gifs/trending` query.
#[derive(Debug, Deserialize)]
pub struct TrendingQuery {
    /// Page size.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Opaque cursor from a previous response's `next`.
    #[serde(default)]
    pub pos: Option<String>,
}

/// One GIF, reduced to what a picker draws.
#[derive(Debug, Serialize)]
pub struct GifView {
    /// Tenor's id for the result.
    pub id: String,
    /// Alt text. Tenor's `content_description`, which is why it reads like a
    /// caption rather than a filename.
    pub description: String,
    /// The full-size GIF — what gets posted into the room.
    pub url: String,
    /// A small looping preview for the grid.
    pub preview_url: String,
    /// Intrinsic size of `url`, so the grid can reserve the space before the
    /// image arrives and stop the results jumping as they load.
    pub width: u32,
    pub height: u32,
}

/// A page of results.
#[derive(Debug, Serialize)]
pub struct GifPage {
    /// The results themselves.
    pub results: Vec<GifView>,
    /// Cursor for the next page. Empty string from Tenor means "no more",
    /// which is normalised to `null` here so clients test one thing.
    pub next: Option<String>,
}

// ── Tenor's wire shape ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TenorResponse {
    #[serde(default)]
    results: Vec<TenorResult>,
    #[serde(default)]
    next: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TenorResult {
    id: String,
    #[serde(default)]
    content_description: String,
    #[serde(default)]
    media_formats: TenorFormats,
}

/// The renditions this proxy actually uses.
///
/// Everything else Tenor sends is ignored by omission — serde drops unknown
/// fields, so a new rendition appearing upstream costs nothing here.
#[derive(Debug, Default, Deserialize)]
struct TenorFormats {
    /// Full-size GIF.
    #[serde(default)]
    gif: Option<TenorMedia>,
    /// A smaller GIF, used when the full one is missing.
    #[serde(default)]
    mediumgif: Option<TenorMedia>,
    /// Grid preview, in preference order.
    #[serde(default)]
    tinygif: Option<TenorMedia>,
    #[serde(default)]
    nanogif: Option<TenorMedia>,
}

#[derive(Debug, Deserialize)]
struct TenorMedia {
    url: String,
    /// Tenor sends `[width, height]`.
    #[serde(default)]
    dims: Vec<u32>,
}

/// `GET /api/v1/gifs/search`
pub async fn search(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<GifPage>> {
    let term = query.q.trim();
    if term.is_empty() {
        return Err(ApiError::bad_request("A search term is required"));
    }

    let mut params = vec![
        ("q".to_owned(), term.to_owned()),
        ("limit".to_owned(), clamp_limit(query.limit).to_string()),
    ];
    if let Some(pos) = query.pos.filter(|p| !p.trim().is_empty()) {
        params.push(("pos".to_owned(), pos));
    }

    fetch(&state, "search", params).await.map(Json)
}

/// `GET /api/v1/gifs/trending`
///
/// What the picker shows before anybody types.
pub async fn trending(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Query(query): Query<TrendingQuery>,
) -> ApiResult<Json<GifPage>> {
    let mut params = vec![("limit".to_owned(), clamp_limit(query.limit).to_string())];
    if let Some(pos) = query.pos.filter(|p| !p.trim().is_empty()) {
        params.push(("pos".to_owned(), pos));
    }

    fetch(&state, "featured", params).await.map(Json)
}

/// Ask Tenor for one page and narrow the answer.
async fn fetch(
    state: &AppState,
    endpoint: &str,
    mut params: Vec<(String, String)>,
) -> ApiResult<GifPage> {
    let key = state.config.tenor_api_key.as_deref().ok_or_else(|| {
        // Not an internal error: the deployment is configured this way on
        // purpose, and the client's correct response is to hide the button
        // rather than to retry.
        ApiError::Unavailable("GIF search is not configured on this server".to_owned())
    })?;

    params.push(("key".to_owned(), key.to_owned()));
    params.push((
        "client_key".to_owned(),
        state.config.tenor_client_key.clone(),
    ));
    // Only the renditions `GifView` reads. Tenor bills nothing for the rest,
    // but it sends a great deal of it.
    params.push((
        "media_filter".to_owned(),
        "gif,mediumgif,tinygif,nanogif".to_owned(),
    ));
    // Tenor's own safety filter, at its strictest. This is a product with
    // teenage users; the alternative is moderating an image search by hand.
    params.push(("contentfilter".to_owned(), "high".to_owned()));

    let url = format!("{TENOR_BASE}/{endpoint}");

    let response = state
        .http
        .get(&url)
        .query(&params)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, endpoint, "tenor request failed");
            ApiError::Unavailable("GIF search is temporarily unavailable".to_owned())
        })?;

    if !response.status().is_success() {
        // The status is logged and deliberately not forwarded: Tenor's 403 for
        // a bad key is this server's misconfiguration, not the caller's fault,
        // and telling a client "forbidden" would send it to re-authenticate.
        tracing::warn!(status = %response.status(), endpoint, "tenor rejected the request");
        return Err(ApiError::Unavailable(
            "GIF search is temporarily unavailable".to_owned(),
        ));
    }

    let body: TenorResponse = response.json().await.map_err(|error| {
        tracing::warn!(%error, endpoint, "tenor sent an unreadable body");
        ApiError::Unavailable("GIF search is temporarily unavailable".to_owned())
    })?;

    Ok(GifPage {
        results: body.results.into_iter().filter_map(narrow).collect(),
        next: body.next.filter(|next| !next.is_empty()),
    })
}

/// One Tenor result, or nothing if it carries no usable GIF.
///
/// Dropped rather than defaulted: a result with no image is a hole in the grid
/// either way, and a broken `<img>` is the worse of the two.
fn narrow(result: TenorResult) -> Option<GifView> {
    let formats = result.media_formats;
    let full = formats.gif.or(formats.mediumgif)?;
    let preview = formats
        .tinygif
        .or(formats.nanogif)
        .map(|media| media.url)
        .unwrap_or_else(|| full.url.clone());

    Some(GifView {
        id: result.id,
        description: result.content_description,
        preview_url: preview,
        width: full.dims.first().copied().unwrap_or(0),
        height: full.dims.get(1).copied().unwrap_or(0),
        url: full.url,
    })
}

/// Clamp rather than reject: an out-of-range page size is a client bug that
/// should still return GIFs.
fn clamp_limit(requested: Option<u32>) -> u32 {
    requested.unwrap_or(LIMIT_DEFAULT).clamp(1, LIMIT_MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_sizes_are_clamped_not_rejected() {
        assert_eq!(clamp_limit(None), LIMIT_DEFAULT);
        assert_eq!(clamp_limit(Some(0)), 1);
        assert_eq!(clamp_limit(Some(9_999)), LIMIT_MAX);
        assert_eq!(clamp_limit(Some(12)), 12);
    }

    #[test]
    fn a_result_without_artwork_is_dropped() {
        let empty = TenorResult {
            id: "1".to_owned(),
            content_description: "nothing".to_owned(),
            media_formats: TenorFormats::default(),
        };
        assert!(narrow(empty).is_none());
    }

    #[test]
    fn the_preview_falls_back_to_the_full_image() {
        let result = TenorResult {
            id: "1".to_owned(),
            content_description: "a cat".to_owned(),
            media_formats: TenorFormats {
                gif: Some(TenorMedia {
                    url: "https://media.tenor.com/cat.gif".to_owned(),
                    dims: vec![480, 270],
                }),
                mediumgif: None,
                tinygif: None,
                nanogif: None,
            },
        };

        let view = narrow(result).expect("a usable result");
        assert_eq!(view.preview_url, view.url);
        assert_eq!((view.width, view.height), (480, 270));
    }
}
