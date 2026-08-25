//! The platform console: staff, enforcement, the support queue, and the log.
//!
//! Every route here is gated by an extractor rather than by a check inside the
//! handler — [`StaffUser`] for reading the queue, [`AdminUser`] for anything
//! that changes an account. A handler that forgets to authorize is then not a
//! handler that compiles wrong; it is one that cannot be written, because the
//! caller's authority is its argument.

use axum::Json;
use axum::extract::{Path, Query, State};
use genzh_admin::{AuditQuery, NewTicket, TicketQuery};
use genzh_domain::audit::{AuditAction, AuditEntry};
use genzh_domain::platform::PlatformRole;
use genzh_domain::support::{SubjectType, Ticket, TicketKind, TicketMessage, TicketStatus};
use genzh_domain::{Timestamp, UserId};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::extract::ApiJson;
use crate::middleware::{AdminUser, CurrentUser, StaffUser};
use crate::state::AppState;

// ────────────────────────────── audit log ─────────────────────────────

/// `GET /api/v1/admin/audit` query string.
#[derive(Debug, Deserialize)]
pub struct AuditFilter {
    #[serde(default)]
    pub actor_id: Option<UserId>,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub subject_id: Option<Uuid>,
    /// Keyset cursor: entries strictly older than this.
    #[serde(default)]
    pub before: Option<Timestamp>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// `GET /api/v1/admin/audit`
///
/// Admin only. Not because reading is dangerous, but because the log records
/// enforcement against real accounts and the fewer people who can page through
/// that history, the better.
pub async fn audit(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(filter): Query<AuditFilter>,
) -> ApiResult<Json<Vec<AuditEntry>>> {
    let entries = state
        .audit
        .list(AuditQuery {
            actor_id: filter.actor_id,
            action: filter.action,
            subject_id: filter.subject_id,
            before: filter.before,
            limit: filter.limit.unwrap_or(50),
        })
        .await
        .map_err(|_| ApiError::BadRequest("could not read the audit log".into()))?;

    Ok(Json(entries))
}

/// `GET /api/v1/admin/audit/actions`
///
/// The catalogue the console's filter renders, so it cannot offer an action the
/// server never writes.
pub async fn audit_actions(_admin: AdminUser) -> Json<Vec<&'static str>> {
    Json(AuditAction::ALL.iter().map(|a| a.key()).collect())
}

// ──────────────────────────────── users ───────────────────────────────

/// `GET /api/v1/admin/users` query string.
#[derive(Debug, Deserialize)]
pub struct UserSearch {
    /// Handle or e-mail, matched as a substring.
    pub q: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// `GET /api/v1/admin/users`
///
/// Search, never list: support is given a handle and needs to find it, which is
/// not the same as being able to page through every account on the platform.
pub async fn search_users(
    State(state): State<AppState>,
    _staff: StaffUser,
    Query(search): Query<UserSearch>,
) -> ApiResult<Json<Vec<genzh_admin::StaffUserView>>> {
    Ok(Json(
        state
            .staff
            .search_users(&search.q, search.limit.unwrap_or(25))
            .await?,
    ))
}

/// `GET /api/v1/admin/users/{id}`
pub async fn get_user(
    State(state): State<AppState>,
    _staff: StaffUser,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<genzh_admin::StaffUserView>> {
    Ok(Json(state.staff.find_user(user_id).await?))
}

/// `GET /api/v1/admin/staff`
pub async fn list_staff(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> ApiResult<Json<Vec<genzh_admin::StaffUserView>>> {
    Ok(Json(state.staff.list_staff().await?))
}

/// `POST /api/v1/admin/users/{id}/suspend` body.
#[derive(Debug, Deserialize)]
pub struct SuspendRequest {
    /// Why. Recorded in the audit entry, so it is not optional.
    pub reason: String,
}

/// `POST /api/v1/admin/users/{id}/suspend`
pub async fn suspend_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<UserId>,
    ApiJson(body): ApiJson<SuspendRequest>,
) -> ApiResult<Json<genzh_admin::StaffUserView>> {
    let reason = body.reason.trim();
    if reason.is_empty() {
        return Err(ApiError::BadRequest(
            "a suspension needs a reason: it is what the audit entry will say".into(),
        ));
    }

    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .staff
            .suspend(admin.user_id, &handle, user_id, reason)
            .await?,
    ))
}

/// `POST /api/v1/admin/users/{id}/reinstate`
pub async fn reinstate_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<genzh_admin::StaffUserView>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state.staff.reinstate(admin.user_id, &handle, user_id).await?,
    ))
}

/// `PUT /api/v1/admin/users/{id}/platform-role` body.
#[derive(Debug, Deserialize)]
pub struct PlatformRoleRequest {
    pub role: PlatformRole,
}

/// `PUT /api/v1/admin/users/{id}/platform-role`
pub async fn set_platform_role(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<UserId>,
    ApiJson(body): ApiJson<PlatformRoleRequest>,
) -> ApiResult<Json<genzh_admin::StaffUserView>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .staff
            .set_platform_role(admin.user_id, &handle, user_id, body.role)
            .await?,
    ))
}

// ─────────────────────────────── tickets ──────────────────────────────

/// `GET /api/v1/admin/tickets` query string.
#[derive(Debug, Deserialize)]
pub struct TicketFilter {
    #[serde(default)]
    pub status: Option<TicketStatus>,
    #[serde(default)]
    pub kind: Option<TicketKind>,
    #[serde(default)]
    pub assignee_id: Option<UserId>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// The queue, plus the number waiting.
#[derive(Debug, Serialize)]
pub struct TicketQueueResponse {
    pub tickets: Vec<Ticket>,
    /// How many are still `open`, for the console's badge — which must count
    /// every waiting ticket, not just the page that was returned.
    pub open_count: i64,
}

/// `GET /api/v1/admin/tickets`
pub async fn list_tickets(
    State(state): State<AppState>,
    _staff: StaffUser,
    Query(filter): Query<TicketFilter>,
) -> ApiResult<Json<TicketQueueResponse>> {
    let tickets = state
        .support
        .list(TicketQuery {
            status: filter.status,
            kind: filter.kind,
            assignee_id: filter.assignee_id,
            limit: filter.limit.unwrap_or(50),
        })
        .await?;

    Ok(Json(TicketQueueResponse {
        tickets,
        open_count: state.support.open_count().await?,
    }))
}

/// A ticket and its thread.
#[derive(Debug, Serialize)]
pub struct TicketDetailResponse {
    pub ticket: Ticket,
    pub messages: Vec<TicketMessage>,
}

/// `GET /api/v1/admin/tickets/{id}`
pub async fn get_ticket(
    State(state): State<AppState>,
    staff: StaffUser,
    Path(ticket_id): Path<Uuid>,
) -> ApiResult<Json<TicketDetailResponse>> {
    Ok(Json(TicketDetailResponse {
        ticket: state
            .support
            .find_for(staff.user_id, staff.role, ticket_id)
            .await?,
        messages: state
            .support
            .thread_for(staff.user_id, staff.role, ticket_id)
            .await?,
    }))
}

/// `POST /api/v1/admin/tickets/{id}/messages` body.
#[derive(Debug, Deserialize)]
pub struct StaffReplyRequest {
    pub body: String,
    /// An internal note: visible to staff, never returned to the reporter.
    #[serde(default)]
    pub staff_only: bool,
}

/// `POST /api/v1/admin/tickets/{id}/messages`
pub async fn reply_to_ticket(
    State(state): State<AppState>,
    staff: StaffUser,
    Path(ticket_id): Path<Uuid>,
    ApiJson(body): ApiJson<StaffReplyRequest>,
) -> ApiResult<Json<TicketMessage>> {
    let msg = state
        .support
        .reply(staff.user_id, staff.role, ticket_id, &body.body, body.staff_only)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(staff.user_id),
            genzh_domain::audit::AuditAction::TicketReplied,
            format!("Staff reply on ticket {}", ticket_id),
        )
        .about("ticket", ticket_id),
    ).await;

    Ok(Json(msg))
}

/// `PATCH /api/v1/admin/tickets/{id}` body. Absent fields are left alone.
#[derive(Debug, Deserialize)]
pub struct UpdateTicketRequest {
    #[serde(default)]
    pub status: Option<TicketStatus>,
    /// `Some(None)` unassigns; absent leaves the assignee alone.
    #[serde(default, deserialize_with = "double_option")]
    pub assignee_id: Option<Option<UserId>>,
}

/// `PATCH /api/v1/admin/tickets/{id}`
pub async fn update_ticket(
    State(state): State<AppState>,
    staff: StaffUser,
    Path(ticket_id): Path<Uuid>,
    ApiJson(body): ApiJson<UpdateTicketRequest>,
) -> ApiResult<Json<Ticket>> {
    let handle = state.staff.find_user(staff.user_id).await?.handle;

    if let Some(assignee) = body.assignee_id {
        state
            .support
            .assign(staff.user_id, &handle, ticket_id, assignee)
            .await?;
    }

    let ticket = match body.status {
        Some(status) => {
            state
                .support
                .set_status(staff.user_id, &handle, ticket_id, status)
                .await?
        }
        None => {
            state
                .support
                .find_for(staff.user_id, staff.role, ticket_id)
                .await?
        }
    };

    Ok(Json(ticket))
}

/// Distinguish "absent" from "explicitly null" in a PATCH body.
fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

// ──────────────────── the user-facing half of support ─────────────────

/// `POST /api/v1/support/tickets` body.
#[derive(Debug, Deserialize)]
pub struct OpenTicketRequest {
    #[serde(default = "default_kind")]
    pub kind: TicketKind,
    #[serde(default)]
    pub subject_type: Option<SubjectType>,
    #[serde(default)]
    pub subject_id: Option<Uuid>,
    pub category: String,
    pub subject: String,
    pub details: String,
}

fn default_kind() -> TicketKind {
    TicketKind::Report
}

/// `POST /api/v1/support/tickets`
///
/// Open to any signed-in account. This is what the Report Abuse form posts to —
/// it previously showed a success message and discarded the report.
pub async fn open_ticket(
    State(state): State<AppState>,
    caller: CurrentUser,
    ApiJson(body): ApiJson<OpenTicketRequest>,
) -> ApiResult<Json<Ticket>> {
    let ticket = state
        .support
        .open(
            caller.user_id,
            NewTicket {
                kind: body.kind,
                subject_type: body.subject_type,
                subject_id: body.subject_id,
                category: body.category,
                subject: body.subject,
                details: body.details,
            },
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::TicketOpened,
            format!("Ticket '{}' opened", ticket.subject),
        )
        .about("ticket", ticket.id),
    ).await;

    Ok(Json(ticket))
}

/// `GET /api/v1/support/tickets`
///
/// The caller's own tickets, so somebody who reported something can see whether
/// anyone answered.
pub async fn my_tickets(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<Ticket>>> {
    Ok(Json(state.support.list_for_reporter(caller.user_id).await?))
}

/// `GET /api/v1/support/tickets/{id}`
pub async fn my_ticket(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(ticket_id): Path<Uuid>,
) -> ApiResult<Json<TicketDetailResponse>> {
    Ok(Json(TicketDetailResponse {
        ticket: state
            .support
            .find_for(caller.user_id, PlatformRole::User, ticket_id)
            .await?,
        // `PlatformRole::User` even when the caller is staff: this is the
        // reporter's view of their own ticket, and it must not show the
        // internal notes just because the person reading happens to be staff.
        messages: state
            .support
            .thread_for(caller.user_id, PlatformRole::User, ticket_id)
            .await?,
    }))
}

/// `POST /api/v1/support/tickets/{id}/messages` body.
#[derive(Debug, Deserialize)]
pub struct ReplyRequest {
    pub body: String,
}

/// `POST /api/v1/support/tickets/{id}/messages`
pub async fn reply_to_my_ticket(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(ticket_id): Path<Uuid>,
    ApiJson(body): ApiJson<ReplyRequest>,
) -> ApiResult<Json<TicketMessage>> {
    let msg = state
        .support
        .reply(
            caller.user_id,
            PlatformRole::User,
            ticket_id,
            &body.body,
            false,
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::TicketReplied,
            format!("Reply on ticket {}", ticket_id),
        )
        .about("ticket", ticket_id),
    ).await;

    Ok(Json(msg))
}
