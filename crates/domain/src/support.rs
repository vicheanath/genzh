//! Reports and help requests — the queue staff work.
//!
//! One object for both, because to the person handling it they are the same
//! shape: something arrives, somebody picks it up, somebody answers it, it
//! closes. The kind changes what is *shown* — a report names the thing being
//! reported — not how it is worked.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::UserId;

/// Longest a ticket subject line may be.
pub const TICKET_SUBJECT_MAX_LEN: usize = 140;
/// Longest a ticket body or reply may be.
pub const TICKET_BODY_MAX_LEN: usize = 4_000;

/// Why the ticket exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "support_ticket_kind", rename_all = "snake_case")]
pub enum TicketKind {
    /// Somebody is reporting content or an account.
    Report,
    /// Somebody is asking for help with their own account.
    Help,
}

/// Where a ticket is in its life.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "support_ticket_status", rename_all = "snake_case")]
pub enum TicketStatus {
    /// Nobody has answered yet.
    Open,
    /// Answered, and waiting on the person who raised it.
    Pending,
    /// Dealt with. Still visible to both sides.
    Resolved,
    /// Ended without a resolution — a duplicate, or a report about nothing.
    Closed,
}

impl TicketStatus {
    /// Is this ticket finished with?
    pub const fn is_terminal(self) -> bool {
        matches!(self, TicketStatus::Resolved | TicketStatus::Closed)
    }
}

/// What a report points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "support_subject_type", rename_all = "snake_case")]
pub enum SubjectType {
    Message,
    User,
    Room,
    Community,
}

/// A ticket as stored.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Ticket {
    pub id: uuid::Uuid,
    pub kind: TicketKind,
    pub reporter_id: UserId,
    pub subject_type: Option<SubjectType>,
    /// Deliberately not a foreign key: the reported message is often deleted
    /// before anyone reads the report, and losing the report at that moment
    /// destroys the only remaining evidence.
    pub subject_id: Option<uuid::Uuid>,
    pub category: String,
    pub subject: String,
    pub details: String,
    pub status: TicketStatus,
    pub assignee_id: Option<UserId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub resolved_at: Option<Timestamp>,
}

/// One message on a ticket's thread.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TicketMessage {
    pub id: uuid::Uuid,
    pub ticket_id: uuid::Uuid,
    /// Null for anything the system wrote, such as a status change.
    pub author_id: Option<UserId>,
    pub body: String,
    /// Visible to staff only. Never returned to the reporter — see
    /// `SupportService::thread_for`.
    pub staff_only: bool,
    pub created_at: Timestamp,
}

/// Trim and bound a subject line.
pub fn validate_subject(raw: &str) -> DomainResult<String> {
    let subject = raw.trim().to_owned();
    if subject.is_empty() || subject.chars().count() > TICKET_SUBJECT_MAX_LEN {
        return Err(DomainError::invalid(
            "subject",
            format!("must be between 1 and {TICKET_SUBJECT_MAX_LEN} characters"),
        ));
    }
    Ok(subject)
}

/// Trim and bound a ticket body or reply.
pub fn validate_body(raw: &str) -> DomainResult<String> {
    let body = raw.trim().to_owned();
    if body.is_empty() || body.chars().count() > TICKET_BODY_MAX_LEN {
        return Err(DomainError::invalid(
            "body",
            format!("must be between 1 and {TICKET_BODY_MAX_LEN} characters"),
        ));
    }
    Ok(body)
}

/// Trim and bound a report category.
///
/// Free text rather than an enum: the categories on the report form are a
/// product decision that changes without a migration, and a report filed under
/// a category that has since been renamed should still read correctly.
pub fn validate_category(raw: &str) -> DomainResult<String> {
    let category = raw.trim().to_lowercase();
    if category.is_empty() || category.chars().count() > 48 {
        return Err(DomainError::invalid(
            "category",
            "must be between 1 and 48 characters",
        ));
    }
    Ok(category)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_and_pending_are_still_live() {
        assert!(!TicketStatus::Open.is_terminal());
        assert!(!TicketStatus::Pending.is_terminal());
        assert!(TicketStatus::Resolved.is_terminal());
        assert!(TicketStatus::Closed.is_terminal());
    }

    #[test]
    fn subjects_are_trimmed_and_bounded() {
        assert_eq!(validate_subject("  hello  ").unwrap(), "hello");
        assert!(validate_subject("   ").is_err());
        assert!(validate_subject(&"x".repeat(TICKET_SUBJECT_MAX_LEN + 1)).is_err());
    }

    #[test]
    fn bodies_are_trimmed_and_bounded() {
        assert_eq!(validate_body(" a report ").unwrap(), "a report");
        assert!(validate_body("").is_err());
        assert!(validate_body(&"x".repeat(TICKET_BODY_MAX_LEN + 1)).is_err());
    }

    #[test]
    fn categories_are_normalised_to_lower_case() {
        // So "Harassment" and "harassment" group together in the queue.
        assert_eq!(validate_category("Harassment").unwrap(), "harassment");
        assert!(validate_category("").is_err());
    }
}
