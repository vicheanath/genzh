//! Verifying media tokens.
//!
//! This is the media server's entire authentication story, and its whole
//! trust boundary. The rules it enforces:
//!
//! 1. The token is signed with the shared secret and has not expired.
//! 2. It was issued by the configured API issuer for the media audience.
//! 3. It names the room the client claims to be joining.
//!
//! Nothing else about the client is believed. There is no lookup, no callback
//! to the API, and no database — which is exactly why admitting a participant
//! costs one HMAC.

use genzh_media_core::MediaCoreError;
use genzh_media_core::token::{MediaTokenClaims, MediaTokenSigner, secret_fingerprint};
use uuid::Uuid;

use crate::error::MediaError;

/// Verifies tokens presented on the signalling socket.
#[derive(Debug)]
pub struct TokenVerifier {
    signer: MediaTokenSigner,
    fingerprint: String,
}

impl TokenVerifier {
    /// Build from the shared secret and expected issuer.
    pub fn new(secret: &[u8], issuer: &str) -> Self {
        // The TTL argument is only used when *issuing*; the media server never
        // mints a token, it only checks the `exp` inside one.
        Self {
            fingerprint: secret_fingerprint(secret),
            signer: MediaTokenSigner::new(secret, issuer, 120),
        }
    }

    /// Fingerprint of the secret this verifier was built with.
    ///
    /// Printed once at startup so it can be compared against the API's without
    /// either process revealing — or even knowing — the other's key.
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    /// Verify a token and bind it to the room the client named.
    ///
    /// `claimed_room` comes from the client and is therefore untrusted; it is
    /// checked against the token rather than believed. A mismatch is a
    /// *forbidden*, not an *unauthorized*: the credential is genuine, it just
    /// does not open this door.
    pub fn verify(&self, token: &str, claimed_room: &str) -> Result<MediaTokenClaims, MediaError> {
        let claims = self.signer.verify(token).map_err(|error| {
            // An expired token is routine — clients hit it on a slow handover
            // and simply fetch another. Anything else is a misconfiguration
            // that will reject *every* client until someone notices, so it is
            // logged loudly and with the reason named.
            if matches!(error, MediaCoreError::ExpiredToken) {
                tracing::debug!("media token expired");
                return MediaError::TokenExpired;
            }

            tracing::warn!(
                reason = error.reason(),
                expected_issuer = self.signer.issuer(),
                secret_fingerprint = %self.fingerprint,
                "media token rejected — every join will fail until this is fixed"
            );
            MediaError::Unauthorized
        })?;

        let claimed = Uuid::parse_str(claimed_room.trim()).map_err(|_| MediaError::Forbidden)?;
        claims
            .require_room(claimed)
            .map_err(|_| MediaError::Forbidden)?;

        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_media_core::permissions::MediaPermissions;
    use genzh_media_core::token::MediaGrant;
    use genzh_media_core::track::ParticipantId;

    const SECRET: &[u8] = b"a-shared-media-secret-at-least-32-bytes";

    fn grant(room_id: Uuid) -> MediaGrant {
        MediaGrant {
            user_id: Uuid::new_v4(),
            room_id,
            community_id: Uuid::new_v4(),
            participant_id: ParticipantId::new(),
            permissions: MediaPermissions::SUBSCRIBE | MediaPermissions::PUBLISH_AUDIO,
            display_name: "Ada".into(),
        }
    }

    #[test]
    fn a_valid_token_for_the_claimed_room_is_accepted() {
        let signer = MediaTokenSigner::new(SECRET, "social.api", 120);
        let room = Uuid::new_v4();
        let token = signer.issue(&grant(room)).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let claims = verifier
            .verify(&token.token, &room.to_string())
            .expect("verify");
        assert_eq!(claims.room, room);
    }

    #[test]
    fn a_token_for_a_different_room_is_forbidden_not_unauthorized() {
        let signer = MediaTokenSigner::new(SECRET, "social.api", 120);
        let token = signer.issue(&grant(Uuid::new_v4())).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let error = verifier
            .verify(&token.token, &Uuid::new_v4().to_string())
            .expect_err("must be refused");
        assert!(matches!(error, MediaError::Forbidden));
    }

    #[test]
    fn a_token_signed_with_another_secret_is_unauthorized() {
        let signer =
            MediaTokenSigner::new(b"an-entirely-different-shared-secret", "social.api", 120);
        let room = Uuid::new_v4();
        let token = signer.issue(&grant(room)).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let error = verifier
            .verify(&token.token, &room.to_string())
            .expect_err("must be refused");
        assert!(matches!(error, MediaError::Unauthorized));
    }

    #[test]
    fn a_token_from_an_unexpected_issuer_is_unauthorized() {
        let signer = MediaTokenSigner::new(SECRET, "attacker.api", 120);
        let room = Uuid::new_v4();
        let token = signer.issue(&grant(room)).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        assert!(matches!(
            verifier.verify(&token.token, &room.to_string()),
            Err(MediaError::Unauthorized)
        ));
    }

    #[test]
    fn a_malformed_room_id_is_refused_without_panicking() {
        let signer = MediaTokenSigner::new(SECRET, "social.api", 120);
        let token = signer.issue(&grant(Uuid::new_v4())).expect("issue");
        let verifier = TokenVerifier::new(SECRET, "social.api");

        for claimed in ["", "not-a-uuid", "../../etc/passwd"] {
            assert!(matches!(
                verifier.verify(&token.token, claimed),
                Err(MediaError::Forbidden)
            ));
        }
    }

    #[test]
    fn an_expired_token_is_distinguished_from_a_rejected_one() {
        use chrono::{Duration, Utc};

        let signer = MediaTokenSigner::new(SECRET, "social.api", 120);
        let room = Uuid::new_v4();
        let token = signer
            .issue_at(&grant(room), Utc::now() - Duration::hours(1))
            .expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let error = verifier
            .verify(&token.token, &room.to_string())
            .expect_err("an expired token must be refused");

        // The distinction is load-bearing: the client retries `TokenExpired`
        // with a fresh token and gives up immediately on `Unauthorized`.
        assert!(
            matches!(error, MediaError::TokenExpired),
            "expiry must not be reported as a rejection, got {error:?}"
        );
        assert_eq!(error.code(), "TOKEN_EXPIRED");
    }

    #[test]
    fn a_secret_mismatch_closes_with_a_code_the_client_will_not_retry() {
        use genzh_media_signaling::SignalCloseCode;

        let signer = MediaTokenSigner::new(b"a-different-secret-entirely-here", "social.api", 120);
        let room = Uuid::new_v4();
        let token = signer.issue(&grant(room)).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let error = verifier
            .verify(&token.token, &room.to_string())
            .expect_err("must be refused");

        // Retrying a bad signature just burns the client's reconnect budget:
        // the next token from the same API is signed exactly the same way.
        assert_eq!(error.close_code(), SignalCloseCode::TokenRejected);
    }

    #[test]
    fn the_fingerprint_identifies_the_secret_without_revealing_it() {
        let mine = TokenVerifier::new(SECRET, "social.api");
        let same = TokenVerifier::new(SECRET, "social.api");
        let other = TokenVerifier::new(b"an-entirely-different-shared-secret", "social.api");

        assert_eq!(mine.fingerprint(), same.fingerprint(), "must be stable");
        assert_ne!(mine.fingerprint(), other.fingerprint(), "must discriminate");

        let secret = String::from_utf8_lossy(SECRET);
        assert!(!secret.contains(mine.fingerprint()));
        assert!(
            mine.fingerprint().len() < secret.len(),
            "a fingerprint must not be a copy of the key"
        );
    }

    #[test]
    fn garbage_tokens_are_refused_without_panicking() {
        let verifier = TokenVerifier::new(SECRET, "social.api");
        for token in ["", "not.a.token", "....", "Bearer x"] {
            assert!(matches!(
                verifier.verify(token, &Uuid::new_v4().to_string()),
                Err(MediaError::Unauthorized)
            ));
        }
    }
}
