//! Platform administration: staff, the support queue, and the audit log.
//!
//! Kept in one crate because the three are a single story — staff need
//! somewhere to work, and what they do there has to leave a record. Splitting
//! them would mean the audit log knowing nothing about the actions it exists to
//! describe.

pub mod audit;
pub mod staff;
pub mod support;

pub use audit::{AuditLog, AuditQuery, AuditRecord};
pub use staff::{StaffService, StaffUserView};
pub use support::{NewTicket, SupportService, TicketQuery};
