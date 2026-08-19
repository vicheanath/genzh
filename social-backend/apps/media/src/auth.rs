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

use social_media_core::token::{MediaTokenClaims, MediaTokenSigner};
use uuid::Uuid;

use crate::error::MediaError;

/// Verifies tokens presented on the signalling socket.
#[derive(Debug)]
pub struct TokenVerifier {
    signer: MediaTokenSigner,
}

impl TokenVerifier {
    /// Build from the shared secret and expected issuer.
    pub fn new(secret: &[u8], issuer: &str) -> Self {
        // The TTL argument is only used when *issuing*; the media server never
        // mints a token, it only checks the `exp` inside one.
        Self { signer: MediaTokenSigner::new(secret, issuer, 120) }
    }

    /// Verify a token and bind it to the room the client named.
    ///
    /// `claimed_room` comes from the client and is therefore untrusted; it is
    /// checked against the token rather than believed. A mismatch is a
    /// *forbidden*, not an *unauthorized*: the credential is genuine, it just
    /// does not open this door.
    pub fn verify(
        &self,
        token: &str,
        claimed_room: &str,
    ) -> Result<MediaTokenClaims, MediaError> {
        let claims = self.signer.verify(token).map_err(|error| {
            tracing::debug!(%error, "media token rejected");
            MediaError::Unauthorized
        })?;

        let claimed = Uuid::parse_str(claimed_room.trim()).map_err(|_| MediaError::Forbidden)?;
        claims.require_room(claimed).map_err(|_| MediaError::Forbidden)?;

        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use social_media_core::permissions::MediaPermissions;
    use social_media_core::token::MediaGrant;
    use social_media_core::track::ParticipantId;

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
        let claims = verifier.verify(&token.token, &room.to_string()).expect("verify");
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
        let signer = MediaTokenSigner::new(b"an-entirely-different-shared-secret", "social.api", 120);
        let room = Uuid::new_v4();
        let token = signer.issue(&grant(room)).expect("issue");

        let verifier = TokenVerifier::new(SECRET, "social.api");
        let error = verifier.verify(&token.token, &room.to_string()).expect_err("must be refused");
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
            assert!(matches!(verifier.verify(&token.token, claimed), Err(MediaError::Forbidden)));
        }
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
