//! The Backend-for-Frontend composition layer.
//!
//! Every handler here answers one *screen* rather than one *table*: it fans out
//! across the services the screen needs and returns the whole graph in a single
//! round-trip, so the client never walks a request waterfall.
//!
//! The composition is an implementation detail — nothing in the URL says "bff".
//! Each view hangs off the resource it describes (`/me/overview`,
//! `/communities/{id}/overview`, `/rooms/{id}/session`) and is a first-class
//! part of the public API surface, versioned and documented like any other
//! endpoint.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use genzh_domain::community::Community;
use genzh_domain::room::{RoomParticipant, RoomType};
use genzh_domain::social::Friendship;
use genzh_domain::{CommunityId, Room, RoomId, UserId};
use genzh_room::MediaJoinResponse;
use serde::Serialize;

use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::oauth;
use crate::routes::auth::UserResponse;
use crate::routes::communities::{CommunityResponse, MemberView, RoleView};
use crate::routes::messages::{HistoryResponse, MessageView};
use crate::routes::oauth::{AuthConfigResponse, OAuthProvidersConfig};
use crate::routes::rooms::{RoomResponse, UserRoomResponse};
use crate::state::AppState;

/// How many messages a fresh room session opens with.
const SESSION_HISTORY_LIMIT: i64 = 50;

/// How many members a community overview carries.
const OVERVIEW_MEMBER_LIMIT: i64 = 100;

/// Everything the application shell needs to render for the signed-in user.
#[derive(Debug, Serialize)]
pub struct MeOverviewResponse {
    /// The authenticated user account.
    pub me: UserResponse,
    /// Communities the user is a member of.
    pub communities: Vec<Community>,
    /// User's active rooms and direct messages.
    pub rooms: Vec<UserRoomResponse>,
    /// Accepted friend IDs.
    pub friends: Vec<UserId>,
    /// Friend IDs that are currently online.
    pub online_friends: Vec<UserId>,
    /// Number of incoming friend requests.
    pub pending_requests_count: usize,
    /// Unread notification count.
    pub unread_notifications: i64,
    /// Auth and OAuth configuration.
    pub config: AuthConfigResponse,
}

/// A community and everything its screen renders.
#[derive(Debug, Serialize)]
pub struct CommunityOverviewResponse {
    /// Community metadata and caller's permissions.
    pub community: CommunityResponse,
    /// All channels/rooms inside this community.
    pub rooms: Vec<Room>,
    /// Member list with roles.
    pub members: Vec<MemberView>,
    /// Defined roles and permission sets.
    pub roles: Vec<RoleView>,
}

/// An opened room session: the room, who is in it, what was said, and — for a
/// media room — the credentials to start streaming.
#[derive(Debug, Serialize)]
pub struct RoomSessionResponse {
    /// Room details, caller's permissions, and anonymous persona.
    pub room: RoomResponse,
    /// Current participants in the room.
    pub participants: Vec<RoomParticipant>,
    /// Initial page of message history.
    pub recent_messages: HistoryResponse,
    /// SFU / WebRTC media token if voice/video/stage room.
    pub media_session: Option<MediaJoinResponse>,
}

/// The caller's social graph in one payload.
#[derive(Debug, Serialize)]
pub struct SocialOverviewResponse {
    /// Accepted friend IDs.
    pub friends: Vec<UserId>,
    /// Online friend IDs.
    pub online_friends: Vec<UserId>,
    /// Incoming friend requests awaiting response.
    pub incoming_requests: Vec<Friendship>,
    /// Outgoing friend requests sent by user.
    pub outgoing_requests: Vec<Friendship>,
    /// User IDs blocked by the user.
    pub blocked: Vec<UserId>,
}

/// `GET /api/v1/me/overview`
///
/// Everything the app shell needs to boot, in one round-trip.
pub async fn me_overview(
    current: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<MeOverviewResponse>> {
    let user_id = current.user_id;

    // 1. User profile
    let user = state.auth.current_user(user_id).await?;

    // 2. Communities
    let communities = state.communities.list_for_user(user_id).await?;

    // 3. User's rooms & DMs
    let raw_rooms = state.directory.for_user(user_id).await?;
    let peers = state.directs.peers(user_id, &raw_rooms).await?;
    let rooms = raw_rooms
        .into_iter()
        .map(|room| UserRoomResponse {
            dm_peer_id: peers.get(&room.id).copied(),
            room,
        })
        .collect();

    // 4. Friends & Presence
    let friends = state.social.friends(user_id).await?;
    let online_set = state.presence.online().await?;
    let online_friends = friends
        .iter()
        .copied()
        .filter(|id| online_set.contains(id))
        .collect();

    // 5. Pending requests
    let pending_incoming = state.social.pending_requests(user_id).await?;
    let pending_requests_count = pending_incoming.len();

    // 6. Unread notifications
    let unread_notifications = state.notifications.unread_count(user_id).await?;

    // 7. Auth config
    let configured = |key: &str| {
        oauth::provider(key).is_some_and(|provider| provider.credentials(&state.config).is_some())
    };
    let config = AuthConfigResponse {
        app_env: state.config.app_env.clone(),
        allow_password_signup: state.config.allow_password_signup,
        oauth_providers: OAuthProvidersConfig {
            google: configured("google"),
            discord: configured("discord"),
        },
    };

    let platform_role = state.staff.role_of(user_id).await?;

    Ok(Json(MeOverviewResponse {
        me: UserResponse {
            id: user.user.id,
            handle: user.user.handle,
            email: user.user.email,
            profile: user.profile,
            platform_role,
        },
        communities,
        rooms,
        friends,
        online_friends,
        pending_requests_count,
        unread_notifications,
        config,
    }))
}

/// `GET /api/v1/communities/{id}/overview`
///
/// The community, its rooms, its members and its roles, in one round-trip.
pub async fn community_overview(
    current: CurrentUser,
    State(state): State<AppState>,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<CommunityOverviewResponse>> {
    let user_id = current.user_id;

    // 1. Community + Permissions
    let context = state
        .communities
        .member_context(community_id, user_id)
        .await?;
    let community = state.communities.get(community_id, user_id).await?;

    // 2. Rooms inside community
    let rooms = state.rooms.list(community_id, user_id).await?;

    // 3. Members with roles
    let raw_members = state
        .communities
        .list_members_with_roles(community_id, user_id, OVERVIEW_MEMBER_LIMIT)
        .await?;
    let members = raw_members.into_iter().map(MemberView::from).collect();

    // 4. Roles
    let raw_roles = state.roles.list(community_id, user_id).await?;
    let roles = raw_roles.into_iter().map(RoleView::from).collect();

    Ok(Json(CommunityOverviewResponse {
        community: CommunityResponse {
            community,
            your_permissions: context.permissions.to_permissions(),
        },
        rooms,
        members,
        roles,
    }))
}

/// `POST /api/v1/rooms/{id}/session`
///
/// Opens a session in the room: joins it, then returns metadata, participants,
/// the first page of history and — for a media room — a freshly minted SFU
/// token.
///
/// This is a POST rather than a GET because it is not a safe read: opening a
/// session enters the room, and in a media room it issues a credential.
/// Reading a room without opening it stays on `GET /api/v1/rooms/{id}` and its
/// sibling endpoints.
///
/// The join is part of the composition rather than a call the client makes
/// first. Presence and the anonymous persona are established by joining, so a
/// session that did not join would hand back a participant list the caller is
/// missing from and a persona that does not exist yet — and the client would
/// have to spend a second round-trip fixing both, which is the waterfall this
/// layer exists to remove. `join` is idempotent, so re-opening a session in a
/// room you are already in only refreshes `last_seen_at`.
pub async fn open_room_session(
    current: CurrentUser,
    State(state): State<AppState>,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<RoomSessionResponse>> {
    let user_id = current.user_id;

    // 1. Join, which mints the persona, then read back permissions.
    let (_, anonymous_identity) = state.rooms.join(room_id, user_id).await?;
    let access = state.rooms.visible_access(room_id, user_id).await?;

    // The room is now somewhere they already are, so it should stop being
    // offered to them — the same bookkeeping `POST /rooms/{id}/join` does.
    state.recommend.forget(user_id.into());

    // 2. Participants, listed after the join so the caller is in their own roster.
    let participants = state.rooms.list_participants(room_id).await?;

    // 3. Recent messages
    let page = state
        .messaging
        .history(room_id, user_id, None, None, Some(SESSION_HISTORY_LIMIT))
        .await?;

    let ids: Vec<_> = page.messages.iter().map(|m| m.id).collect();
    let mut reactions = state
        .messaging
        .reactions_for(room_id, user_id, &ids)
        .await?;

    let mut anon_identities = HashMap::new();
    for msg in &page.messages {
        if msg.is_anonymous
            && !anon_identities.contains_key(&msg.author_id)
            && let Ok(Some(ident)) = state
                .rooms
                .get_anonymous_identity(room_id, msg.author_id)
                .await
        {
            anon_identities.insert(msg.author_id, ident);
        }
    }

    let messages = page
        .messages
        .into_iter()
        .map(|message| {
            let anon = if message.is_anonymous {
                anon_identities.get(&message.author_id).cloned()
            } else {
                None
            };
            MessageView {
                reactions: reactions.remove(&message.id).unwrap_or_default(),
                anonymous_author: anon,
                message,
            }
        })
        .collect();

    let recent_messages = HistoryResponse {
        messages,
        next_before: page.next_before,
        next_before_id: page.next_before_id,
    };

    // 4. Media credentials, for a media room only
    let media_session = match access.room.room_type {
        RoomType::Voice | RoomType::Video | RoomType::Stage | RoomType::Activity => {
            let user = state.auth.current_user(user_id).await?;
            let session = state
                .media
                .join(room_id, user_id, user.profile.display_name)
                .await?;
            Some(session)
        }
        _ => None,
    };

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(user_id),
                genzh_domain::audit::AuditAction::RoomJoined,
                format!("User opened a session in room {}", room_id),
            )
            .about("room", room_id.as_uuid()),
        )
        .await;

    Ok(Json(RoomSessionResponse {
        room: RoomResponse {
            room: access.room,
            your_permissions: access.permissions.to_permissions(),
            anonymous_identity,
        },
        participants,
        recent_messages,
        media_session,
    }))
}

/// `GET /api/v1/me/social`
///
/// Friends, presence, pending requests in both directions, and the blocklist —
/// the five calls the social screen used to make, as one.
pub async fn social_overview(
    current: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<SocialOverviewResponse>> {
    let user_id = current.user_id;

    let friends = state.social.friends(user_id).await?;
    let online_set = state.presence.online().await?;
    let online_friends = friends
        .iter()
        .copied()
        .filter(|id| online_set.contains(id))
        .collect();

    let incoming_requests = state.social.pending_requests(user_id).await?;
    let outgoing_requests = state.social.sent_requests(user_id).await?;
    let blocked = state.social.blocked(user_id).await?;

    Ok(Json(SocialOverviewResponse {
        friends,
        online_friends,
        incoming_requests,
        outgoing_requests,
        blocked,
    }))
}
