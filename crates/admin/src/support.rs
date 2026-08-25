//! The support queue: reports and help requests, and the threads on them.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::platform::PlatformRole;
use genzh_domain::support::{
    SubjectType, Ticket, TicketKind, TicketMessage, TicketStatus, validate_body, validate_category,
    validate_subject,
};
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use uuid::Uuid;

use crate::audit::{AuditLog, AuditRecord};

/// What somebody raising a ticket supplies.
#[derive(Debug, Clone)]
pub struct NewTicket {
    pub kind: TicketKind,
    pub subject_type: Option<SubjectType>,
    pub subject_id: Option<Uuid>,
    pub category: String,
    pub subject: String,
    pub details: String,
}

/// How to narrow the queue.
#[derive(Debug, Clone, Default)]
pub struct TicketQuery {
    pub status: Option<TicketStatus>,
    pub kind: Option<TicketKind>,
    pub assignee_id: Option<UserId>,
    pub q: Option<String>,
    pub limit: i64,
}

/// Reports, help requests, and everything staff do to them.
#[derive(Clone)]
pub struct SupportService {
    pool: DbPool,
    audit: AuditLog,
}

impl SupportService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// Raise a ticket.
    ///
    /// Open to any signed-in account, including one that is being reported —
    /// the queue is where abuse is judged, and refusing input from somebody
    /// already accused would be judging it at the door.
    pub async fn open(&self, reporter: UserId, input: NewTicket) -> ServiceResult<Ticket> {
        let category = validate_category(&input.category)?;
        let subject = validate_subject(&input.subject)?;
        let details = validate_body(&input.details)?;

        let ticket = sqlx::query_as::<_, Ticket>(
            "INSERT INTO support_tickets
               (id, kind, reporter_id, subject_type, subject_id, category, subject, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, kind, reporter_id, subject_type, subject_id, category, subject,
                       details, status, assignee_id, created_at, updated_at, resolved_at",
        )
        .bind(Uuid::new_v4())
        .bind(input.kind)
        .bind(reporter)
        .bind(input.subject_type)
        .bind(input.subject_id)
        .bind(&category)
        .bind(&subject)
        .bind(&details)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        tracing::info!(ticket_id = %ticket.id, %reporter, kind = ?input.kind, "support ticket opened");
        Ok(ticket)
    }

    /// The queue, oldest first — the person waiting longest is served first.
    pub async fn list(&self, query: TicketQuery) -> ServiceResult<Vec<Ticket>> {
        let search_pattern = query.q.and_then(|q| {
            let t = q.trim().to_lowercase();
            if t.is_empty() { None } else { Some(format!("%{t}%")) }
        });

        let tickets = sqlx::query_as::<_, Ticket>(
            "SELECT id, kind, reporter_id, subject_type, subject_id, category, subject,
                    details, status, assignee_id, created_at, updated_at, resolved_at
             FROM support_tickets
             WHERE ($1::support_ticket_status IS NULL OR status = $1)
               AND ($2::support_ticket_kind IS NULL OR kind = $2)
               AND ($3::uuid IS NULL OR assignee_id = $3)
               AND ($4::text IS NULL OR lower(subject) LIKE $4 OR lower(category) LIKE $4 OR lower(details) LIKE $4)
             ORDER BY created_at ASC
             LIMIT $5",
        )
        .bind(query.status)
        .bind(query.kind)
        .bind(query.assignee_id)
        .bind(search_pattern)
        .bind(query.limit.clamp(1, 200))
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(tickets)
    }

    /// The tickets one account raised.
    pub async fn list_for_reporter(&self, reporter: UserId) -> ServiceResult<Vec<Ticket>> {
        let tickets = sqlx::query_as::<_, Ticket>(
            "SELECT id, kind, reporter_id, subject_type, subject_id, category, subject,
                    details, status, assignee_id, created_at, updated_at, resolved_at
             FROM support_tickets
             WHERE reporter_id = $1
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .bind(reporter)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(tickets)
    }

    /// One ticket, if this caller is allowed to see it.
    ///
    /// Staff see every ticket; everybody else sees only their own. Written as
    /// one method rather than two so there is a single place where that rule
    /// lives — a separate `get_for_staff` is how a handler ends up calling the
    /// unchecked one.
    pub async fn find_for(&self, caller: UserId, role: PlatformRole, id: Uuid) -> ServiceResult<Ticket> {
        let ticket = sqlx::query_as::<_, Ticket>(
            "SELECT id, kind, reporter_id, subject_type, subject_id, category, subject,
                    details, status, assignee_id, created_at, updated_at, resolved_at
             FROM support_tickets WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("ticket"))?;

        if !role.is_staff() && ticket.reporter_id != caller {
            // Not "forbidden": that would confirm the ticket exists to somebody
            // guessing ids.
            return Err(ServiceError::not_found("ticket"));
        }

        Ok(ticket)
    }

    /// A ticket's thread, filtered for who is reading it.
    ///
    /// Internal notes are dropped for a non-staff reader. The filter is here
    /// rather than in the handler because it is the whole reason `staff_only`
    /// exists, and a second read path that forgot it would leak the notes staff
    /// write about the person asking.
    pub async fn thread_for(
        &self,
        caller: UserId,
        role: PlatformRole,
        ticket_id: Uuid,
    ) -> ServiceResult<Vec<TicketMessage>> {
        // Re-checks visibility, so a thread cannot be read without the ticket.
        self.find_for(caller, role, ticket_id).await?;

        let messages = sqlx::query_as::<_, TicketMessage>(
            "SELECT id, ticket_id, author_id, body, staff_only, created_at
             FROM support_messages
             WHERE ticket_id = $1 AND ($2 OR staff_only = FALSE)
             ORDER BY created_at ASC",
        )
        .bind(ticket_id)
        .bind(role.is_staff())
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(messages)
    }

    /// Add a reply, or an internal note.
    pub async fn reply(
        &self,
        caller: UserId,
        role: PlatformRole,
        ticket_id: Uuid,
        body: &str,
        staff_only: bool,
    ) -> ServiceResult<TicketMessage> {
        let ticket = self.find_for(caller, role, ticket_id).await?;
        let body = validate_body(body)?;

        // Only staff can write a note nobody else can read; a reporter asking
        // for one would just be writing an invisible message to themselves.
        let staff_only = staff_only && role.is_staff();

        let message = sqlx::query_as::<_, TicketMessage>(
            "INSERT INTO support_messages (id, ticket_id, author_id, body, staff_only)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, ticket_id, author_id, body, staff_only, created_at",
        )
        .bind(Uuid::new_v4())
        .bind(ticket_id)
        .bind(caller)
        .bind(&body)
        .bind(staff_only)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        // A staff reply puts the ticket back on the reporter; a reporter reply
        // puts it back in the queue. Notes change nothing, because nobody has
        // been answered.
        if !staff_only {
            let next = if role.is_staff() {
                TicketStatus::Pending
            } else {
                TicketStatus::Open
            };
            if !ticket.status.is_terminal() {
                self.write_status(ticket_id, next).await?;
            }
        }

        Ok(message)
    }

    /// Take a ticket, or hand it to somebody else.
    pub async fn assign(
        &self,
        actor: UserId,
        actor_handle: &str,
        ticket_id: Uuid,
        assignee: Option<UserId>,
    ) -> ServiceResult<Ticket> {
        sqlx::query("UPDATE support_tickets SET assignee_id = $2, updated_at = now() WHERE id = $1")
            .bind(ticket_id)
            .bind(assignee)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(actor),
                    AuditAction::TicketAssigned,
                    match assignee {
                        Some(_) => "assigned a support ticket".to_string(),
                        None => "unassigned a support ticket".to_string(),
                    },
                )
                .by(actor_handle)
                .about("ticket", ticket_id)
                .with(serde_json::json!({ "assignee": assignee })),
            )
            .await;

        self.reload(ticket_id).await
    }

    /// Move a ticket through its life.
    pub async fn set_status(
        &self,
        actor: UserId,
        actor_handle: &str,
        ticket_id: Uuid,
        status: TicketStatus,
    ) -> ServiceResult<Ticket> {
        let before = self.reload(ticket_id).await?;
        self.write_status(ticket_id, status).await?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(actor),
                    AuditAction::TicketStatusChanged,
                    format!("moved a ticket from {:?} to {:?}", before.status, status),
                )
                .by(actor_handle)
                .about("ticket", ticket_id)
                .with(serde_json::json!({
                    "from": format!("{:?}", before.status).to_lowercase(),
                    "to": format!("{:?}", status).to_lowercase(),
                })),
            )
            .await;

        self.reload(ticket_id).await
    }

    /// How many tickets are waiting, for the console's badge.
    pub async fn open_count(&self) -> ServiceResult<i64> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT count(*) FROM support_tickets WHERE status = 'open'")
                .fetch_one(&self.pool)
                .await
                .map_err(RepositoryError::from)?;
        Ok(count)
    }

    async fn write_status(&self, ticket_id: Uuid, status: TicketStatus) -> ServiceResult<()> {
        sqlx::query(
            "UPDATE support_tickets
             SET status = $2,
                 resolved_at = CASE WHEN $2 IN ('resolved', 'closed') THEN now() ELSE NULL END,
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(ticket_id)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;
        Ok(())
    }

    async fn reload(&self, ticket_id: Uuid) -> ServiceResult<Ticket> {
        sqlx::query_as::<_, Ticket>(
            "SELECT id, kind, reporter_id, subject_type, subject_id, category, subject,
                    details, status, assignee_id, created_at, updated_at, resolved_at
             FROM support_tickets WHERE id = $1",
        )
        .bind(ticket_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("ticket"))
    }
}
