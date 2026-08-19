//! Short-lived media tokens.
//!
//! ## The trust boundary
//!
//! ```text
//!   client ──POST /rooms/:id/media/join──▶ API ──(db: member? role? speak?)──▶ PostgreSQL
//!                                          │
//!                                          │ mints a signed, 2-minute token
//!                                          ▼
//!   client ──ws /ws/media { token } ─────▶ media server ── verify HMAC locally ──▶ admit
//! ```
//!
//! The media server has **no** database credentials and never calls the API on
//! the join path. Everything it needs to make an admission decision is inside
//! the token, and the signature is what makes those statements trustworthy.
//!
//! Three properties matter:
//!
//! 1. **Short lifetime.** A token is a snapshot of an authorization decision.
//!    If a moderator revokes `speak` while somebody is connected, the fix is a
//!    signalling-level moderation event, not a long-lived token. Two minutes is
//!    enough to open a WebSocket and far too short to be worth stealing.
//! 2. **Room scoping.** A token names exactly one room. Presenting it on a
//!    different room is rejected even though the signature is perfectly valid.
//! 3. **Server-assigned participant id.** The client never chooses who it is.
//!
//! The signing secret is shared between the API and the media server
//! (`MEDIA_TOKEN_SECRET`). It is *not* the same secret as the user-facing JWT
//! secret: compromising one plane should not forge tokens for the other.

use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{MediaCoreError, MediaCoreResult};
use crate::permissions::MediaPermissions;
use crate::track::ParticipantId;

/// Version of the claims layout. Bump when a field's meaning changes so an old
/// media server refuses tokens it would otherwise misread.
pub const MEDIA_TOKEN_VERSION: u16 = 1;

/// Default lifetime of a media token.
pub const DEFAULT_TOKEN_TTL_SECONDS: i64 = 120;

/// The audience string every media token carries.
pub const MEDIA_AUDIENCE: &str = "social.media";

/// Claims carried by a media token.
///
/// Field names are short because this string travels in a WebSocket handshake
/// on mobile networks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaTokenClaims {
    /// Issuer — the API deployment that authorised this join.
    pub iss: String,
    /// Audience — always [`MEDIA_AUDIENCE`].
    pub aud: String,
    /// Subject — the authenticated `user_id`.
    pub sub: Uuid,
    /// Unique token id, so a future revocation list has something to name.
    pub jti: Uuid,
    /// Issued-at, seconds since the epoch.
    pub iat: i64,
    /// Not-before, seconds since the epoch.
    pub nbf: i64,
    /// Expiry, seconds since the epoch.
    pub exp: i64,
    /// Claims layout version, see [`MEDIA_TOKEN_VERSION`].
    pub v: u16,
    /// The one room this token admits its bearer to.
    pub room: Uuid,
    /// The community that owns the room, for logging and metrics only.
    pub community: Uuid,
    /// Server-assigned participant id for this session.
    pub pid: ParticipantId,
    /// What the bearer may do with media in this room.
    pub perms: MediaPermissions,
    /// Display name, so the media server can populate participant lists
    /// without a profile lookup.
    pub name: String,
}

impl MediaTokenClaims {
    /// Expiry as a timestamp.
    pub fn expires_at(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(self.exp, 0).unwrap_or_else(Utc::now)
    }

    /// Reject a token that was minted for a different room.
    ///
    /// A correctly signed token is still not a licence to enter *any* room;
    /// this check is what makes the room id in the URL untrusted input.
    pub fn require_room(&self, room_id: Uuid) -> MediaCoreResult<()> {
        if self.room == room_id {
            Ok(())
        } else {
            Err(MediaCoreError::TokenMismatch("room"))
        }
    }
}

/// Everything the API decided when it authorised a join.
#[derive(Debug, Clone)]
pub struct MediaGrant {
    /// Authenticated user.
    pub user_id: Uuid,
    /// Room being joined.
    pub room_id: Uuid,
    /// Community owning the room.
    pub community_id: Uuid,
    /// Participant id the API assigned.
    pub participant_id: ParticipantId,
    /// Resolved media capabilities.
    pub permissions: MediaPermissions,
    /// Display name to show in the room.
    pub display_name: String,
}

/// A minted token plus the metadata the client needs to use it.
#[derive(Debug, Clone, Serialize)]
pub struct MediaToken {
    /// The compact JWS.
    pub token: String,
    /// Participant id encoded inside it.
    pub participant_id: ParticipantId,
    /// When the token stops being accepted.
    pub expires_at: DateTime<Utc>,
}

/// A short, non-reversible fingerprint of a shared secret.
///
/// The API and the media server cannot check that they agree about
/// `MEDIA_TOKEN_SECRET` — they never talk to each other on the join path, which
/// is the whole design. But each can print *this* at startup, and two log lines
/// then answer "do these two processes share a secret?" in a second.
///
/// It is a truncated SHA-256: enough to compare two deployments, useless for
/// recovering the key. Never log the secret itself.
pub fn secret_fingerprint(secret: &[u8]) -> String {
    let digest = Sha256::digest(secret);
    digest.iter().take(4).map(|byte| format!("{byte:02x}")).collect()
}

/// Mints and verifies media tokens.
///
/// Both planes construct one of these from the same secret: the API only ever
/// calls [`MediaTokenSigner::issue`], the media server only ever calls
/// [`MediaTokenSigner::verify`].
pub struct MediaTokenSigner {
    encoding: EncodingKey,
    decoding: DecodingKey,
    validation: Validation,
    header: Header,
    issuer: String,
    ttl: Duration,
}

impl std::fmt::Debug for MediaTokenSigner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never let the key material near a log line.
        f.debug_struct("MediaTokenSigner")
            .field("issuer", &self.issuer)
            .field("ttl_seconds", &self.ttl.num_seconds())
            .finish_non_exhaustive()
    }
}

impl MediaTokenSigner {
    /// Build a signer from the shared secret.
    ///
    /// `ttl_seconds` is clamped to a sane band: a token that lives for hours
    /// defeats the point, and one that lives for a second cannot survive a
    /// mobile network handover between the HTTP call and the WebSocket.
    pub fn new(secret: &[u8], issuer: impl Into<String>, ttl_seconds: i64) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["exp", "nbf", "aud", "iss", "sub"]);
        validation.set_audience(&[MEDIA_AUDIENCE]);
        validation.validate_exp = true;
        validation.validate_nbf = true;
        // A few seconds of slack absorbs clock skew between the two
        // deployments without meaningfully extending the token's life.
        validation.leeway = 5;

        let issuer = issuer.into();
        validation.set_issuer(&[issuer.clone()]);

        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
            validation,
            header: Header::new(Algorithm::HS256),
            issuer,
            ttl: Duration::seconds(ttl_seconds.clamp(15, 600)),
        }
    }

    /// Token lifetime in seconds, after clamping.
    pub fn ttl_seconds(&self) -> i64 {
        self.ttl.num_seconds()
    }

    /// The configured issuer, for startup diagnostics.
    pub fn issuer(&self) -> &str {
        &self.issuer
    }

    /// Mint a token for an authorised join.
    pub fn issue(&self, grant: &MediaGrant) -> MediaCoreResult<MediaToken> {
        self.issue_at(grant, Utc::now())
    }

    /// [`MediaTokenSigner::issue`] with an explicit clock, for tests.
    pub fn issue_at(&self, grant: &MediaGrant, now: DateTime<Utc>) -> MediaCoreResult<MediaToken> {
        let expires_at = now + self.ttl;
        let claims = MediaTokenClaims {
            iss: self.issuer.clone(),
            aud: MEDIA_AUDIENCE.to_owned(),
            sub: grant.user_id,
            jti: Uuid::new_v4(),
            iat: now.timestamp(),
            nbf: now.timestamp(),
            exp: expires_at.timestamp(),
            v: MEDIA_TOKEN_VERSION,
            room: grant.room_id,
            community: grant.community_id,
            pid: grant.participant_id,
            perms: grant.permissions,
            name: grant.display_name.clone(),
        };

        let token = encode(&self.header, &claims, &self.encoding).map_err(MediaCoreError::Sign)?;

        Ok(MediaToken {
            token,
            participant_id: grant.participant_id,
            expires_at,
        })
    }

    /// Verify a token's signature, audience, issuer and lifetime.
    ///
    /// Returns the claims only if every check passes. Callers must still scope
    /// the token to the room being joined — see
    /// [`MediaTokenClaims::require_room`].
    pub fn verify(&self, token: &str) -> MediaCoreResult<MediaTokenClaims> {
        let data = decode::<MediaTokenClaims>(token, &self.decoding, &self.validation).map_err(
            |error| match error.kind() {
                // Expiry is the one rejection a client can act on by itself, so
                // it is the one rejection that gets its own variant.
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => MediaCoreError::ExpiredToken,
                _ => MediaCoreError::InvalidToken(error),
            },
        )?;

        if data.claims.v != MEDIA_TOKEN_VERSION {
            return Err(MediaCoreError::TokenMismatch("claims version"));
        }

        Ok(data.claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"a-shared-media-secret-at-least-32-bytes-long";

    fn signer() -> MediaTokenSigner {
        MediaTokenSigner::new(SECRET, "social.api", DEFAULT_TOKEN_TTL_SECONDS)
    }

    fn grant() -> MediaGrant {
        MediaGrant {
            user_id: Uuid::new_v4(),
            room_id: Uuid::new_v4(),
            community_id: Uuid::new_v4(),
            participant_id: ParticipantId::new(),
            permissions: MediaPermissions::SUBSCRIBE | MediaPermissions::PUBLISH_AUDIO,
            display_name: "Ada".into(),
        }
    }

    #[test]
    fn a_freshly_minted_token_verifies_and_round_trips_its_claims() {
        let signer = signer();
        let grant = grant();
        let minted = signer.issue(&grant).expect("issue");

        let claims = signer.verify(&minted.token).expect("verify");
        assert_eq!(claims.sub, grant.user_id);
        assert_eq!(claims.room, grant.room_id);
        assert_eq!(claims.pid, grant.participant_id);
        assert_eq!(claims.perms, grant.permissions);
        assert_eq!(claims.name, "Ada");
        assert_eq!(claims.v, MEDIA_TOKEN_VERSION);
        assert_eq!(minted.participant_id, grant.participant_id);
    }

    #[test]
    fn a_token_signed_with_another_secret_is_rejected() {
        let minted = signer().issue(&grant()).expect("issue");
        let impostor =
            MediaTokenSigner::new(b"a-completely-different-secret-value", "social.api", 120);
        assert!(impostor.verify(&minted.token).is_err());
    }

    #[test]
    fn an_expired_token_is_rejected() {
        let signer = signer();
        let long_ago = Utc::now() - Duration::hours(1);
        let minted = signer.issue_at(&grant(), long_ago).expect("issue");
        assert!(
            signer.verify(&minted.token).is_err(),
            "expired token must not verify"
        );
    }

    #[test]
    fn a_token_from_the_future_is_rejected() {
        let signer = signer();
        let later = Utc::now() + Duration::hours(1);
        let minted = signer.issue_at(&grant(), later).expect("issue");
        assert!(
            signer.verify(&minted.token).is_err(),
            "nbf in the future must not verify"
        );
    }

    #[test]
    fn a_token_for_another_room_is_rejected_even_though_it_is_signed() {
        let signer = signer();
        let grant = grant();
        let minted = signer.issue(&grant).expect("issue");
        let claims = signer.verify(&minted.token).expect("signature is fine");

        assert!(claims.require_room(grant.room_id).is_ok());
        let other_room = Uuid::new_v4();
        assert!(matches!(
            claims.require_room(other_room),
            Err(MediaCoreError::TokenMismatch("room"))
        ));
    }

    #[test]
    fn a_token_from_another_issuer_is_rejected() {
        let minted = MediaTokenSigner::new(SECRET, "someone.else", 120)
            .issue(&grant())
            .expect("issue");
        assert!(signer().verify(&minted.token).is_err());
    }

    #[test]
    fn tampering_with_the_payload_breaks_the_signature() {
        let signer = signer();
        let minted = signer.issue(&grant()).expect("issue");

        let mut parts: Vec<&str> = minted.token.split('.').collect();
        assert_eq!(parts.len(), 3, "compact JWS has three parts");
        // Flip a character in the payload segment.
        let payload = parts[1].to_owned();
        let mutated: String = payload
            .chars()
            .enumerate()
            .map(|(i, c)| {
                if i == 4 {
                    if c == 'A' { 'B' } else { 'A' }
                } else {
                    c
                }
            })
            .collect();
        parts[1] = &mutated;
        let forged = parts.join(".");

        assert!(signer.verify(&forged).is_err());
    }

    #[test]
    fn ttl_is_clamped_into_a_sane_band() {
        assert_eq!(MediaTokenSigner::new(SECRET, "i", 1).ttl_seconds(), 15);
        assert_eq!(
            MediaTokenSigner::new(SECRET, "i", 86_400).ttl_seconds(),
            600
        );
        assert_eq!(MediaTokenSigner::new(SECRET, "i", 120).ttl_seconds(), 120);
    }

    #[test]
    fn the_signer_never_prints_key_material() {
        let rendered = format!("{:?}", signer());
        assert!(
            !rendered.contains("secret"),
            "debug output leaked the secret"
        );
        assert!(rendered.contains("social.api"));
    }
}
