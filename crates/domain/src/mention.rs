//! Parsing `@mentions` out of message text.
//!
//! Mentions are derived from the message body rather than sent alongside it.
//! A client that supplied its own list could claim to have mentioned anyone,
//! which would make a mention notification a way to reach someone who never
//! appears in the text — so the server reads them from the content it stores.
//!
//! The grammar is deliberately narrow, matching [`crate::user::normalize_handle`]:
//! an `@` that begins a word, followed by handle characters. Trailing
//! punctuation is not part of the handle, so `@ana,` mentions `ana`.

use std::collections::BTreeSet;

/// The special mention that addresses a whole room.
pub const EVERYONE_MENTION: &str = "everyone";

/// What a single `@…` refers to.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Mention {
    /// Everybody who can see the room.
    Everyone,
    /// One person, by handle. Always lower-case, as handles are stored.
    User(String),
}

/// Every distinct mention in `content`, in a stable order.
///
/// Deduplicated: writing "@ana @ana" is one mention of Ana, not two
/// notifications.
pub fn parse_mentions(content: &str) -> Vec<Mention> {
    let mut found = BTreeSet::new();
    let bytes = content.as_bytes();

    for (index, _) in content.match_indices('@') {
        // An `@` is only a mention when it starts a word. This is what keeps
        // `name@example.com` from mentioning `example`.
        if index > 0 {
            let previous = bytes[index - 1];
            if previous.is_ascii_alphanumeric() || previous == b'_' || previous == b'.' {
                continue;
            }
        }

        let rest = &content[index + 1..];
        let handle: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '.')
            .collect();

        // A handle cannot end with '.', so a sentence-final "@ana." mentions
        // `ana` rather than failing to parse.
        let handle = handle.trim_end_matches('.').to_lowercase();
        if handle.is_empty() {
            continue;
        }

        found.insert(if handle == EVERYONE_MENTION {
            Mention::Everyone
        } else {
            Mention::User(handle)
        });
    }

    found.into_iter().collect()
}

/// Just the handles, dropping any `@everyone`.
pub fn mentioned_handles(content: &str) -> Vec<String> {
    parse_mentions(content)
        .into_iter()
        .filter_map(|mention| match mention {
            Mention::User(handle) => Some(handle),
            Mention::Everyone => None,
        })
        .collect()
}

/// Does this message address the whole room?
pub fn mentions_everyone(content: &str) -> bool {
    parse_mentions(content).contains(&Mention::Everyone)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(handle: &str) -> Mention {
        Mention::User(handle.to_string())
    }

    #[test]
    fn a_mention_is_found_anywhere_a_word_can_start() {
        assert_eq!(parse_mentions("@ana hello"), vec![user("ana")]);
        assert_eq!(parse_mentions("hello @ana"), vec![user("ana")]);
        assert_eq!(parse_mentions("(@ana)"), vec![user("ana")]);
        assert_eq!(parse_mentions("hi\n@ana"), vec![user("ana")]);
    }

    #[test]
    fn an_email_address_is_not_a_mention() {
        assert!(parse_mentions("write to ana@example.com").is_empty());
    }

    #[test]
    fn trailing_punctuation_is_not_part_of_the_handle() {
        assert_eq!(parse_mentions("thanks @ana!"), vec![user("ana")]);
        assert_eq!(parse_mentions("ask @ana, please"), vec![user("ana")]);
        // A handle may contain '.' but may not end with one.
        assert_eq!(parse_mentions("cc @a.b."), vec![user("a.b")]);
    }

    #[test]
    fn mentions_are_deduplicated_and_case_folded() {
        assert_eq!(parse_mentions("@Ana @ana @ANA"), vec![user("ana")]);
    }

    #[test]
    fn everyone_is_its_own_kind() {
        assert_eq!(parse_mentions("@everyone ship it"), vec![Mention::Everyone]);
        assert!(mentions_everyone("heads up @everyone"));
        assert!(mentioned_handles("@everyone @ana") == vec!["ana".to_string()]);
    }

    #[test]
    fn a_bare_at_sign_mentions_nobody() {
        assert!(parse_mentions("@").is_empty());
        assert!(parse_mentions("cost: 5 @ each").is_empty());
        assert!(parse_mentions("@!").is_empty());
    }

    #[test]
    fn multiple_distinct_mentions_all_come_back() {
        assert_eq!(
            parse_mentions("@ana and @ben, tell @cara"),
            vec![user("ana"), user("ben"), user("cara")],
        );
    }
}
