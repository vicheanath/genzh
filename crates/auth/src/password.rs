//! Argon2id password hashing.
//!
//! Two things here are easy to get wrong and both are load-bearing:
//!
//! 1. **Hashing is CPU-bound and slow by design.** ~50 ms of deliberate work
//!    is what makes offline cracking expensive. Running that on a Tokio worker
//!    thread stalls every other future scheduled on it, so every call goes
//!    through `spawn_blocking`.
//! 2. **Verification must not short-circuit on a missing user.** If a
//!    non-existent handle returns instantly while a real one takes 50 ms, the
//!    response time is an account-enumeration oracle. [`verify_dummy`] burns
//!    the same work when there is no user to check against.

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};

use crate::error::{AuthError, AuthResult};

/// Memory cost in KiB (19 MiB), from the OWASP Argon2id guidance.
const MEMORY_KIB: u32 = 19 * 1024;
/// Iterations.
const ITERATIONS: u32 = 2;
/// Degree of parallelism.
const PARALLELISM: u32 = 1;

/// A PHC string for a password nobody has, used to keep timing flat.
///
/// Generated once at startup rather than embedded, so it carries this build's
/// parameters and stays representative if they are tuned.
fn dummy_hash() -> &'static str {
    use std::sync::OnceLock;
    static DUMMY: OnceLock<String> = OnceLock::new();
    DUMMY.get_or_init(|| {
        hash_blocking("a-password-that-belongs-to-nobody")
            .unwrap_or_else(|_| String::from("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$invalid"))
    })
}

fn hasher() -> Argon2<'static> {
    let params = Params::new(MEMORY_KIB, ITERATIONS, PARALLELISM, None)
        .unwrap_or_else(|_| Params::default());
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Hash a password on the current thread.
///
/// Prefer [`hash`] from async code.
pub fn hash_blocking(password: &str) -> AuthResult<String> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    hasher()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| {
            tracing::error!(%error, "argon2 hashing failed");
            AuthError::Hashing
        })
}

/// Verify a password on the current thread.
///
/// A malformed stored hash is treated as a failed verification, not an error:
/// it means that account cannot log in, which is the safe outcome.
pub fn verify_blocking(password: &str, phc: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(phc) else {
        tracing::error!("stored password hash is not a valid PHC string");
        return false;
    };
    hasher()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Hash a password without blocking the async runtime.
pub async fn hash(password: String) -> AuthResult<String> {
    tokio::task::spawn_blocking(move || hash_blocking(&password))
        .await
        .map_err(|_| AuthError::Hashing)?
}

/// Verify a password without blocking the async runtime.
pub async fn verify(password: String, phc: String) -> bool {
    tokio::task::spawn_blocking(move || verify_blocking(&password, &phc))
        .await
        .unwrap_or(false)
}

/// Spend the same work as a real verification when there is no account.
///
/// Callers must `await` this on the "user not found" path so that login timing
/// does not reveal which handles exist.
pub async fn verify_dummy(password: String) {
    let _ = verify(password, dummy_hash().to_owned()).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_password_verifies_against_its_own_hash() {
        let phc = hash_blocking("correct horse battery staple").expect("hash");
        assert!(verify_blocking("correct horse battery staple", &phc));
    }

    #[test]
    fn a_wrong_password_does_not_verify() {
        let phc = hash_blocking("correct horse battery staple").expect("hash");
        assert!(!verify_blocking("Correct horse battery staple", &phc));
        assert!(!verify_blocking("", &phc));
    }

    #[test]
    fn the_same_password_hashes_differently_every_time() {
        let a = hash_blocking("same-password-twice").expect("hash");
        let b = hash_blocking("same-password-twice").expect("hash");
        assert_ne!(a, b, "a per-password salt is what defeats rainbow tables");
        assert!(verify_blocking("same-password-twice", &a));
        assert!(verify_blocking("same-password-twice", &b));
    }

    #[test]
    fn the_stored_hash_is_argon2id_and_contains_no_plaintext() {
        let phc = hash_blocking("hunter2-but-longer").expect("hash");
        assert!(phc.starts_with("$argon2id$"), "must be argon2id, got {phc}");
        assert!(!phc.contains("hunter2"));
    }

    #[test]
    fn a_corrupt_stored_hash_fails_closed() {
        assert!(!verify_blocking("anything", "not-a-phc-string"));
        assert!(!verify_blocking("anything", ""));
    }

    #[tokio::test]
    async fn the_async_wrappers_agree_with_the_blocking_ones() {
        let phc = hash("async-password-value".to_owned()).await.expect("hash");
        assert!(verify("async-password-value".to_owned(), phc.clone()).await);
        assert!(!verify("wrong-password-value".to_owned(), phc).await);
    }

    #[tokio::test]
    async fn the_dummy_verification_completes() {
        // The point is that it does the work rather than returning instantly;
        // asserting on timing would be flaky, so this just pins the API.
        verify_dummy("whatever-was-submitted".to_owned()).await;
    }
}
