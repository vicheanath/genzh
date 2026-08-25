//! Invite links.
//!
//! Joining used to mean pasting a community's UUID, which is not something
//! anybody sends a friend. A code is short, revocable, and can be given a life
//! of its own — an expiry, a use limit — none of which a raw id can carry.

use genzh_domain::community::Community;
use genzh_domain::{CommunityId, Permission, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::Serialize;

use crate::service::CommunityService;

/// Characters an invite code is built from.
///
/// No `0`/`O` or `1`/`l`: codes get read aloud and typed from screenshots, and
/// the pairs that look alike are the ones that turn into "that link is broken".
const ALPHABET: &[u8] = b"23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN: usize = 8;

/// An invite, as its creator sees it.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Invite {
    pub code: String,
    pub community_id: CommunityId,
    pub created_by: Option<UserId>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub max_uses: Option<i32>,
    pub uses: i32,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl Invite {
    /// Would this link work right now?
    pub fn is_usable(&self) -> bool {
        if self.revoked_at.is_some() {
            return false;
        }
        if let Some(expires) = self.expires_at
            && expires <= chrono::Utc::now()
        {
            return false;
        }
        if let Some(max) = self.max_uses
            && self.uses >= max
        {
            return false;
        }
        true
    }
}

/// What somebody sees *before* accepting an invite.
///
/// Deliberately not the full community: this is shown to a stranger who has a
/// link and nothing else, so it carries what is needed to decide whether to
/// join and no more.
#[derive(Debug, Clone, Serialize)]
pub struct InvitePreview {
    pub code: String,
    pub community_id: CommunityId,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub member_count: i64,
}

/// Creating, previewing, revoking and redeeming invites.
#[derive(Clone)]
pub struct InviteService {
    pool: DbPool,
    communities: CommunityService,
}

impl InviteService {
    pub fn new(pool: DbPool, communities: CommunityService) -> Self {
        Self { pool, communities }
    }

    /// Mint a code. Requires `manage_members`, which is the existing
    /// "invite and remove members" permission — inviting does not get one of its
    /// own, because that would mean a migration and a catalogue nobody asked to
    /// grow.
    pub async fn create(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        expires_in_hours: Option<i64>,
        max_uses: Option<i32>,
    ) -> ServiceResult<Invite> {
        let context = self
            .communities
            .member_context(community_id, user_id)
            .await?;
        context.require(Permission::ManageMembers)?;

        if let Some(max) = max_uses
            && max <= 0
        {
            return Err(ServiceError::Domain(genzh_domain::DomainError::invalid(
                "max_uses",
                "must be greater than zero",
            )));
        }

        let expires_at = expires_in_hours.map(|hours| chrono::Utc::now() + chrono::Duration::hours(hours));

        // Retried rather than assumed unique: eight characters from this
        // alphabet is ~3e13 possibilities, so a collision is rare — and "rare"
        // is not "never" once a community has minted a few thousand.
        for _ in 0..5 {
            let code = generate_code();
            let result = sqlx::query_as::<_, Invite>(
                "INSERT INTO community_invites
                   (code, community_id, created_by, expires_at, max_uses)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING code, community_id, created_by, expires_at, max_uses, uses,
                           revoked_at, created_at",
            )
            .bind(&code)
            .bind(community_id)
            .bind(user_id)
            .bind(expires_at)
            .bind(max_uses)
            .fetch_one(&self.pool)
            .await;

            match result {
                Ok(invite) => return Ok(invite),
                Err(error) => {
                    let repo = RepositoryError::from(error);
                    if !matches!(repo, RepositoryError::Conflict { .. }) {
                        return Err(repo.into());
                    }
                }
            }
        }

        Err(ServiceError::Domain(genzh_domain::DomainError::invalid(
            "code",
            "could not mint a unique invite code",
        )))
    }

    /// Every invite for a community. Requires `manage_members`.
    pub async fn list(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<Vec<Invite>> {
        let context = self
            .communities
            .member_context(community_id, user_id)
            .await?;
        context.require(Permission::ManageMembers)?;

        sqlx::query_as::<_, Invite>(
            "SELECT code, community_id, created_by, expires_at, max_uses, uses,
                    revoked_at, created_at
             FROM community_invites
             WHERE community_id = $1
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .bind(community_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| RepositoryError::from(error).into())
    }

    /// What a link leads to, without joining it.
    ///
    /// Answers for anybody signed in, because that is the point of a link: you
    /// are given one by somebody who is already inside, and you have to be able
    /// to see what it is before deciding.
    pub async fn preview(&self, code: &str) -> ServiceResult<InvitePreview> {
        let invite = self.find(code).await?;
        if !invite.is_usable() {
            return Err(ServiceError::not_found("invite"));
        }

        let community: Community = sqlx::query_as(
            "SELECT id, name, description, icon_url, owner_id, created_at, updated_at
             FROM communities WHERE id = $1",
        )
        .bind(invite.community_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("community"))?;

        let (member_count,): (i64,) =
            sqlx::query_as("SELECT count(*) FROM community_members WHERE community_id = $1")
                .bind(invite.community_id)
                .fetch_one(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        Ok(InvitePreview {
            code: invite.code,
            community_id: community.id,
            name: community.name,
            description: community.description,
            icon_url: community.icon_url,
            member_count,
        })
    }

    /// Redeem a code: join the community it points at.
    ///
    /// The use count is incremented in the same statement that checks the
    /// limit, so two people redeeming the last use of a link at the same moment
    /// cannot both succeed.
    pub async fn redeem(&self, code: &str, user_id: UserId) -> ServiceResult<CommunityId> {
        let claimed: Option<(CommunityId,)> = sqlx::query_as(
            "UPDATE community_invites
             SET uses = uses + 1
             WHERE code = $1
               AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > now())
               AND (max_uses IS NULL OR uses < max_uses)
             RETURNING community_id",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        let community_id = claimed
            .map(|(id,)| id)
            .ok_or_else(|| ServiceError::not_found("invite"))?;

        // Already a member: the link did its job, and landing them in the
        // community they are already in is the right outcome.
        match self.communities.add_member(community_id, user_id, user_id).await {
            Ok(_) => Ok(community_id),
            Err(ServiceError::Repository(RepositoryError::Conflict { .. })) => Ok(community_id),
            Err(error) => Err(error),
        }
    }

    /// Stop a link working, keeping the row so it can still be explained.
    pub async fn revoke(&self, code: &str, user_id: UserId) -> ServiceResult<()> {
        let invite = self.find(code).await?;
        let context = self
            .communities
            .member_context(invite.community_id, user_id)
            .await?;
        context.require(Permission::ManageMembers)?;

        sqlx::query("UPDATE community_invites SET revoked_at = now() WHERE code = $1")
            .bind(code)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;
        Ok(())
    }

    async fn find(&self, code: &str) -> ServiceResult<Invite> {
        sqlx::query_as::<_, Invite>(
            "SELECT code, community_id, created_by, expires_at, max_uses, uses,
                    revoked_at, created_at
             FROM community_invites WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("invite"))
    }
}

/// A short, unambiguous code.
fn generate_code() -> String {
    // `Uuid::new_v4` is the CSPRNG already in the dependency tree; folding its
    // bytes into the alphabet avoids adding `rand` for eight characters.
    let bytes = uuid::Uuid::new_v4();
    bytes
        .as_bytes()
        .iter()
        .take(CODE_LEN)
        .map(|byte| ALPHABET[*byte as usize % ALPHABET.len()] as char)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_avoid_characters_that_look_alike() {
        for _ in 0..200 {
            let code = generate_code();
            assert_eq!(code.len(), CODE_LEN);
            for ch in code.chars() {
                assert!(!"01lOI".contains(ch), "`{code}` contains a lookalike");
            }
        }
    }

    fn invite(revoked: bool, expires: Option<i64>, max: Option<i32>, uses: i32) -> Invite {
        Invite {
            code: "abc".into(),
            community_id: CommunityId::new(),
            created_by: None,
            expires_at: expires.map(|h| chrono::Utc::now() + chrono::Duration::hours(h)),
            max_uses: max,
            uses,
            revoked_at: revoked.then(chrono::Utc::now),
            created_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn a_plain_invite_is_usable() {
        assert!(invite(false, None, None, 0).is_usable());
    }

    #[test]
    fn revoking_expiring_and_exhausting_all_stop_a_link() {
        assert!(!invite(true, None, None, 0).is_usable());
        assert!(!invite(false, Some(-1), None, 0).is_usable());
        assert!(!invite(false, None, Some(3), 3).is_usable());
        // One use left.
        assert!(invite(false, None, Some(3), 2).is_usable());
    }
}
