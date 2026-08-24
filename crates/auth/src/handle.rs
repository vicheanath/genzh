//! Deriving a usable handle from what an identity provider tells us.
//!
//! Its own module because it is the one genuinely fiddly piece of the OAuth
//! path and the only part of it that can be tested without a database. It was
//! forty lines in the middle of a hundred-and-seventy-line function, where the
//! rules — what characters survive, what happens to a name that is too short,
//! what a person called `..` ends up as — could not be checked at all.
//!
//! Nothing here talks to storage. Making the result *unique* does, and that
//! stays in [`crate::oauth`] where the repository is.

use genzh_domain::user;

/// What a provider offered, in the order we would rather use it.
///
/// The suggested handle first — Discord gives a real username, and it is what
/// the person expects to see. An e-mail's local part is a reasonable second.
/// The provider's own opaque id is the last resort, and only ever produces
/// something like `google_10428`.
pub(crate) fn preferred(
    suggested: Option<&str>,
    email: Option<&str>,
    provider: &str,
    provider_user_id: &str,
) -> String {
    let raw = suggested
        .map(str::to_owned)
        .or_else(|| {
            email
                .and_then(|address| address.split('@').next())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| {
            format!("{}_{}", provider, snippet(provider_user_id, 6))
        });

    sanitize(&raw, provider_user_id)
}

/// Force an arbitrary string into the shape a handle is allowed to have.
///
/// Anything outside `[a-z0-9_.]` becomes an underscore rather than being
/// dropped, so two different names cannot silently collapse into the same
/// handle. `seed` is only consulted when what is left is unusable.
pub(crate) fn sanitize(raw: &str, seed: &str) -> String {
    let mut handle: String = raw
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();

    if handle.len() < user::HANDLE_MIN_LEN {
        handle = format!("{}_{}", handle, snippet(seed, 4));
    }
    if handle.len() > user::HANDLE_MAX_LEN {
        handle.truncate(user::HANDLE_MAX_LEN);
    }

    // A leading or trailing dot reads as a file extension and looks like a
    // typo in every mention of it.
    handle = handle.trim_matches('.').to_owned();

    if handle.is_empty() {
        handle = format!("user_{}", snippet(seed, 8));
    }

    handle
}

/// A candidate built from a base and a numeric suffix, kept within the cap.
///
/// The suffix is what makes it unique, so it is the part that must survive:
/// the base is truncated to make room rather than the other way round.
pub(crate) fn with_suffix(base: &str, suffix: &str) -> String {
    let mut prefix = base.to_owned();
    if prefix.len() + suffix.len() > user::HANDLE_MAX_LEN {
        prefix.truncate(user::HANDLE_MAX_LEN - suffix.len());
    }
    format!("{prefix}{suffix}")
}

/// The last resort when a base keeps colliding.
pub(crate) fn random() -> String {
    format!("u_{}", &uuid::Uuid::new_v4().to_string()[..12])
}

/// The first `n` characters of an opaque provider id.
///
/// Byte-wise on purpose, and safe because provider ids are ASCII — but clamped
/// so a shorter one cannot panic, which the original slicing could.
fn snippet(value: &str, n: usize) -> &str {
    let end = value
        .char_indices()
        .nth(n)
        .map(|(index, _)| index)
        .unwrap_or(value.len());
    &value[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_suggested_username_is_used_as_is() {
        let handle = preferred(Some("chloe_beats"), None, "discord", "42");
        assert_eq!(handle, "chloe_beats");
    }

    #[test]
    fn an_email_falls_back_to_its_local_part() {
        let handle = preferred(None, Some("chloe.miller@example.com"), "google", "42");
        assert_eq!(handle, "chloe.miller");
    }

    #[test]
    fn with_nothing_offered_the_provider_names_the_account() {
        let handle = preferred(None, None, "google", "104281998877");
        assert_eq!(handle, "google_104281");
    }

    #[test]
    fn punctuation_and_case_are_flattened() {
        assert_eq!(sanitize("Chloe Miller!", "seed"), "chloe_miller_");
    }

    #[test]
    fn a_short_name_is_padded_from_the_provider_id() {
        // Too short to be a handle on its own, so the seed makes up the length.
        let handle = sanitize("jo", "abcdefgh");
        assert!(handle.len() >= user::HANDLE_MIN_LEN, "{handle}");
        assert!(handle.starts_with("jo_"), "{handle}");
    }

    #[test]
    fn a_long_name_is_cut_to_the_cap() {
        let handle = sanitize(&"a".repeat(user::HANDLE_MAX_LEN + 20), "seed");
        assert_eq!(handle.len(), user::HANDLE_MAX_LEN);
    }

    #[test]
    fn a_name_that_sanitises_to_nothing_still_produces_a_handle() {
        // Dots survive sanitising and are then trimmed, which is exactly the
        // case that used to leave an empty handle.
        let handle = sanitize("...", "abcdefghij");
        assert_eq!(handle, "user_abcdefgh");
    }

    #[test]
    fn a_suffix_is_never_truncated_away() {
        let base = "b".repeat(user::HANDLE_MAX_LEN);
        let candidate = with_suffix(&base, "9999");
        assert_eq!(candidate.len(), user::HANDLE_MAX_LEN);
        assert!(candidate.ends_with("9999"), "{candidate}");
    }

    #[test]
    fn a_short_provider_id_does_not_panic() {
        // `&id[..6]` on a two-character id was a panic waiting for a provider
        // that numbers its users from one.
        assert_eq!(preferred(None, None, "google", "7"), "google_7");
    }
}
