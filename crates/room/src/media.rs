//! Issuing LiveKit sessions.
//!
//! This is the handover from the control plane to LiveKit, and it is the only
//! place the two touch.
//!
//! ```text
//!   POST /api/v1/rooms/:id/media/join
//!         │
//!         ├─ 1. authenticated?            (middleware, before we get here)
//!         ├─ 2. room exists?              ─┐
//!         ├─ 3. member of the community?   │  one call to RoomService::access
//!         ├─ 4. can view the room?        ─┘
//!         ├─ 5. is it even a media room?
//!         ├─ 6. fold speak / video / screen-share into LiveKit grants
//!         └─ 7. sign a LiveKit access token
//!         ▼
//!   { media_url, token, participant_id, expires_at }
//! ```
//!
//! Steps 2–6 are database work that happens **once per join**, not once per
//! packet. After this, LiveKit needs no database at all — it verifies the
//! token's signature locally, the same HS256 secret this process signed with.

use genzh_domain::{Permission, PermissionSet, RoomId, UserId};
use genzh_infrastructure::{ServiceError, ServiceResult};

use crate::service::RoomService;

/// What the client gets back from a successful media join.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MediaJoinResponse {
    /// The room joined.
    pub room_id: RoomId,
    /// The LiveKit participant identity for this session — the joining
    /// user's id, so a reconnect from the same account replaces rather than
    /// duplicates.
    pub participant_id: String,
    /// WebSocket URL of the LiveKit server.
    pub media_url: String,
    /// The signed LiveKit access token.
    pub token: String,
    /// When the token stops being accepted.
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Translate control-plane permissions into a LiveKit video grant.
///
/// One function, one place to audit. Everything LiveKit is allowed to believe
/// about a participant comes from here.
fn livekit_grant(room_id: RoomId, permissions: PermissionSet) -> serde_json::Value {
    let can_publish_audio = permissions.allows(Permission::Speak);
    let can_publish_video = permissions.allows(Permission::UseVideo);
    let can_publish_data = permissions.allows(Permission::ScreenShare);
    let can_publish = can_publish_audio || can_publish_video || can_publish_data;
    let can_subscribe = permissions.allows(Permission::ViewRoom);

    serde_json::json!({
        "room": room_id.as_uuid().to_string(),
        "roomJoin": true,
        "canPublish": can_publish,
        "canSubscribe": can_subscribe,
        "canPublishData": can_publish_data,
    })
}

/// Signs LiveKit access tokens.
///
/// LiveKit tokens are HS256 JWTs signed with the project's API secret — no
/// SDK dependency is needed, only `jsonwebtoken`.
#[derive(Debug)]
pub struct LiveKitTokenGenerator {
    api_key: String,
    api_secret: String,
}

impl LiveKitTokenGenerator {
    /// Build a generator from a LiveKit project's API key and secret.
    pub fn new(api_key: impl Into<String>, api_secret: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            api_secret: api_secret.into(),
        }
    }

    /// Sign an access token for `user_id` to join `room_id` with `permissions`.
    fn issue(
        &self,
        room_id: RoomId,
        user_id: UserId,
        display_name: &str,
        permissions: PermissionSet,
        ttl_seconds: i64,
    ) -> ServiceResult<LiveKitToken> {
        #[derive(serde::Serialize)]
        struct Claims {
            iss: String,
            sub: String,
            exp: i64,
            iat: i64,
            nbf: i64,
            name: String,
            video: serde_json::Value,
        }

        let now = chrono::Utc::now();
        let expires_at = now + chrono::Duration::seconds(ttl_seconds);

        let claims = Claims {
            iss: self.api_key.clone(),
            sub: user_id.as_uuid().to_string(),
            exp: expires_at.timestamp(),
            iat: now.timestamp(),
            nbf: now.timestamp(),
            name: display_name.to_owned(),
            video: livekit_grant(room_id, permissions),
        };

        let key = jsonwebtoken::EncodingKey::from_secret(self.api_secret.as_bytes());
        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &key,
        )
        .map_err(|error| {
            tracing::error!(%error, "failed to sign LiveKit token");
            ServiceError::Domain(genzh_domain::DomainError::invalid(
                "media",
                "could not issue a media token",
            ))
        })?;

        Ok(LiveKitToken { token, expires_at })
    }
}

/// A signed LiveKit access token and when it stops being valid.
#[derive(Debug, Clone)]
pub struct LiveKitToken {
    /// The signed JWT.
    pub token: String,
    /// When the token stops being accepted.
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Authorises media joins and mints LiveKit tokens.
pub struct MediaSessionService {
    rooms: RoomService,
    generator: std::sync::Arc<LiveKitTokenGenerator>,
    /// The WebSocket URL a *browser* dials — not necessarily the same address
    /// this process reaches LiveKit's admin API on.
    media_url: String,
    token_ttl_seconds: i64,
}

impl std::fmt::Debug for MediaSessionService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaSessionService")
            .field("media_url", &self.media_url)
            .finish_non_exhaustive()
    }
}

impl MediaSessionService {
    /// Assemble the service.
    pub fn new(
        rooms: RoomService,
        generator: std::sync::Arc<LiveKitTokenGenerator>,
        media_url: String,
        token_ttl_seconds: i64,
    ) -> Self {
        Self {
            rooms,
            generator,
            media_url,
            token_ttl_seconds,
        }
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

        if !access.permissions.allows(Permission::ViewRoom) {
            // Belt and braces: `require_visible` already covers this, but a
            // token must never be issued without at least subscribe access.
            return Err(ServiceError::denied("view_room"));
        }

        let token = self.generator.issue(
            room_id,
            user_id,
            &display_name,
            access.permissions,
            self.token_ttl_seconds,
        )?;

        tracing::info!(
            %room_id,
            %user_id,
            "media session authorised"
        );

        Ok(MediaJoinResponse {
            room_id,
            participant_id: user_id.as_uuid().to_string(),
            media_url: self.media_url.clone(),
            token: token.token,
            expires_at: token.expires_at,
        })
    }

    /// Note that a client is leaving.
    ///
    /// LiveKit is the authority on who is connected — it owns the peer
    /// connections — so this is bookkeeping and a place to hang future
    /// presence updates, not a teardown. Closing the WebSocket is what
    /// actually ends a session, and it works even when the client crashes.
    pub async fn leave(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<()> {
        let access = self.rooms.visible_access(room_id, user_id).await?;
        access.room.require_media()?;
        tracing::info!(%room_id, %user_id, "media session release recorded");
        Ok(())
    }

    /// Is LiveKit configured? Used by `GET /ready`.
    pub fn is_configured(&self) -> bool {
        !self.media_url.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generator() -> LiveKitTokenGenerator {
        LiveKitTokenGenerator::new("test-key", "test-secret-at-least-32-bytes-long")
    }

    #[test]
    fn a_listener_may_subscribe_and_nothing_else() {
        let grant = livekit_grant(RoomId::new(), PermissionSet::VIEW_ROOM);
        assert_eq!(grant["canSubscribe"], true);
        assert_eq!(grant["canPublish"], false);
    }

    #[test]
    fn a_plain_member_may_publish_audio_and_video_but_not_data() {
        let grant = livekit_grant(RoomId::new(), PermissionSet::default_member());
        assert_eq!(grant["canSubscribe"], true);
        assert_eq!(grant["canPublish"], true);
        assert_eq!(grant["canPublishData"], false);
    }

    #[test]
    fn no_permissions_means_no_grants() {
        let grant = livekit_grant(RoomId::new(), PermissionSet::empty());
        assert_eq!(grant["canSubscribe"], false);
        assert_eq!(grant["canPublish"], false);
        assert_eq!(grant["canPublishData"], false);
    }

    #[test]
    fn control_plane_permissions_do_not_leak_into_the_media_plane() {
        // Managing roles has nothing to do with media and must not appear.
        let grant = livekit_grant(
            RoomId::new(),
            PermissionSet::MANAGE_ROLES | PermissionSet::MANAGE_COMMUNITY | PermissionSet::MANAGE_ROOM,
        );
        assert_eq!(grant["canSubscribe"], false);
        assert_eq!(grant["canPublish"], false);
    }

    #[test]
    fn a_signed_token_carries_the_expected_claims() {
        let generator = generator();
        let room_id = RoomId::new();
        let user_id = UserId::new();

        let token = generator
            .issue(room_id, user_id, "Ada", PermissionSet::default_member(), 3600)
            .expect("token signs");

        let key = jsonwebtoken::DecodingKey::from_secret(b"test-secret-at-least-32-bytes-long");
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.set_required_spec_claims(&["exp"]);
        let decoded = jsonwebtoken::decode::<serde_json::Value>(&token.token, &key, &validation)
            .expect("token verifies with the same secret");

        assert_eq!(decoded.claims["iss"], "test-key");
        assert_eq!(decoded.claims["sub"], user_id.as_uuid().to_string());
        assert_eq!(decoded.claims["name"], "Ada");
        assert_eq!(
            decoded.claims["video"]["room"],
            room_id.as_uuid().to_string()
        );
    }

    #[test]
    fn a_tampered_secret_fails_verification() {
        let generator = generator();
        let token = generator
            .issue(
                RoomId::new(),
                UserId::new(),
                "Ada",
                PermissionSet::default_member(),
                3600,
            )
            .expect("token signs");

        let key = jsonwebtoken::DecodingKey::from_secret(b"wrong-secret-at-least-32-bytes-long");
        let validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        assert!(jsonwebtoken::decode::<serde_json::Value>(&token.token, &key, &validation).is_err());
    }
}
