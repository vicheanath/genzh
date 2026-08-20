//! Rules that decide whether a message is abuse rather than conversation.
//!
//! Two different questions live in this module, and they are answered by two
//! different kinds of code:
//!
//! * **What is in one message** — how many people it names, how many links it
//!   carries. That is a pure function of the text, so it is decided here.
//! * **How the same person is behaving over time** — bursts, and the same
//!   sentence over and over. That needs memory of what came before, which is
//!   volatile state; the port for it is `genzh_infrastructure::flood`. What
//!   *this* module contributes is [`digest`], the normalisation that decides
//!   when two messages count as "the same".
//!
//! The caps are deliberately generous. Their job is to bound the damage one
//! account can do — notification fan-out, room noise, stored rows — not to
//! police style, and a limit that ordinary conversation trips is a bug.

use crate::error::{DomainError, DomainResult};
use crate::mention::parse_mentions;

/// How many distinct people (or `@everyone`) one message may name.
///
/// Each mention is a stored notification row plus a push, so this is the
/// amplification factor of a single post. Ten is far past what a real message
/// addresses and far short of what a mention-spammer wants.
pub const MAX_MENTIONS_PER_MESSAGE: usize = 10;

/// How many links one message may carry.
pub const MAX_LINKS_PER_MESSAGE: usize = 5;

/// Check what a single message contains.
///
/// Runs before the message is stored, on both the REST and the WebSocket path,
/// and on edits — otherwise a message could be posted within the caps and then
/// rewritten past them.
pub fn check_content(content: &str) -> DomainResult<()> {
    let mentions = parse_mentions(content).len();
    if mentions > MAX_MENTIONS_PER_MESSAGE {
        return Err(DomainError::invalid(
            "content",
            format!("mentions at most {MAX_MENTIONS_PER_MESSAGE} people at a time"),
        ));
    }

    if count_links(content) > MAX_LINKS_PER_MESSAGE {
        return Err(DomainError::invalid(
            "content",
            format!("contains at most {MAX_LINKS_PER_MESSAGE} links"),
        ));
    }

    Ok(())
}

/// How many `http://` or `https://` URLs the text contains.
///
/// Counted by scheme rather than by parsing: a spammer's payload is a clickable
/// link, and a client only makes `http(s)` clickable. Anything else is text.
fn count_links(content: &str) -> usize {
    let lower = content.to_lowercase();
    lower.match_indices("http://").count() + lower.match_indices("https://").count()
}

/// A fingerprint of what a message *says*, for spotting repeats.
///
/// Normalised first, because the cheapest way around a duplicate check is to
/// change something that does not change the message: case, spacing, or an
/// invisible character. Folding those away means "hi   THERE" and "hi there"
/// share a fingerprint, while two genuinely different sentences do not.
///
/// A 64-bit hash rather than the text itself: the flood guard keeps one of
/// these per active poster, and it has no reason to hold anybody's words in
/// memory to answer "was that the same again?".
pub fn digest(content: &str) -> u64 {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalize(content).hash(&mut hasher);
    hasher.finish()
}

/// Case-folded, whitespace-collapsed, invisible characters removed.
fn normalize(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut pending_space = false;

    for ch in content.chars() {
        // Zero-width joiners and marks render as nothing, so a message padded
        // with them looks identical and hashes differently. Drop them.
        if is_invisible(ch) {
            continue;
        }
        if ch.is_whitespace() {
            pending_space = !out.is_empty();
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        out.extend(ch.to_lowercase());
    }

    out
}

/// Characters that occupy no space on screen.
fn is_invisible(ch: char) -> bool {
    matches!(ch, '\u{200B}'..='\u{200F}' | '\u{2060}'..='\u{2064}' | '\u{FEFF}' | '\u{00AD}')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mentions(count: usize) -> String {
        (0..count)
            .map(|index| format!("@user{index}"))
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn an_ordinary_message_passes() {
        assert!(check_content("hey @ana, look at https://example.com").is_ok());
    }

    #[test]
    fn mention_floods_are_rejected() {
        assert!(check_content(&mentions(MAX_MENTIONS_PER_MESSAGE)).is_ok());
        assert!(check_content(&mentions(MAX_MENTIONS_PER_MESSAGE + 1)).is_err());
    }

    #[test]
    fn repeating_one_name_is_one_mention() {
        // The parser deduplicates, so a message that says "@ana" twenty times
        // notifies Ana once — and must not be refused for it.
        assert!(check_content(&"@ana ".repeat(40)).is_ok());
    }

    #[test]
    fn link_floods_are_rejected() {
        let links = "https://example.com ".repeat(MAX_LINKS_PER_MESSAGE + 1);
        assert!(check_content(&links).is_err());
        assert!(check_content(&"http://example.com ".repeat(MAX_LINKS_PER_MESSAGE)).is_ok());
    }

    #[test]
    fn cosmetic_differences_share_a_digest() {
        assert_eq!(digest("Buy   NOW"), digest("buy now"));
        assert_eq!(digest("buy now"), digest("buy\u{200B} now"));
        assert_eq!(digest(" buy now\n"), digest("buy now"));
    }

    #[test]
    fn different_messages_do_not() {
        assert_ne!(digest("buy now"), digest("buy later"));
        assert_ne!(digest("hello"), digest(""));
    }
}
