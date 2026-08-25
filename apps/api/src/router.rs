//! The routing table.
//!
//! Note the path syntax: Axum 0.8 uses `{id}` rather than the older `:id`.
//! The URLs clients call are unchanged — `/api/v1/rooms/6f1c…/media/join` —
//! only the way the pattern is written differs.

use axum::Router;
use axum::routing::{delete, get, patch, post, put};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::middleware::propagate_request_id;
use crate::routes;
use crate::state::AppState;

/// Build the complete router.
pub fn build(state: AppState) -> Router {
    let max_body = state.config.max_body_bytes;
    let timeout = std::time::Duration::from_secs(state.config.request_timeout_seconds);
    let cors = cors_layer(&state.config.cors_allowed_origins);

    let api = Router::new()
        // ---- auth ----
        .route("/auth/config", get(routes::oauth::config))
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/refresh", post(routes::auth::refresh))
        .route("/auth/logout", post(routes::auth::logout))
        .route("/auth/oauth/{provider}/authorize", get(routes::oauth::authorize))
        .route("/auth/oauth/{provider}/callback", get(routes::oauth::callback))
        .route(
            "/me",
            get(routes::auth::me).patch(routes::auth::update_profile),
        )
        // Composite views: one round-trip for a whole screen (see routes::bff).
        .route("/me/overview", get(routes::bff::me_overview))
        .route("/me/social", get(routes::bff::social_overview))
        // ---- platform console ----
        //
        // Gated by extractor, not by path: `StaffUser` and `AdminUser` are
        // arguments to the handlers, so a route here cannot be added without
        // stating who may call it.
        .route("/admin/stats", get(routes::admin::stats))
        .route("/admin/audit", get(routes::admin::audit))
        .route("/admin/audit/actions", get(routes::admin::audit_actions))
        .route("/admin/staff", get(routes::admin::list_staff))
        .route("/admin/users", get(routes::admin::search_users))
        .route("/admin/users/{id}", get(routes::admin::get_user))
        .route("/admin/users/{id}/suspend", post(routes::admin::suspend_user))
        .route(
            "/admin/users/{id}/reinstate",
            post(routes::admin::reinstate_user),
        )
        .route(
            "/admin/users/{id}/platform-role",
            put(routes::admin::set_platform_role),
        )
        .route("/admin/tickets", get(routes::admin::list_tickets))
        .route(
            "/admin/tickets/{id}",
            get(routes::admin::get_ticket).patch(routes::admin::update_ticket),
        )
        .route(
            "/admin/tickets/{id}/messages",
            post(routes::admin::reply_to_ticket),
        )
        // ---- support, as the person who raised it sees it ----
        .route(
            "/support/tickets",
            get(routes::admin::my_tickets).post(routes::admin::open_ticket),
        )
        .route("/support/tickets/{id}", get(routes::admin::my_ticket))
        .route(
            "/support/tickets/{id}/messages",
            post(routes::admin::reply_to_my_ticket),
        )
        // ---- invite links ----
        .route(
            "/invites/{code}",
            get(routes::communities::preview_invite)
                .post(routes::communities::redeem_invite)
                .delete(routes::communities::revoke_invite),
        )
        // ---- communities ----
        .route(
            "/communities",
            get(routes::communities::list).post(routes::communities::create),
        )
        // Registered before `/communities/{id}` so the intent is obvious to a
        // reader; the router matches the literal segment first regardless.
        .route(
            "/communities/templates",
            get(routes::communities::templates),
        )
        .route(
            "/communities/{id}",
            get(routes::communities::get)
                .patch(routes::communities::update)
                .delete(routes::communities::delete),
        )
        .route(
            "/communities/{id}/overview",
            get(routes::bff::community_overview),
        )
        // ---- members ----
        .route(
            "/communities/{id}/members",
            get(routes::communities::list_members).post(routes::communities::add_member),
        )
        .route(
            "/communities/{id}/members/{user_id}",
            delete(routes::communities::remove_member),
        )
        .route(
            "/communities/{id}/members/{user_id}/roles",
            post(routes::communities::assign_role),
        )
        .route(
            "/communities/{id}/members/{user_id}/roles/{role_id}",
            delete(routes::communities::remove_role),
        )
        // ---- roles ----
        .route(
            "/communities/{id}/roles",
            get(routes::communities::list_roles).post(routes::communities::create_role),
        )
        .route(
            "/communities/{id}/roles/{role_id}",
            patch(routes::communities::update_role),
        )
        // ---- users ----
        .route("/users/{id}", get(routes::users::get))
        // ---- playground rooms & discovery ----
        .route(
            "/rooms",
            post(routes::rooms::create_standalone_room),
        )
        .route("/rooms/dm/{user_id}", post(routes::rooms::get_or_create_dm))
        .route("/rooms/discovery", get(routes::rooms::discovery))
        .route("/rooms/mine", get(routes::rooms::list_mine))
        .route("/rooms/trending", get(routes::rooms::trending))
        .route("/rooms/live", get(routes::rooms::live))
        .route("/rooms/random", get(routes::rooms::random_room))
        .route(
            "/communities/{id}/invites",
            get(routes::communities::list_invites).post(routes::communities::create_invite),
        )
        .route(
            "/communities/{id}/rooms",
            get(routes::rooms::list).post(routes::rooms::create_community_room),
        )
        .route(
            "/rooms/{id}",
            get(routes::rooms::get)
                .patch(routes::rooms::update)
                .delete(routes::rooms::delete),
        )
        .route("/rooms/{id}/session", post(routes::bff::open_room_session))
        .route("/rooms/{id}/join", post(routes::rooms::join))
        .route("/rooms/{id}/leave", post(routes::rooms::leave))
        .route("/rooms/{id}/persona", patch(routes::rooms::set_persona))
        .route("/rooms/{id}/participants", get(routes::rooms::participants))
        // ---- media ----
        .route("/rooms/{id}/media/join", post(routes::media::join))
        .route("/rooms/{id}/media/leave", post(routes::media::leave))
        // ---- direct calls ----
        .route("/rooms/{id}/call/ring", post(routes::media::ring))
        .route("/rooms/{id}/call/end", post(routes::media::end_call))
        // ---- messages ----
        .route(
            "/rooms/{id}/messages",
            get(routes::messages::list).post(routes::messages::post),
        )
        .route(
            "/messages/{id}",
            patch(routes::messages::edit).delete(routes::messages::delete),
        )
        .route(
            "/messages/{id}/pin",
            put(routes::messages::pin).delete(routes::messages::unpin),
        )
        .route("/rooms/{id}/pins", get(routes::messages::pins))
        .route("/search/messages", get(routes::messages::search))
        .route("/me/unread", get(routes::messages::unread))
        .route("/rooms/{id}/read", post(routes::messages::mark_read))
        .route("/rooms/{id}/mute", put(routes::messages::set_muted))
        .route(
            "/messages/{id}/reactions",
            put(routes::messages::react).delete(routes::messages::unreact),
        )
        // ---- social ----
        .route(
            "/friends",
            get(routes::social::list).post(routes::social::request),
        )
        .route("/friends/requests", get(routes::social::pending))
        .route("/friends/sent", get(routes::social::sent))
        .route("/friends/{user_id}", delete(routes::social::remove))
        .route("/friends/{user_id}/respond", post(routes::social::respond))
        .route("/presence", get(routes::presence::online))
        .route("/notifications", get(routes::notifications::list))
        .route("/notifications/read", post(routes::notifications::mark_all_read))
        .route(
            "/notifications/{id}/read",
            post(routes::notifications::mark_read),
        )
        .route("/blocks", get(routes::social::blocked))
        .route(
            "/blocks/{user_id}",
            put(routes::social::block).delete(routes::social::unblock),
        )
        // ---- real-time chat websocket ----
        .route("/ws", get(routes::ws::ws_handler));

    Router::new()
        // Health endpoints sit outside /api/v1 so probes never depend on the
        // API's versioning.
        .route("/health", get(routes::health::health))
        .route("/ready", get(routes::health::ready))
        .nest("/api/v1", api)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::rate_limit::enforce,
        ))
        .layer(axum::middleware::from_fn(propagate_request_id))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::GATEWAY_TIMEOUT,
            timeout,
        ))
        // Bounding the body before any handler sees it means a hostile client
        // cannot make the process allocate by streaming a huge JSON document.
        .layer(RequestBodyLimitLayer::new(max_body))
        .layer(cors)
        .with_state(state)
}

/// CORS policy.
///
/// An explicit origin list is the intended production setting. `*` is
/// permitted for local development, where a React Native metro bundler and a
/// browser both need in.
fn cors_layer(allowed: &str) -> CorsLayer {
    let base = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let origins: Vec<_> = allowed
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty() && *origin != "*")
        .filter_map(|origin| origin.parse::<axum::http::HeaderValue>().ok())
        .collect();

    if origins.is_empty() {
        base.allow_origin(Any)
    } else {
        base.allow_origin(origins)
    }
}
