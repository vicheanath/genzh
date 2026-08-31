//! GIF search, proxied to GIPHY.
//!
//! The API sits in front of GIPHY for two reasons. The key stays server-side —
//! shipping it to a browser publishes it — and the response is narrowed to the
//! handful of fields a picker draws. GIPHY's `images` object carries about
//! thirty renditions of every result; forwarding it whole would make the picker
//! an order of magnitude more bytes than it needs to be, over a connection that
//! is usually a phone's.
//!
//! Nothing is cached here. GIPHY's own CDN serves the images, and search
//! results are a person typing — by the time a cache helped, they have typed
//! something else.

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// GIPHY's v1 base. No trailing slash.
const GIPHY_BASE: &str = "https://api.giphy.com/v1/gifs";

/// How many results one page may hold.
///
/// GIPHY's own ceiling is 50. The picker asks for far fewer; the clamp exists
/// so a client cannot turn one keystroke into the maximum request.
const LIMIT_MAX: u32 = 50;
/// Page size when the client does not ask for one.
const LIMIT_DEFAULT: u32 = 24;

/// GIPHY's content rating filter, at its strictest.
///
/// `g` is the only defensible setting for a product with teenage users. The
/// alternative is moderating an image search by hand.
const RATING: &str = "g";

/// How long to wait on GIPHY before giving up.
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
    /// Cursor from a previous response's `next`.
    #[serde(default)]
    pub pos: Option<String>,
}

/// `GET /api/v1/gifs/trending` query.
#[derive(Debug, Deserialize)]
pub struct TrendingQuery {
    /// Page size.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Cursor from a previous response's `next`.
    #[serde(default)]
    pub pos: Option<String>,
}

/// One GIF, reduced to what a picker draws.
#[derive(Debug, Serialize)]
pub struct GifView {
    /// GIPHY's id for the result.
    pub id: String,
    /// Alt text. GIPHY's `title`, which is why it reads like a caption rather
    /// than a filename.
    pub description: String,
    /// The GIF that gets posted into the room.
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
    /// Cursor for the next page, or `null` at the end.
    ///
    /// Opaque to clients on purpose. It happens to be a numeric offset, because
    /// that is how GIPHY pages, but nothing outside this module may rely on
    /// that — the previous implementation proxied a provider whose cursor was
    /// an opaque token, and the client contract survived the swap precisely
    /// because it never looked inside.
    pub next: Option<String>,
}

// ── GIPHY's wire shape ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GiphyResponse {
    #[serde(default)]
    data: Vec<GiphyResult>,
    #[serde(default)]
    pagination: Option<GiphyPagination>,
}

#[derive(Debug, Deserialize)]
struct GiphyResult {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    images: GiphyImages,
}

/// Where GIPHY says it is in the result set.
#[derive(Debug, Deserialize)]
struct GiphyPagination {
    #[serde(default)]
    total_count: i64,
    #[serde(default)]
    count: i64,
    #[serde(default)]
    offset: i64,
}

/// The renditions this proxy actually uses.
///
/// Everything else GIPHY sends is ignored by omission — serde drops unknown
/// fields, so a new rendition appearing upstream costs nothing here.
#[derive(Debug, Default, Deserialize)]
struct GiphyImages {
    /// Full-size. Can be several megabytes.
    #[serde(default)]
    original: Option<GiphyMedia>,
    /// Capped at 5MB, which is what makes it the better thing to post.
    #[serde(default)]
    downsized_medium: Option<GiphyMedia>,
    /// Grid previews, in preference order.
    #[serde(default)]
    fixed_width: Option<GiphyMedia>,
    #[serde(default)]
    fixed_width_small: Option<GiphyMedia>,
}

/// One rendition.
///
/// `width` and `height` are strings on the wire — GIPHY sends `"480"`, not
/// `480` — so they are read as strings and parsed. Typing them as numbers
/// makes every single response fail to deserialize.
#[derive(Debug, Deserialize)]
struct GiphyMedia {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    width: Option<String>,
    #[serde(default)]
    height: Option<String>,
}

impl GiphyMedia {
    /// The dimension pair, with anything unparseable as zero.
    ///
    /// Zero is meaningful to the client: it means "no intrinsic size", and the
    /// grid falls back to a square cell rather than computing a ratio from a
    /// number it does not have.
    fn dims(&self) -> (u32, u32) {
        let read = |value: &Option<String>| {
            value
                .as_deref()
                .and_then(|raw| raw.parse::<u32>().ok())
                .unwrap_or(0)
        };
        (read(&self.width), read(&self.height))
    }
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

    let params = vec![
        ("q".to_owned(), term.to_owned()),
        ("limit".to_owned(), clamp_limit(query.limit).to_string()),
        ("offset".to_owned(), parse_offset(query.pos).to_string()),
        ("lang".to_owned(), "en".to_owned()),
    ];

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
    let params = vec![
        ("limit".to_owned(), clamp_limit(query.limit).to_string()),
        ("offset".to_owned(), parse_offset(query.pos).to_string()),
    ];

    fetch(&state, "trending", params).await.map(Json)
}

/// Ask GIPHY for one page and narrow the answer.
async fn fetch(
    state: &AppState,
    endpoint: &str,
    mut params: Vec<(String, String)>,
) -> ApiResult<GifPage> {
    let key = state.config.giphy_api_key.as_deref().ok_or_else(|| {
        // Not an internal error: the deployment is configured this way on
        // purpose, and the client's correct response is to hide the button
        // rather than to retry.
        ApiError::Unavailable("GIF search is not configured on this server".to_owned())
    })?;

    params.push(("api_key".to_owned(), key.to_owned()));
    params.push(("rating".to_owned(), RATING.to_owned()));

    let url = format!("{GIPHY_BASE}/{endpoint}");

    let response = state
        .http
        .get(&url)
        .query(&params)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, endpoint, "giphy request failed");
            ApiError::Unavailable("GIF search is temporarily unavailable".to_owned())
        })?;

    if !response.status().is_success() {
        // The status is logged and deliberately not forwarded: GIPHY's 403 for
        // a bad key is this server's misconfiguration, not the caller's fault,
        // and telling a client "forbidden" would send it to re-authenticate.
        tracing::warn!(status = %response.status(), endpoint, "giphy rejected the request");
        return Err(ApiError::Unavailable(
            "GIF search is temporarily unavailable".to_owned(),
        ));
    }

    let body: GiphyResponse = response.json().await.map_err(|error| {
        tracing::warn!(%error, endpoint, "giphy sent an unreadable body");
        ApiError::Unavailable("GIF search is temporarily unavailable".to_owned())
    })?;

    let next = body.pagination.as_ref().and_then(next_offset);

    Ok(GifPage {
        results: body.data.into_iter().filter_map(narrow).collect(),
        next,
    })
}

/// Where the next page starts, or `None` at the end of the results.
fn next_offset(pagination: &GiphyPagination) -> Option<String> {
    let next = pagination.offset + pagination.count;
    // `count` is how many came back in *this* page. Zero means the results are
    // exhausted, and without this check an empty page would hand back a cursor
    // pointing at itself — an infinite scroll that never ends and never grows.
    if pagination.count <= 0 || next >= pagination.total_count {
        return None;
    }
    Some(next.to_string())
}

/// One GIPHY result, or nothing if it carries no usable GIF.
///
/// Dropped rather than defaulted: a result with no image is a hole in the grid
/// either way, and a broken `<img>` is the worse of the two.
fn narrow(result: GiphyResult) -> Option<GifView> {
    let images = result.images;

    // The capped rendition first: `original` is occasionally tens of megabytes,
    // and that is the file every person in the room then downloads.
    let full = images.downsized_medium.or(images.original)?;
    let url = full.url.clone()?;
    let (width, height) = full.dims();

    let preview = images
        .fixed_width_small
        .or(images.fixed_width)
        .and_then(|media| media.url)
        .unwrap_or_else(|| url.clone());

    Some(GifView {
        id: result.id,
        description: result.title,
        url,
        preview_url: preview,
        width,
        height,
    })
}

/// Clamp rather than reject: an out-of-range page size is a client bug that
/// should still return GIFs.
fn clamp_limit(requested: Option<u32>) -> u32 {
    requested.unwrap_or(LIMIT_DEFAULT).clamp(1, LIMIT_MAX)
}

/// Read the cursor a client sent back, defaulting to the start.
///
/// An unparseable cursor is treated as the first page rather than refused: it
/// can only come from a client that mangled one of ours, and the first page is
/// a harmless answer to "I don't know where I was".
fn parse_offset(pos: Option<String>) -> u32 {
    pos.and_then(|raw| raw.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn media(url: &str, width: &str, height: &str) -> GiphyMedia {
        GiphyMedia {
            url: Some(url.to_owned()),
            width: Some(width.to_owned()),
            height: Some(height.to_owned()),
        }
    }

    #[test]
    fn page_sizes_are_clamped_not_rejected() {
        assert_eq!(clamp_limit(None), LIMIT_DEFAULT);
        assert_eq!(clamp_limit(Some(0)), 1);
        assert_eq!(clamp_limit(Some(9_999)), LIMIT_MAX);
        assert_eq!(clamp_limit(Some(12)), 12);
    }

    #[test]
    fn cursors_round_trip_and_survive_nonsense() {
        assert_eq!(parse_offset(None), 0);
        assert_eq!(parse_offset(Some("48".to_owned())), 48);
        assert_eq!(parse_offset(Some("  48 ".to_owned())), 48);
        assert_eq!(parse_offset(Some("not a number".to_owned())), 0);
        assert_eq!(parse_offset(Some("-5".to_owned())), 0);
    }

    #[test]
    fn dimensions_are_parsed_from_giphys_strings() {
        assert_eq!(media("u", "480", "270").dims(), (480, 270));
        // The whole reason `dims` exists rather than a serde number type.
        assert_eq!(media("u", "", "").dims(), (0, 0));
        assert_eq!(media("u", "wide", "tall").dims(), (0, 0));
    }

    #[test]
    fn a_result_without_artwork_is_dropped() {
        let empty = GiphyResult {
            id: "1".to_owned(),
            title: "nothing".to_owned(),
            images: GiphyImages::default(),
        };
        assert!(narrow(empty).is_none());
    }

    #[test]
    fn the_capped_rendition_is_preferred_over_the_original() {
        let result = GiphyResult {
            id: "1".to_owned(),
            title: "a cat".to_owned(),
            images: GiphyImages {
                original: Some(media("https://media.giphy.com/huge.gif", "1920", "1080")),
                downsized_medium: Some(media("https://media.giphy.com/small.gif", "480", "270")),
                fixed_width: None,
                fixed_width_small: None,
            },
        };

        let view = narrow(result).expect("a usable result");
        assert_eq!(view.url, "https://media.giphy.com/small.gif");
        assert_eq!((view.width, view.height), (480, 270));
        // No preview rendition, so it falls back to the image itself.
        assert_eq!(view.preview_url, view.url);
    }

    #[test]
    fn the_last_page_reports_no_cursor() {
        let more = GiphyPagination {
            total_count: 100,
            count: 24,
            offset: 0,
        };
        assert_eq!(next_offset(&more), Some("24".to_owned()));

        let last = GiphyPagination {
            total_count: 30,
            count: 6,
            offset: 24,
        };
        assert_eq!(next_offset(&last), None);

        // An empty page must not hand back a cursor pointing at itself.
        let empty = GiphyPagination {
            total_count: 100,
            count: 0,
            offset: 24,
        };
        assert_eq!(next_offset(&empty), None);
    }
}
