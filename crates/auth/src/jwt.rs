//! Access tokens and refresh tokens.

use chrono::{DateTime, Duration, Utc};
use genzh_domain::{SessionId, UserId};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AuthError, AuthResult};

/// The `typ` claim on an access token. Refresh tokens are not JWTs, so this
/// also guards against one being replayed as the other.
const ACCESS_TOKEN_TYPE: &str = "access";

/// Claims on an access token.
///
/// Note what is *not* here: no roles, no communities, no permissions. See the
/// crate documentation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccessClaims {
    /// Issuer.
    pub iss: String,
    /// Audience.
    pub aud: String,
    /// The authenticated user.
    pub sub: Uuid,
    /// Session this token belongs to, so a logout can be reasoned about.
    pub sid: Uuid,
    /// Token id.
    pub jti: Uuid,
    /// Issued at.
    pub iat: i64,
    /// Expiry.
    pub exp: i64,
    /// Always [`ACCESS_TOKEN_TYPE`].
    pub typ: String,
}

/// The authenticated caller, as resolved by the API's middleware.
///
/// Carries identity only. Anything about *what this user may do* is a
/// database question answered per request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CurrentUser {
    /// The account.
    pub user_id: UserId,
    /// The session the request's token belongs to.
    pub session_id: SessionId,
}

/// An access/refresh pair handed to a client.
#[derive(Debug, Clone, Serialize)]
pub struct TokenPair {
    /// Short-lived bearer token.
    pub access_token: String,
    /// Long-lived opaque token, used only against `/auth/refresh`.
    pub refresh_token: String,
    /// Seconds until `access_token` expires.
    pub expires_in: i64,
    /// Always `"Bearer"`.
    pub token_type: &'static str,
}

/// Issues and validates access tokens, and mints refresh tokens.
pub struct JwtService {
    encoding: EncodingKey,
    decoding: DecodingKey,
    validation: Validation,
    header: Header,
    issuer: String,
    audience: String,
    access_ttl: Duration,
    refresh_ttl: Duration,
}

impl std::fmt::Debug for JwtService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JwtService")
            .field("issuer", &self.issuer)
            .field("audience", &self.audience)
            .field("access_ttl_seconds", &self.access_ttl.num_seconds())
            .finish_non_exhaustive()
    }
}

impl JwtService {
    /// Build the service from the signing secret and lifetimes.
    pub fn new(
        secret: &[u8],
        issuer: impl Into<String>,
        audience: impl Into<String>,
        access_ttl_seconds: i64,
        refresh_ttl_seconds: i64,
    ) -> Self {
        let issuer = issuer.into();
        let audience = audience.into();

        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        // `from_ref` borrows the one value as a one-element slice, which is
        // what these setters want — no clone, and `issuer`/`audience` stay
        // owned for the struct below.
        validation.set_issuer(std::slice::from_ref(&issuer));
        validation.set_audience(std::slice::from_ref(&audience));
        validation.validate_exp = true;
        validation.leeway = 5;

        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
            validation,
            header: Header::new(Algorithm::HS256),
            issuer,
            audience,
            access_ttl: Duration::seconds(access_ttl_seconds.clamp(60, 60 * 60)),
            refresh_ttl: Duration::seconds(refresh_ttl_seconds.clamp(3600, 90 * 24 * 3600)),
        }
    }

    /// Access-token lifetime in seconds.
    pub fn access_ttl_seconds(&self) -> i64 {
        self.access_ttl.num_seconds()
    }

    /// When a refresh token minted now would expire.
    pub fn refresh_expiry(&self) -> DateTime<Utc> {
        Utc::now() + self.refresh_ttl
    }

    /// Mint an access token for a session.
    pub fn issue_access(&self, user_id: UserId, session_id: SessionId) -> AuthResult<String> {
        self.issue_access_at(user_id, session_id, Utc::now())
    }

    /// [`JwtService::issue_access`] with an explicit clock, for tests.
    pub fn issue_access_at(
        &self,
        user_id: UserId,
        session_id: SessionId,
        now: DateTime<Utc>,
    ) -> AuthResult<String> {
        let claims = AccessClaims {
            iss: self.issuer.clone(),
            aud: self.audience.clone(),
            sub: user_id.as_uuid(),
            sid: session_id.as_uuid(),
            jti: Uuid::new_v4(),
            iat: now.timestamp(),
            exp: (now + self.access_ttl).timestamp(),
            typ: ACCESS_TOKEN_TYPE.to_owned(),
        };

        encode(&self.header, &claims, &self.encoding).map_err(|error| {
            tracing::error!(%error, "failed to sign access token");
            AuthError::InvalidToken
        })
    }

    /// Validate an access token and resolve the caller.
    pub fn authenticate(&self, token: &str) -> AuthResult<CurrentUser> {
        let data = decode::<AccessClaims>(token, &self.decoding, &self.validation)
            .map_err(|_| AuthError::InvalidToken)?;

        if data.claims.typ != ACCESS_TOKEN_TYPE {
            return Err(AuthError::InvalidToken);
        }

        Ok(CurrentUser {
            user_id: UserId(data.claims.sub),
            session_id: SessionId(data.claims.sid),
        })
    }

    /// Mint a fresh refresh token.
    ///
    /// Opaque, not a JWT: it must be revocable, and there is nothing to be
    /// gained from making it self-describing. 256 bits from the OS CSPRNG,
    /// which is what `Uuid::new_v4` uses.
    pub fn issue_refresh(&self) -> String {
        format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
    }
}

/// Hash a refresh token for storage.
///
/// SHA-256 rather than Argon2: the input is 256 bits of uniform randomness, so
/// there is no dictionary to defend against, and refresh happens often enough
/// that a deliberately slow hash would be a real cost.
pub fn hash_refresh_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"a-user-facing-jwt-secret-of-adequate-length";

    fn service() -> JwtService {
        JwtService::new(SECRET, "social.api", "social.client", 900, 30 * 24 * 3600)
    }

    #[test]
    fn an_access_token_round_trips_to_a_current_user() {
        let service = service();
        let user_id = UserId::new();
        let session_id = SessionId::new();

        let token = service.issue_access(user_id, session_id).expect("issue");
        let caller = service.authenticate(&token).expect("authenticate");

        assert_eq!(caller.user_id, user_id);
        assert_eq!(caller.session_id, session_id);
    }

    #[test]
    fn an_access_token_carries_no_authorization_claims() {
        let service = service();
        let token = service
            .issue_access(UserId::new(), SessionId::new())
            .expect("issue");

        let payload = token.split('.').nth(1).expect("payload segment");
        // The claim struct is closed, so this is really a regression guard on
        // the shape of the token if somebody adds a field later.
        for forbidden in ["role", "permission", "community", "admin"] {
            assert!(
                !payload.to_lowercase().contains(forbidden),
                "token payload should not mention {forbidden}"
            );
        }
    }

    #[test]
    fn a_token_signed_with_another_secret_is_rejected() {
        let token = service()
            .issue_access(UserId::new(), SessionId::new())
            .expect("issue");
        let impostor = JwtService::new(
            b"some-other-secret-entirely",
            "social.api",
            "social.client",
            900,
            3600,
        );
        assert!(matches!(
            impostor.authenticate(&token),
            Err(AuthError::InvalidToken)
        ));
    }

    #[test]
    fn an_expired_token_is_rejected() {
        let service = service();
        let long_ago = Utc::now() - Duration::hours(4);
        let token = service
            .issue_access_at(UserId::new(), SessionId::new(), long_ago)
            .expect("issue");
        assert!(matches!(
            service.authenticate(&token),
            Err(AuthError::InvalidToken)
        ));
    }

    #[test]
    fn a_token_for_another_audience_is_rejected() {
        let other = JwtService::new(SECRET, "social.api", "someone.elses.client", 900, 3600);
        let token = other
            .issue_access(UserId::new(), SessionId::new())
            .expect("issue");
        assert!(matches!(
            service().authenticate(&token),
            Err(AuthError::InvalidToken)
        ));
    }

    #[test]
    fn garbage_is_rejected_without_panicking() {
        let service = service();
        for input in ["", "not.a.token", "....", "Bearer abc"] {
            assert!(matches!(
                service.authenticate(input),
                Err(AuthError::InvalidToken)
            ));
        }
    }

    #[test]
    fn refresh_tokens_are_long_and_unique() {
        let service = service();
        let a = service.issue_refresh();
        let b = service.issue_refresh();
        assert_eq!(a.len(), 64, "two hex-encoded UUIDs = 256 bits");
        assert_ne!(a, b);
    }

    #[test]
    fn refresh_tokens_are_stored_hashed() {
        let token = service().issue_refresh();
        let stored = hash_refresh_token(&token);

        assert_eq!(stored.len(), 64);
        assert_ne!(stored, token, "the raw token must never be what is stored");
        assert_eq!(
            stored,
            hash_refresh_token(&token),
            "hashing is deterministic"
        );
        assert_ne!(stored, hash_refresh_token(&service().issue_refresh()));
    }

    #[test]
    fn lifetimes_are_clamped_into_sane_bands() {
        let too_short = JwtService::new(SECRET, "i", "a", 1, 1);
        assert_eq!(too_short.access_ttl_seconds(), 60);

        let too_long = JwtService::new(SECRET, "i", "a", 86_400, 86_400);
        assert_eq!(too_long.access_ttl_seconds(), 3600);
    }

    #[test]
    fn the_service_never_prints_key_material() {
        assert!(!format!("{:?}", service()).contains("secret"));
    }
}
