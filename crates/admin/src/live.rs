//! Live SFU voice and video sessions telemetry and moderation.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::{RoomId, UserId};
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::{Deserialize, Serialize};

use crate::audit::{AuditLog, AuditRecord};

/// Live media room status view.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LiveMediaSessionView {
    pub room_id: RoomId,
    pub room_name: String,
    pub room_type: String,
    pub community_name: Option<String>,
    pub participant_count: i64,
    pub status: String,
    pub started_at: Option<Timestamp>,
}

/// Service for inspecting and terminating live media calls/sessions.
#[derive(Clone)]
pub struct LiveMediaService {
    pool: DbPool,
    audit: AuditLog,
}

impl LiveMediaService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// List currently active media rooms / calls with participant counts.
    pub async fn list_active(&self) -> ServiceResult<Vec<LiveMediaSessionView>> {
        let rows = sqlx::query_as::<_, LiveMediaSessionView>(
            "SELECT r.id AS room_id, r.name AS room_name, r.room_type::text AS room_type,
                    c.name AS community_name,
                    COUNT(rp.user_id)::bigint AS participant_count,
                    r.status::text AS status,
                    r.started_at
             FROM rooms r
             LEFT JOIN communities c ON c.id = r.community_id
             LEFT JOIN room_participants rp ON rp.room_id = r.id
             WHERE r.status = 'active'
                OR rp.user_id IS NOT NULL
             GROUP BY r.id, r.name, r.room_type, c.name, r.status, r.started_at
             ORDER BY participant_count DESC, r.started_at DESC NULLS LAST
             LIMIT 50",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Forcefully terminate a live media session / room.
    pub async fn terminate_session(
        &self,
        staff_id: UserId,
        staff_handle: &str,
        room_id: RoomId,
    ) -> ServiceResult<()> {
        let room_name: Option<(String,)> =
            sqlx::query_as("SELECT name FROM rooms WHERE id = $1")
                .bind(room_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        let Some((room_name,)) = room_name else {
            return Err(ServiceError::not_found("room"));
        };

        // Reset room status and remove participants
        sqlx::query("UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1")
            .bind(room_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        sqlx::query("DELETE FROM room_participants WHERE room_id = $1")
            .bind(room_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(staff_id),
                    AuditAction::MediaSessionForceEnded,
                    format!("forcefully terminated live media session in '{room_name}'"),
                )
                .by(staff_handle)
                .about("room", room_id.as_uuid())
                .with(serde_json::json!({ "room_name": room_name })),
            )
            .await;

        Ok(())
    }
}
