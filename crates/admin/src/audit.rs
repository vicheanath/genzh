//! Writing and reading the audit log.

use genzh_domain::audit::{AuditAction, AuditEntry};
use genzh_domain::ids::UserId;
use genzh_infrastructure::{DbPool, RepositoryResult};
use uuid::Uuid;

/// What to record about one action.
///
/// Built by the caller on the success path of whatever it is describing, so an
/// entry existing means the action happened — never that it was attempted.
#[derive(Debug, Clone)]
pub struct AuditRecord {
    pub actor_id: Option<UserId>,
    pub actor_handle: Option<String>,
    pub action: AuditAction,
    pub subject_type: Option<String>,
    pub subject_id: Option<Uuid>,
    pub summary: String,
    pub metadata: serde_json::Value,
}

impl AuditRecord {
    /// A record with nothing but the essentials; fill the rest with the
    /// builders below.
    pub fn new(actor: Option<UserId>, action: AuditAction, summary: impl Into<String>) -> Self {
        Self {
            actor_id: actor,
            actor_handle: None,
            action,
            subject_type: None,
            subject_id: None,
            summary: summary.into(),
            metadata: serde_json::Value::Object(Default::default()),
        }
    }

    /// Name the actor, so the entry still reads after their account is gone.
    pub fn by(mut self, handle: impl Into<String>) -> Self {
        self.actor_handle = Some(handle.into());
        self
    }

    /// What was acted on.
    pub fn about(mut self, subject_type: impl Into<String>, subject_id: Uuid) -> Self {
        self.subject_type = Some(subject_type.into());
        self.subject_id = Some(subject_id);
        self
    }

    /// What category was acted on when there is no UUID entity id.
    pub fn about_type(mut self, subject_type: impl Into<String>) -> Self {
        self.subject_type = Some(subject_type.into());
        self
    }

    /// Anything the action needs that the summary does not carry.
    pub fn with(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = metadata;
        self
    }
}

/// How to narrow a read of the log.
#[derive(Debug, Clone, Default)]
pub struct AuditQuery {
    pub actor_id: Option<UserId>,
    pub action: Option<String>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub subject_id: Option<Uuid>,
    /// Keyset cursor: return entries strictly older than this.
    pub before: Option<chrono::DateTime<chrono::Utc>>,
    pub limit: i64,
}

/// The audit log.
///
/// Append and read; deliberately no update and no delete. The absence of those
/// methods is the guarantee — a trail its subjects can revise is decoration,
/// and the cheapest way to keep it honest is to give the application no way to
/// do it.
#[derive(Clone)]
pub struct AuditLog {
    pool: DbPool,
}

impl AuditLog {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Append one entry.
    pub async fn record(&self, entry: AuditRecord) -> RepositoryResult<()> {
        sqlx::query(
            "INSERT INTO audit_log
               (id, actor_id, actor_handle, action, subject_type, subject_id, summary, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(Uuid::new_v4())
        .bind(entry.actor_id)
        .bind(&entry.actor_handle)
        .bind(entry.action.key())
        .bind(&entry.subject_type)
        .bind(entry.subject_id)
        .bind(&entry.summary)
        .bind(&entry.metadata)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Append without letting a logging failure fail the action.
    ///
    /// Used where the action has already been committed: the alternative is
    /// telling the caller their suspension failed when it did not, and leaving
    /// them to retry something that already took effect. The failure is logged
    /// loudly instead, because a silently missing audit entry is its own
    /// incident.
    pub async fn record_best_effort(&self, entry: AuditRecord) {
        let action = entry.action;
        if let Err(error) = self.record(entry).await {
            tracing::error!(%error, %action, "audit entry could not be written");
        }
    }

    /// Read the log, newest first.
    pub async fn list(&self, query: AuditQuery) -> RepositoryResult<Vec<AuditEntry>> {
        let limit = query.limit.clamp(1, 200);
        let category_pattern = query.category.map(|c| format!("{c}.%"));
        let search_pattern = query.q.and_then(|q| {
            let t = q.trim().to_lowercase();
            if t.is_empty() { None } else { Some(format!("%{t}%")) }
        });

        // Every filter is optional, so each predicate is written to pass when
        // its parameter is null rather than building SQL by string
        // concatenation — which is how an audit reader grows an injection.
        let entries = sqlx::query_as::<_, AuditEntry>(
            "SELECT id, actor_id, actor_handle, action, subject_type, subject_id,
                    summary, metadata, created_at
             FROM audit_log
             WHERE ($1::uuid IS NULL OR actor_id = $1)
               AND ($2::text IS NULL OR action = $2)
               AND ($3::uuid IS NULL OR subject_id = $3)
               AND ($4::timestamptz IS NULL OR created_at < $4)
               AND ($5::text IS NULL OR action LIKE $5)
               AND ($6::text IS NULL OR lower(summary) LIKE $6 OR lower(coalesce(actor_handle, '')) LIKE $6 OR lower(action) LIKE $6)
             ORDER BY created_at DESC, id DESC
             LIMIT $7",
        )
        .bind(query.actor_id)
        .bind(&query.action)
        .bind(query.subject_id)
        .bind(query.before)
        .bind(category_pattern)
        .bind(search_pattern)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(entries)
    }
}
