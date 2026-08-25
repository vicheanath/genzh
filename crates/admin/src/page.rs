//! One page of a console list, and the cursor for the next.
//!
//! # Why keyset and not `OFFSET`
//!
//! The console's history lists are long and live: entries are being written to
//! the audit log and the support queue while somebody is scrolling one. Under
//! `OFFSET` that is a correctness problem, not just a performance one — a row
//! inserted above the window shifts every later row down by one, so page two
//! repeats a row page one already showed, and a deletion makes it skip one
//! instead. A cursor describes a *position in the ordering* rather than a count
//! of rows, so what arrives afterwards cannot move it.
//!
//! # Why the cursor has two parts
//!
//! Every list here orders by `(created_at, id)`, and the cursor has to match
//! that exactly. A cursor of `created_at` alone cannot: when several rows share
//! a timestamp, the page boundary can fall inside that group, and
//! `created_at < cursor` then skips the whole rest of it.
//!
//! Shared timestamps are not exotic here — they are the normal case. PostgreSQL's
//! `now()` is transaction time, so every audit entry written by one bulk action
//! carries the identical timestamp, and those are precisely the entries somebody
//! reading the log most wants. Comparing the pair, `(created_at, id) < ($1, $2)`,
//! puts the boundary between two rows instead of between two timestamps.

use serde::Serialize;
use uuid::Uuid;

use genzh_domain::Timestamp;

/// A page of `T`, plus where to resume.
#[derive(Debug, Clone, Serialize)]
pub struct Page<T> {
    /// The rows, in the list's own order.
    pub items: Vec<T>,

    /// Timestamp half of the cursor for the next page.
    ///
    /// `None` means this is the last page. Which direction "next" runs in
    /// follows the list: newest-first lists continue backwards in time, and the
    /// support queue, which is oldest-first so the longest wait is on top,
    /// continues forwards.
    pub next_cursor: Option<Timestamp>,

    /// Tie-breaker half of the cursor. Always sent and returned with
    /// [`Self::next_cursor`]; sending one without the other degrades to
    /// timestamp-only paging, which can skip rows.
    pub next_cursor_id: Option<Uuid>,
}

impl<T> Page<T> {
    /// Build a page from a batch fetched with one row more than `limit`.
    ///
    /// The extra row is how the query answers "is there more?" without a second
    /// `COUNT`, which on a large audit table costs more than the page itself.
    /// It is dropped before the page is returned; `key` reads the cursor off
    /// the last row that survives.
    pub fn from_overfetch(
        mut rows: Vec<T>,
        limit: i64,
        key: impl Fn(&T) -> (Timestamp, Uuid),
    ) -> Self {
        let has_more = rows.len() as i64 > limit;

        if has_more {
            rows.truncate(limit.max(0) as usize);
        }

        // `has_more` and a non-empty page are checked together: truncating to a
        // limit of zero would otherwise hand back a cursor read from nothing.
        let cursor = match (has_more, rows.last()) {
            (true, Some(last)) => {
                let (at, id) = key(last);
                (Some(at), Some(id))
            }
            _ => (None, None),
        };

        Self {
            items: rows,
            next_cursor: cursor.0,
            next_cursor_id: cursor.1,
        }
    }

    /// A page holding everything there is, with no continuation.
    pub fn complete(items: Vec<T>) -> Self {
        Self {
            items,
            next_cursor: None,
            next_cursor_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn row(seconds: i64, id: u128) -> (Timestamp, Uuid) {
        (
            Utc.timestamp_opt(seconds, 0).single().expect("valid time"),
            Uuid::from_u128(id),
        )
    }

    #[test]
    fn an_overfetch_yields_a_cursor_from_the_last_kept_row() {
        let rows = vec![row(3, 3), row(2, 2), row(1, 1)];
        let page = Page::from_overfetch(rows, 2, |r| *r);

        assert_eq!(page.items.len(), 2);
        // The cursor is the second row, not the third — the third was only
        // fetched to prove another page exists and must not be shown twice.
        assert_eq!(page.next_cursor, Some(row(2, 2).0));
        assert_eq!(page.next_cursor_id, Some(Uuid::from_u128(2)));
    }

    #[test]
    fn a_short_read_is_the_last_page() {
        let rows = vec![row(2, 2), row(1, 1)];
        let page = Page::from_overfetch(rows, 5, |r| *r);

        assert_eq!(page.items.len(), 2);
        assert_eq!(page.next_cursor, None);
        assert_eq!(page.next_cursor_id, None);
    }

    #[test]
    fn an_exactly_full_page_is_the_last_page() {
        // Exactly `limit` rows means the overfetch found nothing extra, so
        // offering a cursor here would send the reader to an empty page.
        let rows = vec![row(2, 2), row(1, 1)];
        let page = Page::from_overfetch(rows, 2, |r| *r);

        assert_eq!(page.items.len(), 2);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn an_empty_result_has_no_cursor() {
        let page: Page<(Timestamp, Uuid)> = Page::from_overfetch(vec![], 10, |r| *r);

        assert!(page.items.is_empty());
        assert_eq!(page.next_cursor, None);
    }
}
