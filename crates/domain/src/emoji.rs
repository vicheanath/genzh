//! Custom emoji: a community's own `:shortcode:` glyphs.
//!
//! The rules here are shared by three readers that must not disagree — the
//! endpoint that registers an emoji, the reaction path that accepts `:name:`
//! as a key, and the client that scans message text for shortcodes to draw. A
//! name the scanner would not recognise must never be storable, or a member
//! would add a glyph that renders as literal text forever.
//!
//! Nothing in this module stores an image. There is no object storage in this
//! platform, so an emoji *is* a URL somebody supplies, and the only thing
//! standing between that and an `<img src>` on every client is
//! [`validate_emoji_url`].

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, EmojiId, UserId};

/// Shortest usable shortcode.
///
/// Two characters, because a single one between colons appears constantly in
/// ordinary text — timestamps, ratios, source code — and `:a:` would turn all
/// of it into a hunt for artwork.
pub const EMOJI_NAME_MIN_LEN: usize = 2;

/// Longest shortcode.
///
/// Comfortably inside [`crate::message::REACTION_MAX_LEN`] once the two colons
/// are added, which is what lets a custom emoji be a reaction key without a
/// second limit to keep in step with the first.
pub const EMOJI_NAME_MAX_LEN: usize = 32;

/// Longest image URL accepted.
pub const EMOJI_URL_MAX_LEN: usize = 512;

/// How many emoji one community may hold.
///
/// A ceiling rather than a business rule: the whole set is sent to every client
/// that opens a room, so it has to stay small enough to be one cheap response.
pub const EMOJI_PER_COMMUNITY_MAX: i64 = 200;

/// One community-defined emoji.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomEmoji {
    /// Primary key.
    pub id: EmojiId,
    /// Which community defines it.
    pub community_id: CommunityId,
    /// The shortcode without its colons, lower-case.
    pub name: String,
    /// Where the artwork lives. Always `https://`.
    pub image_url: String,
    /// Whether the artwork moves, so a client can honour "reduce motion".
    pub is_animated: bool,
    /// Who added it. `None` once that account is gone.
    pub created_by: Option<UserId>,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

impl CustomEmoji {
    /// The reaction key this emoji is used under.
    pub fn shortcode(&self) -> String {
        format!(":{}:", self.name)
    }
}

/// Validate and normalise a shortcode name.
///
/// Lower-cased on the way in rather than compared case-insensitively at every
/// read: `:Blob:` and `:blob:` are the same glyph, and storing both would let a
/// community hold two emoji nobody can tell apart.
pub fn validate_emoji_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().trim_matches(':').to_lowercase();
    let length = name.chars().count();

    if !(EMOJI_NAME_MIN_LEN..=EMOJI_NAME_MAX_LEN).contains(&length) {
        return Err(DomainError::invalid(
            "name",
            format!("must be between {EMOJI_NAME_MIN_LEN} and {EMOJI_NAME_MAX_LEN} characters"),
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(DomainError::invalid(
            "name",
            "may only contain letters, digits and underscores",
        ));
    }

    // All digits is refused, and the reason is `12:30:45`. A community that
    // registered `:30:` would turn every timestamp anyone posts into artwork.
    // Refusing it here is what lets the scanner skip digit runs outright,
    // rather than every client having to special-case a clock.
    if name.chars().all(|c| c.is_ascii_digit()) {
        return Err(DomainError::invalid(
            "name",
            "must not be only digits",
        ));
    }

    Ok(name)
}

/// Validate an emoji artwork URL.
///
/// `https` only, and no credentials in the authority. This string ends up in an
/// `<img src>` on every client that renders the room, so `javascript:` and
/// `data:` are not merely unsupported — they are the attack this check exists
/// for.
pub fn validate_emoji_url(raw: &str) -> DomainResult<String> {
    let url = raw.trim().to_owned();

    if url.chars().count() > EMOJI_URL_MAX_LEN {
        return Err(DomainError::invalid(
            "image_url",
            format!("must be at most {EMOJI_URL_MAX_LEN} characters"),
        ));
    }

    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| DomainError::invalid("image_url", "must be an https:// URL"))?;

    // A host has to be there, and `user:pass@host` is refused rather than
    // stripped: an emoji carrying a credential leaks it on every render.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') {
        return Err(DomainError::invalid("image_url", "is not a usable URL"));
    }

    Ok(url)
}

/// Characters a shortcode is made of.
///
/// Upper case is accepted while *scanning* even though it is never stored, so
/// that someone typing `:Blob:` gets their glyph instead of literal text.
fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Every distinct shortcode named in a body of text, lower-cased.
///
/// Deduplicated like [`crate::mention::parse_mentions`]: writing the same glyph
/// twice uses it once.
///
/// Written as a scan rather than a regex so it can be read side by side with
/// the TypeScript copy the clients use — the two must agree about what is a
/// shortcode, and a hand-written loop makes the disagreement visible.
pub fn parse_shortcodes(content: &str) -> Vec<String> {
    let chars: Vec<char> = content.chars().collect();
    let mut found: Vec<String> = Vec::new();
    let mut index = 0;

    while index < chars.len() {
        if chars[index] != ':' {
            index += 1;
            continue;
        }

        let start = index + 1;
        let mut end = start;
        while end < chars.len() && is_name_char(chars[end]) && end - start < EMOJI_NAME_MAX_LEN {
            end += 1;
        }

        let candidate: String = chars[start..end].iter().collect();
        let digits_only = candidate.chars().all(|c| c.is_ascii_digit());

        if end < chars.len()
            && chars[end] == ':'
            && end - start >= EMOJI_NAME_MIN_LEN
            && !digits_only
        {
            let name = candidate.to_lowercase();
            if !found.contains(&name) {
                found.push(name);
            }
            // Resume *at* the closing colon rather than past it, so `:aa::bb:`
            // finds both: the colon that ends one shortcode opens the next.
            index = end;
        } else {
            index += 1;
        }
    }

    found
}

/// The emoji name a reaction key refers to, when it refers to a custom one.
///
/// `":blob:"` is a custom reaction; `"🔥"` is not. Answering `None` is how the
/// reaction path tells the two apart without a second field on the wire.
pub fn shortcode_name(reaction: &str) -> Option<String> {
    let inner = reaction.trim().strip_prefix(':')?.strip_suffix(':')?;
    if inner.contains(':') {
        return None;
    }
    validate_emoji_name(inner).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_normalised_and_bounded() {
        assert_eq!(validate_emoji_name("  :PartyBlob:  ").unwrap(), "partyblob");
        assert_eq!(validate_emoji_name("blob_2").unwrap(), "blob_2");
        assert!(validate_emoji_name("a").is_err());
        assert!(validate_emoji_name("no spaces").is_err());
        assert!(validate_emoji_name("hy-phen").is_err());
        assert!(validate_emoji_name(&"a".repeat(EMOJI_NAME_MAX_LEN + 1)).is_err());
    }

    #[test]
    fn only_plain_https_urls_are_accepted() {
        assert!(validate_emoji_url("https://cdn.example.com/blob.png").is_ok());
        assert!(validate_emoji_url("http://cdn.example.com/blob.png").is_err());
        assert!(validate_emoji_url("javascript:alert(1)").is_err());
        assert!(validate_emoji_url("data:image/png;base64,AAAA").is_err());
        assert!(validate_emoji_url("https://user:pass@cdn.example.com/b.png").is_err());
        assert!(validate_emoji_url("https://").is_err());
    }

    #[test]
    fn shortcodes_are_found_deduplicated_and_lowercased() {
        assert_eq!(
            parse_shortcodes("hey :blob: and :Blob: and :party_2:"),
            vec!["blob".to_owned(), "party_2".to_owned()]
        );
        // A clock is not a glyph, and cannot be made into one: `:30:` is
        // refused at registration, so the scanner skips digit runs.
        assert!(parse_shortcodes("12:30:45").is_empty());
        assert!(validate_emoji_name("30").is_err());
        assert!(parse_shortcodes("a : b : c").is_empty());
    }

    #[test]
    fn a_closing_colon_can_open_the_next_shortcode() {
        assert_eq!(
            parse_shortcodes(":aa::bb:"),
            vec!["aa".to_owned(), "bb".to_owned()]
        );
    }

    #[test]
    fn reaction_keys_split_into_unicode_and_custom() {
        assert_eq!(shortcode_name(":blob:"), Some("blob".to_owned()));
        assert_eq!(shortcode_name("🔥"), None);
        assert_eq!(shortcode_name(":a:"), None);
        assert_eq!(shortcode_name("::"), None);
    }
}
