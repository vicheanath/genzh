//! Issuing media sessions.
//!
//! This is the handover from the control plane to the media plane, and it is
//! the only place the two touch.
//!
//! ```text
//!   POST /api/v1/rooms/:id/media/join
//!         │
//!         ├─ 1. authenticated?            (middleware, before we get here)
//!         ├─ 2. room exists?              ─┐
//!         ├─ 3. member of the community?   │  one call to RoomService::access
//!         ├─ 4. can view the room?        ─┘
//!         ├─ 5. is it even a media room?
//!         ├─ 6. fold speak / video / screen-share into media permissions
//!         ├─ 7. pick the media server that hosts this room
//!         └─ 8. sign a two-minute token
//!         ▼
//!   { media_url, token, participant_id, ice_servers }
//! ```
//!
//! Steps 2–6 are database work that happens **once per join**, not once per
//! packet. After this, the media server needs no database at all.

use social_domain::{Permission, PermissionSet, RoomId, UserId};
use social_infrastructure::{ServiceError, ServiceResult};
use social_media_core::ice::{IceConfig, IceServer};
use social_media_core::permissions::MediaPermissions;
use social_media_core::token::{MediaGrant, MediaTokenSigner};
use social_media_core::track::ParticipantId;

use crate::service::RoomService;

/// What the client gets back from a successful media join.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MediaJoinResponse {
    /// The room joined.
    pub room_id: RoomId,
    /// Server-assigned participant id for this session.
    pub participant_id: ParticipantId,
    /// WebSocket URL of the media server hosting this room.
    pub media_url: String,
    /// The signed media token.
    pub token: String,
    /// When the token stops being accepted.
    pub expires_at: chrono::DateTime<chrono::Utc>,
    /// ICE servers for both peer connections.
    pub ice_servers: Vec<IceServer>,
}

/// Chooses which media server hosts a room.
///
/// Every participant in a room **must** land on the same server — an SFU
/// forwards between peer connections it owns, so a room split across two
/// processes is two separate calls. That constraint, not load, is what drives
/// the selection strategy.
pub trait MediaServerSelector: Send + Sync {
    /// The WebSocket URL for `room_id`, or `None` if no server is configured.
    fn select(&self, room_id: RoomId) -> Option<String>;

    /// How many servers are configured, for the readiness endpoint.
    fn len(&self) -> usize;

    /// Are there no servers configured at all?
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A fixed list of media servers, addressed by hashing the room id.
///
/// Hashing rather than round-robin is what guarantees every participant of a
/// room reaches the same process. It is also stable: the same room maps to the
/// same server across API restarts, so a reconnecting client rejoins the
/// session it left.
///
/// The obvious limitation is that changing the list reshuffles rooms. That is
/// the point at which this should be replaced by a registry the media servers
/// register into — the trait boundary is here so that replacement touches one
/// implementation.
#[derive(Debug, Clone)]
pub struct StaticMediaServers {
    urls: Vec<String>,
}

impl StaticMediaServers {
    /// Build from a comma-separated list of WebSocket URLs.
    pub fn new(urls: impl IntoIterator<Item = String>) -> Self {
        Self {
            urls: urls
                .into_iter()
                .map(|url| url.trim().to_owned())
                .filter(|url| !url.is_empty())
                .collect(),
        }
    }

    /// Parse from an environment value like `ws://a:8081/ws/media,ws://b:8081/ws/media`.
    pub fn from_env_value(value: &str) -> Self {
        Self::new(value.split(',').map(str::to_owned))
    }
}

impl MediaServerSelector for StaticMediaServers {
    fn select(&self, room_id: RoomId) -> Option<String> {
        if self.urls.is_empty() {
            return None;
        }
        // The low 64 bits of a v4 UUID are uniformly random, which is all this
        // needs; a cryptographic hash would buy nothing.
        let bytes = room_id.as_uuid().into_bytes();
        let key = u64::from_be_bytes(bytes[8..16].try_into().unwrap_or([0; 8]));
        let index = (key % self.urls.len() as u64) as usize;
        self.urls.get(index).cloned()
    }

    fn len(&self) -> usize {
        self.urls.len()
    }
}

/// Translate control-plane permissions into the media plane's narrower set.
///
/// One function, one place to audit. Everything the media server is allowed to
/// believe about a participant comes from here.
pub fn media_permissions_from(permissions: PermissionSet) -> MediaPermissions {
    let mut media = MediaPermissions::empty();

    // The mapping is intentionally explicit rather than clever: a table like
    // this is readable in a security review, a bit-shuffling loop is not.
    if permissions.allows(Permission::ViewRoom) {
        media |= MediaPermissions::SUBSCRIBE;
    }
    if permissions.allows(Permission::Speak) {
        media |= MediaPermissions::PUBLISH_AUDIO;
    }
    if permissions.allows(Permission::UseVideo) {
        media |= MediaPermissions::PUBLISH_VIDEO;
    }
    if permissions.allows(Permission::ScreenShare) {
        media |= MediaPermissions::PUBLISH_SCREEN;
    }
    if permissions.allows(Permission::Stream) {
        media |= MediaPermissions::PUBLISH_STREAM;
    }
    if permissions.allows(Permission::MuteMembers) {
        media |= MediaPermissions::MODERATE_MUTE;
    }
    if permissions.allows(Permission::MoveMembers) {
        media |= MediaPermissions::MODERATE_MOVE;
    }

    media
}

/// Authorises media joins and mints tokens.
pub struct MediaSessionService {
    rooms: RoomService,
    signer: std::sync::Arc<MediaTokenSigner>,
    servers: std::sync::Arc<dyn MediaServerSelector>,
    ice: IceConfig,
}

impl std::fmt::Debug for MediaSessionService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaSessionService")
            .field("media_servers", &self.servers.len())
            .field("ice_servers", &self.ice.ice_servers.len())
            .finish_non_exhaustive()
    }
}

impl MediaSessionService {
    /// Assemble the service.
    pub fn new(
        rooms: RoomService,
        signer: std::sync::Arc<MediaTokenSigner>,
        servers: std::sync::Arc<dyn MediaServerSelector>,
        ice: IceConfig,
    ) -> Self {
        Self { rooms, signer, servers, ice }
    }

    /// Authorise a join and mint a token.
    ///
    /// `display_name` comes from the caller's profile, which the API has
    /// already loaded; passing it in keeps this service out of the identity
    /// context.
    pub async fn join(
        &self,
        room_id: RoomId,
        user_id: UserId,
        display_name: String,
    ) -> ServiceResult<MediaJoinResponse> {
        let access = self.rooms.visible_access(room_id, user_id).await?;
        access.room.require_media()?;

        let permissions = media_permissions_from(access.permissions);
        if !permissions.may_subscribe() {
            // Belt and braces: `require_visible` already covers this, but the
            // media token must never be issued without SUBSCRIBE.
            return Err(ServiceError::denied("view_room"));
        }

        let media_url = self
            .servers
            .select(room_id)
            .ok_or_else(|| ServiceError::not_found("media server"))?;

        let participant_id = ParticipantId::new();
        let grant = MediaGrant {
            user_id: user_id.as_uuid(),
            room_id: room_id.as_uuid(),
            community_id: access.room.community_id.as_uuid(),
            participant_id,
            permissions,
            display_name,
        };

        let token = self.signer.issue(&grant).map_err(|error| {
            tracing::error!(%error, %room_id, "failed to sign media token");
            ServiceError::Domain(social_domain::DomainError::invalid(
                "media",
                "could not issue a media token",
            ))
        })?;

        tracing::info!(
            %room_id,
            %user_id,
            %participant_id,
            permissions = permissions.bits(),
            "media session authorised"
        );

        Ok(MediaJoinResponse {
            room_id,
            participant_id,
            media_url,
            token: token.token,
            expires_at: token.expires_at,
            ice_servers: self.ice.ice_servers.clone(),
        })
    }

    /// Note that a client is leaving.
    ///
    /// The media server is the authority on who is connected — it owns the
    /// sockets — so this is bookkeeping and a place to hang future presence
    /// updates, not a teardown. Closing the WebSocket is what actually ends a
    /// session, and it works even when the client crashes.
    pub async fn leave(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<()> {
        let access = self.rooms.visible_access(room_id, user_id).await?;
        access.room.require_media()?;
        tracing::info!(%room_id, %user_id, "media session release recorded");
        Ok(())
    }

    /// ICE configuration, exposed so clients can pre-warm.
    pub fn ice_servers(&self) -> &[IceServer] {
        &self.ice.ice_servers
    }

    /// Are any media servers configured? Used by `GET /ready`.
    pub fn has_media_servers(&self) -> bool {
        !self.servers.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_listener_may_subscribe_and_nothing_else() {
        let media = media_permissions_from(PermissionSet::VIEW_ROOM);
        assert!(media.may_subscribe());
        assert!(!media.may_publish(social_media_core::track::TrackKind::Audio));
        assert!(!media.may_publish(social_media_core::track::TrackKind::Camera));
    }

    #[test]
    fn a_plain_member_may_speak_and_use_video_but_not_share_a_screen() {
        let media = media_permissions_from(PermissionSet::default_member());
        assert!(media.may_subscribe());
        assert!(media.may_publish(social_media_core::track::TrackKind::Audio));
        assert!(media.may_publish(social_media_core::track::TrackKind::Camera));
        assert!(!media.may_publish(social_media_core::track::TrackKind::ScreenShare));
        assert!(!media.contains(MediaPermissions::MODERATE_MUTE));
    }

    #[test]
    fn an_administrator_gets_every_media_capability() {
        let media = media_permissions_from(PermissionSet::ADMINISTRATOR);
        assert_eq!(media, MediaPermissions::all());
    }

    #[test]
    fn no_permissions_means_no_media_capabilities() {
        assert_eq!(media_permissions_from(PermissionSet::empty()), MediaPermissions::empty());
    }

    #[test]
    fn moderation_permissions_cross_the_boundary_individually() {
        let mute_only = media_permissions_from(PermissionSet::VIEW_ROOM | PermissionSet::MUTE_MEMBERS);
        assert!(mute_only.contains(MediaPermissions::MODERATE_MUTE));
        assert!(!mute_only.contains(MediaPermissions::MODERATE_MOVE));
    }

    #[test]
    fn control_plane_permissions_do_not_leak_into_the_media_plane() {
        // Managing roles has nothing to do with media and must not appear.
        let manager = media_permissions_from(
            PermissionSet::MANAGE_ROLES | PermissionSet::MANAGE_COMMUNITY | PermissionSet::MANAGE_ROOM,
        );
        assert_eq!(manager, MediaPermissions::empty());
    }

    #[test]
    fn every_participant_of_a_room_is_sent_to_the_same_media_server() {
        let servers = StaticMediaServers::from_env_value(
            "ws://media-a:8081/ws/media,ws://media-b:8081/ws/media,ws://media-c:8081/ws/media",
        );
        let room = RoomId::new();

        let chosen = servers.select(room).expect("a server");
        for _ in 0..100 {
            assert_eq!(servers.select(room).as_deref(), Some(chosen.as_str()));
        }
    }

    #[test]
    fn different_rooms_spread_across_the_configured_servers() {
        let servers = StaticMediaServers::from_env_value("ws://a/ws,ws://b/ws,ws://c/ws");
        let mut seen = std::collections::HashSet::new();
        for _ in 0..200 {
            if let Some(url) = servers.select(RoomId::new()) {
                seen.insert(url);
            }
        }
        assert_eq!(seen.len(), 3, "all three servers should be used");
    }

    #[test]
    fn no_configured_servers_yields_no_selection() {
        let servers = StaticMediaServers::from_env_value("");
        assert!(servers.is_empty());
        assert!(servers.select(RoomId::new()).is_none());
    }

    #[test]
    fn whitespace_and_empty_entries_are_ignored() {
        let servers = StaticMediaServers::from_env_value(" ws://a/ws , , ws://b/ws ");
        assert_eq!(servers.len(), 2);
        assert!(servers.select(RoomId::new()).is_some_and(|url| !url.contains(' ')));
    }
}
