//! The platform console: staff, enforcement, the support queue, and the log.
//!
//! Every route here is gated by an extractor rather than by a check inside the
//! handler — [`StaffUser`] for reading the queue, [`AdminUser`] for anything
//! that changes an account. A handler that forgets to authorize is then not a
//! handler that compiles wrong; it is one that cannot be written, because the
//! caller's authority is its argument.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use genzh_admin::{AuditQuery, AuditRecord, NewTicket, Page, TicketQuery, UserSearch};
use genzh_domain::DomainError;
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
    pub category: Option<String>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub subject_id: Option<Uuid>,
    /// Keyset cursor: entries strictly older than this.
    #[serde(default)]
    pub before: Option<Timestamp>,
    /// Tie-breaker for `before`, from the previous page's `next_cursor_id`.
    ///
    /// Optional so a client sending only `before` keeps working; sending both
    /// is what stops a page boundary from falling inside a group of entries
    /// that share a timestamp — which every bulk action produces.
    #[serde(default)]
    pub before_id: Option<Uuid>,
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
) -> ApiResult<Json<Page<AuditEntry>>> {
    let page = state
        .audit
        .list(AuditQuery {
            actor_id: filter.actor_id,
            action: filter.action,
            category: filter.category,
            q: filter.q,
            subject_id: filter.subject_id,
            before: filter.before,
            before_id: filter.before_id,
            limit: filter.limit.unwrap_or(50),
        })
        .await
        .map_err(|_| ApiError::BadRequest("could not read the audit log".into()))?;

    Ok(Json(page))
}

/// `GET /api/v1/admin/audit/actions`
///
/// The catalogue the console's filter renders, so it cannot offer an action the
/// server never writes.
pub async fn audit_actions(_admin: AdminUser) -> Json<Vec<&'static str>> {
    Json(AuditAction::ALL.iter().map(|a| a.key()).collect())
}

/// `GET /api/v1/admin/stats`
///
/// System overview metrics for the admin console.
pub async fn stats(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<genzh_admin::AdminStats>> {
    Ok(Json(state.staff.stats().await?))
}

// ──────────────────────────────── users ───────────────────────────────

/// `GET /api/v1/admin/users` query string.
#[derive(Debug, Deserialize)]
pub struct UserSearchParams {
    /// Handle or e-mail, matched as a substring.
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub role: Option<PlatformRole>,
    #[serde(default)]
    pub is_active: Option<bool>,
    /// Keyset cursor: accounts created strictly before this.
    #[serde(default)]
    pub before: Option<Timestamp>,
    /// Tie-breaker for `before`, from the previous page's `next_cursor_id`.
    #[serde(default)]
    pub before_id: Option<Uuid>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// `GET /api/v1/admin/users`
///
/// Search and filter accounts on the platform.
pub async fn search_users(
    State(state): State<AppState>,
    _staff: StaffUser,
    Query(params): Query<UserSearchParams>,
) -> ApiResult<Json<Page<genzh_admin::StaffUserView>>> {
    Ok(Json(
        state
            .staff
            .search_users(UserSearch {
                q: params.q,
                role: params.role,
                is_active: params.is_active,
                before: params.before,
                before_id: params.before_id,
                limit: params.limit.unwrap_or(25),
            })
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
    pub q: Option<String>,
    /// Keyset cursor: tickets raised strictly *after* this.
    ///
    /// Forwards, because the queue is oldest-first: the longest wait is on top,
    /// so the next page is further down the backlog.
    #[serde(default)]
    pub after: Option<Timestamp>,
    /// Tie-breaker for `after`, from the previous page's `next_cursor_id`.
    #[serde(default)]
    pub after_id: Option<Uuid>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// The queue, plus the number waiting.
#[derive(Debug, Serialize)]
pub struct TicketQueueResponse {
    /// One page of the queue, with the cursor for the next.
    #[serde(flatten)]
    pub page: Page<Ticket>,
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
    let page = state
        .support
        .list(TicketQuery {
            status: filter.status,
            kind: filter.kind,
            assignee_id: filter.assignee_id,
            q: filter.q,
            after: filter.after,
            after_id: filter.after_id,
            limit: filter.limit.unwrap_or(50),
        })
        .await?;

    Ok(Json(TicketQueueResponse {
        page,
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

// ────────────────────────── ticket assignment ─────────────────────────

#[derive(Debug, Deserialize)]
pub struct AssignTicketRequest {
    pub assignee_id: Option<UserId>,
}

/// `PUT /api/v1/admin/tickets/{id}/assign`
pub async fn assign_ticket(
    State(state): State<AppState>,
    staff: StaffUser,
    Path(ticket_id): Path<Uuid>,
    ApiJson(body): ApiJson<AssignTicketRequest>,
) -> ApiResult<Json<Ticket>> {
    let handle = state.staff.find_user(staff.user_id).await?.handle;
    Ok(Json(
        state
            .support
            .assign(staff.user_id, &handle, ticket_id, body.assignee_id)
            .await?,
    ))
}

// ──────────────────────────── communities ─────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AdminCommunityFilter {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub is_quarantined: Option<bool>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// `GET /api/v1/admin/communities`
pub async fn list_admin_communities(
    State(state): State<AppState>,
    _staff: StaffUser,
    Query(filter): Query<AdminCommunityFilter>,
) -> ApiResult<Json<Vec<genzh_admin::AdminCommunityView>>> {
    Ok(Json(
        state
            .admin_communities
            .list(genzh_admin::CommunitySearchQuery {
                q: filter.q,
                is_quarantined: filter.is_quarantined,
                limit: filter.limit.unwrap_or(50),
            })
            .await?,
    ))
}

#[derive(Debug, Deserialize)]
pub struct QuarantineCommunityRequest {
    pub reason: String,
}

/// `POST /api/v1/admin/communities/{id}/quarantine`
pub async fn quarantine_community(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(community_id): Path<genzh_domain::CommunityId>,
    ApiJson(body): ApiJson<QuarantineCommunityRequest>,
) -> ApiResult<Json<genzh_admin::AdminCommunityView>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .admin_communities
            .quarantine(admin.user_id, &handle, community_id, &body.reason)
            .await?,
    ))
}

/// `POST /api/v1/admin/communities/{id}/unquarantine`
pub async fn unquarantine_community(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(community_id): Path<genzh_domain::CommunityId>,
) -> ApiResult<Json<genzh_admin::AdminCommunityView>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .admin_communities
            .unquarantine(admin.user_id, &handle, community_id)
            .await?,
    ))
}

/// `DELETE /api/v1/admin/communities/{id}`
pub async fn delete_admin_community(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(community_id): Path<genzh_domain::CommunityId>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .admin_communities
        .delete_community(admin.user_id, &handle, community_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ──────────────────────────── live media ──────────────────────────────

/// `GET /api/v1/admin/live`
pub async fn list_live_media(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<Vec<genzh_admin::LiveMediaSessionView>>> {
    Ok(Json(state.live_media.list_active().await?))
}

/// `POST /api/v1/admin/live/{id}/terminate`
pub async fn terminate_live_media(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(room_id): Path<genzh_domain::RoomId>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .live_media
        .terminate_session(admin.user_id, &handle, room_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ──────────────────────────── broadcasts ──────────────────────────────

/// `GET /api/v1/broadcasts/active`
pub async fn list_active_broadcasts(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<genzh_admin::SystemBroadcast>>> {
    Ok(Json(state.broadcasts.list_active().await?))
}

/// `GET /api/v1/admin/broadcasts`
pub async fn list_admin_broadcasts(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<Vec<genzh_admin::SystemBroadcast>>> {
    Ok(Json(state.broadcasts.list_all().await?))
}

/// `POST /api/v1/admin/broadcasts`
pub async fn create_broadcast(
    State(state): State<AppState>,
    admin: AdminUser,
    ApiJson(body): ApiJson<genzh_admin::NewBroadcast>,
) -> ApiResult<Json<genzh_admin::SystemBroadcast>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .broadcasts
            .create(admin.user_id, &handle, body)
            .await?,
    ))
}

/// `DELETE /api/v1/admin/broadcasts/{id}`
pub async fn dismiss_broadcast(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(broadcast_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .broadcasts
        .dismiss(admin.user_id, &handle, broadcast_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ──────────────────────────── settings & flags ────────────────────────

/// `GET /api/v1/admin/settings`
pub async fn get_settings(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<std::collections::HashMap<String, serde_json::Value>>> {
    Ok(Json(state.settings.get_all().await?))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingRequest {
    pub key: String,
    pub value: serde_json::Value,
}

/// `PUT /api/v1/admin/settings`
pub async fn update_setting(
    State(state): State<AppState>,
    admin: AdminUser,
    ApiJson(body): ApiJson<UpdateSettingRequest>,
) -> ApiResult<Json<genzh_admin::SystemSetting>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .settings
            .set(admin.user_id, &handle, &body.key, body.value)
            .await?,
    ))
}

// ──────────────────────────── security bans ───────────────────────────

/// `GET /api/v1/admin/security/ip-bans`
pub async fn list_ip_bans(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<Vec<genzh_admin::IpBan>>> {
    Ok(Json(state.security.list_ip_bans().await?))
}

#[derive(Debug, Deserialize)]
pub struct BanIpRequest {
    pub ip_or_cidr: String,
    pub reason: String,
    pub expires_at: Option<Timestamp>,
}

/// `POST /api/v1/admin/security/ip-bans`
pub async fn ban_ip(
    State(state): State<AppState>,
    admin: AdminUser,
    ApiJson(body): ApiJson<BanIpRequest>,
) -> ApiResult<Json<genzh_admin::IpBan>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .security
            .ban_ip(
                admin.user_id,
                &handle,
                &body.ip_or_cidr,
                &body.reason,
                body.expires_at,
            )
            .await?,
    ))
}

/// `DELETE /api/v1/admin/security/ip-bans/{id}`
pub async fn unban_ip(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(ban_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state.security.unban_ip(admin.user_id, &handle, ban_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/admin/security/email-domains`
pub async fn list_blocked_email_domains(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<Vec<genzh_admin::BlockedEmailDomain>>> {
    Ok(Json(state.security.list_email_domains().await?))
}

#[derive(Debug, Deserialize)]
pub struct BlockDomainRequest {
    pub domain: String,
    pub reason: Option<String>,
}

/// `POST /api/v1/admin/security/email-domains`
pub async fn block_email_domain(
    State(state): State<AppState>,
    admin: AdminUser,
    ApiJson(body): ApiJson<BlockDomainRequest>,
) -> ApiResult<Json<genzh_admin::BlockedEmailDomain>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .security
            .block_email_domain(
                admin.user_id,
                &handle,
                &body.domain,
                body.reason.as_deref(),
            )
            .await?,
    ))
}

/// `DELETE /api/v1/admin/security/email-domains/{domain}`
pub async fn unblock_email_domain(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(domain): Path<String>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .security
        .unblock_email_domain(admin.user_id, &handle, &domain)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ──────────────────────────── automod rules ───────────────────────────

/// `GET /api/v1/admin/automod`
pub async fn list_automod_rules(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<Vec<genzh_admin::AutomodRule>>> {
    Ok(Json(state.automod.list().await?))
}

/// `POST /api/v1/admin/automod`
pub async fn create_automod_rule(
    State(state): State<AppState>,
    admin: AdminUser,
    ApiJson(body): ApiJson<genzh_admin::NewAutomodRule>,
) -> ApiResult<Json<genzh_admin::AutomodRule>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .automod
            .create(admin.user_id, &handle, body)
            .await?,
    ))
}

/// `DELETE /api/v1/admin/automod/{id}`
pub async fn delete_automod_rule(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(rule_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .automod
        .delete(admin.user_id, &handle, rule_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ────────────────────────── system telemetry ──────────────────────────

/// `GET /api/v1/admin/system/health`
pub async fn system_health_telemetry(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> ApiResult<Json<genzh_admin::SystemHealthTelemetry>> {
    Ok(Json(state.telemetry.get_health().await?))
}

/// One background job, as the console renders it.
///
/// A view type rather than [`genzh_cron::JobStats`] itself: the scheduler
/// measures in [`std::time::Duration`], which has no obvious JSON shape, and
/// `healthy` is a judgement about the numbers rather than one of them. Keeping
/// the translation here leaves the scheduler crate with no opinion about HTTP.
#[derive(Debug, Clone, Serialize)]
pub struct JobReport {
    /// Registered name, e.g. `rooms.prune_stale_participants`.
    pub name: String,
    /// Executions since this process started, scheduled and manual alike.
    pub total_runs: u64,
    pub successes: u64,
    pub failures: u64,
    /// When the most recent run finished; `null` if it has not run yet.
    pub last_run_at: Option<Timestamp>,
    /// How long that run took.
    pub last_duration_ms: Option<u64>,
    /// What it failed with, if it did. Cleared by the next success.
    pub last_error: Option<String>,
    /// Whether the *most recent* run succeeded.
    ///
    /// Deliberately not "has never failed": a job that failed once at 03:00 and
    /// has been fine since is not something to wake anybody for, and a console
    /// that says otherwise trains people to ignore it.
    pub healthy: bool,
}

impl JobReport {
    fn new(name: &str, stats: genzh_cron::JobStats) -> Self {
        Self {
            name: name.to_owned(),
            total_runs: stats.total_runs,
            successes: stats.successes,
            failures: stats.failures,
            last_run_at: stats.last_run_at,
            last_duration_ms: stats
                .last_duration
                .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX)),
            healthy: !stats.is_failing(),
            last_error: stats.last_error,
        }
    }
}

/// `GET /api/v1/admin/system/jobs`
///
/// What the background scheduler has been doing. Staff rather than admin: this
/// is diagnosis, and the numbers name no accounts.
///
/// The counters are per-process and reset on restart — they describe *this*
/// instance, which is the honest scope for an in-process scheduler.
pub async fn system_jobs(
    State(state): State<AppState>,
    _staff: StaffUser,
) -> Json<Vec<JobReport>> {
    let mut reports: Vec<JobReport> = state
        .scheduler
        .stats()
        .into_iter()
        .map(|(name, stats)| JobReport::new(name, stats))
        .collect();

    // Failing jobs first, then alphabetically: the console should not need to
    // be scrolled to find the one thing that is wrong.
    reports.sort_by(|a, b| a.healthy.cmp(&b.healthy).then_with(|| a.name.cmp(&b.name)));
    Json(reports)
}

/// `POST /api/v1/admin/system/jobs/{name}/run`
///
/// Run one job now rather than waiting for its next tick.
///
/// Admin rather than staff, and audited: every job here deletes rows, and
/// "why did five hundred sessions vanish at 14:03" should be answerable from
/// the log rather than from a guess about timers.
///
/// A job that fails still returns 200 with the failure in the body. The request
/// succeeded — the console asked for a run and got one — and reporting that as
/// a 500 would tell the caller their button was broken when the job was.
pub async fn run_system_job(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(name): Path<String>,
) -> ApiResult<Json<JobReport>> {
    let outcome = state
        .scheduler
        .run_now(&name)
        .await
        .ok_or(ApiError::Domain(DomainError::NotFound("job")))?;

    if let Err(error) = &outcome {
        tracing::warn!(job = %name, %error, "manually triggered cron job failed");
    }

    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .audit
        .record_best_effort(
            AuditRecord::new(
                Some(admin.user_id),
                AuditAction::SystemJobTriggered,
                format!("ran the background job '{name}' by hand"),
            )
            .by(handle)
            .about_type("system_job")
            .with(serde_json::json!({
                "job": name,
                "succeeded": outcome.is_ok(),
                "error": outcome.as_ref().err().map(ToString::to_string),
            })),
        )
        .await;

    let stats = state
        .scheduler
        .job_stats(&name)
        .ok_or(ApiError::Domain(DomainError::NotFound("job")))?;

    Ok(Json(JobReport::new(&name, stats)))
}

// ────────────────────── user session moderation ───────────────────────

/// `POST /api/v1/admin/users/{id}/revoke-sessions`
pub async fn revoke_user_sessions(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target_user): Path<UserId>,
) -> ApiResult<StatusCode> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    state
        .staff
        .revoke_all_sessions(admin.user_id, &handle, target_user)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct StaffUpdateProfileRequest {
    pub handle: Option<String>,
    pub display_name: Option<String>,
}

/// `PATCH /api/v1/admin/users/{id}/profile`
pub async fn staff_update_user_profile(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target_user): Path<UserId>,
    ApiJson(body): ApiJson<StaffUpdateProfileRequest>,
) -> ApiResult<Json<genzh_admin::StaffUserView>> {
    let handle = state.staff.find_user(admin.user_id).await?.handle;
    Ok(Json(
        state
            .staff
            .update_user_profile(
                admin.user_id,
                &handle,
                target_user,
                body.handle,
                body.display_name,
            )
            .await?,
    ))
}
