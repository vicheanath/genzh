//! A community's custom emoji: storage, and the rules for changing the set.
//!
//! Its own service for the reason [`crate::roles`] is: emoji answer to a rule
//! nothing else in this crate cares about — the set is a shared namespace, so
//! adding to it is governed by `manage_community`, while *reading* it is
//! governed by nothing stronger than membership, because every member's client
//! needs the whole set to draw a message.
//!
//! Authorization is asked the same way as everywhere else in this crate,
//! through [`CommunityService::member_context`].

use genzh_domain::emoji::{self, CustomEmoji, EMOJI_PER_COMMUNITY_MAX};
use genzh_domain::{CommunityId, DomainError, EmojiId, Permission, UserId, now};
use genzh_infrastructure::{
    DbPool, RepositoryError, RepositoryResult, ServiceError, ServiceResult,
};

use crate::service::CommunityService;

/// Everything that reads or writes emoji rows.
#[derive(Debug, Clone)]
pub struct EmojiRepository {
    pool: DbPool,
}

impl EmojiRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// A community's emoji, alphabetically.
    ///
    /// Sorted in the database rather than the client because every client would
    /// otherwise sort it, and a picker whose order changes between two devices
    /// is a picker people stop trusting their muscle memory in.
    pub async fn list(&self, community_id: CommunityId) -> RepositoryResult<Vec<CustomEmoji>> {
        sqlx::query_as(
            "SELECT id, community_id, name, image_url, is_animated, created_by, created_at
             FROM community_emojis
             WHERE community_id = $1 ORDER BY name ASC",
        )
        .bind(community_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// One emoji by name, within a community.
    ///
    /// The reaction path's question: "is `:blob:` a real glyph here?"
    pub async fn find_by_name(
        &self,
        community_id: CommunityId,
        name: &str,
    ) -> RepositoryResult<Option<CustomEmoji>> {
        sqlx::query_as(
            "SELECT id, community_id, name, image_url, is_animated, created_by, created_at
             FROM community_emojis
             WHERE community_id = $1 AND name = $2",
        )
        .bind(community_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// How many emoji a community already holds.
    pub async fn count(&self, community_id: CommunityId) -> RepositoryResult<i64> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM community_emojis WHERE community_id = $1")
                .bind(community_id)
                .fetch_one(&self.pool)
                .await?;
        Ok(count)
    }

    /// Insert one.
    pub async fn create(&self, emoji: &CustomEmoji) -> RepositoryResult<CustomEmoji> {
        sqlx::query_as(
            "INSERT INTO community_emojis
                (id, community_id, name, image_url, is_animated, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, community_id, name, image_url, is_animated, created_by, created_at",
        )
        .bind(emoji.id)
        .bind(emoji.community_id)
        .bind(&emoji.name)
        .bind(&emoji.image_url)
        .bind(emoji.is_animated)
        .bind(emoji.created_by)
        .bind(emoji.created_at)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Rename one, scoped to its community so a stolen id cannot reach across.
    pub async fn rename(
        &self,
        community_id: CommunityId,
        emoji_id: EmojiId,
        name: &str,
    ) -> RepositoryResult<Option<CustomEmoji>> {
        sqlx::query_as(
            "UPDATE community_emojis SET name = $3
             WHERE community_id = $1 AND id = $2
             RETURNING id, community_id, name, image_url, is_animated, created_by, created_at",
        )
        .bind(community_id)
        .bind(emoji_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Remove one. Reports whether a row was actually removed.
    pub async fn delete(
        &self,
        community_id: CommunityId,
        emoji_id: EmojiId,
    ) -> RepositoryResult<bool> {
        let result =
            sqlx::query("DELETE FROM community_emojis WHERE community_id = $1 AND id = $2")
                .bind(community_id)
                .bind(emoji_id)
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }
}

/// Input for registering an emoji.
#[derive(Debug, Clone)]
pub struct CreateEmoji {
    /// The shortcode, with or without its colons.
    pub name: String,
    /// Where the artwork lives.
    pub image_url: String,
    /// Whether it animates.
    pub is_animated: bool,
}

/// Adding to, renaming within and removing from a community's emoji set.
#[derive(Debug, Clone)]
pub struct EmojiService {
    communities: CommunityService,
    repository: EmojiRepository,
}

impl EmojiService {
    pub(crate) fn new(communities: CommunityService, repository: EmojiRepository) -> Self {
        Self {
            communities,
            repository,
        }
    }

    /// Every emoji a member of this community may use.
    ///
    /// Membership is the only requirement. A client cannot render yesterday's
    /// messages without the whole set, so gating this on a management
    /// permission would mean ordinary members see raw `:blob:` text.
    pub async fn list(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
    ) -> ServiceResult<Vec<CustomEmoji>> {
        self.communities.member_context(community_id, actor_id).await?;
        Ok(self.repository.list(community_id).await?)
    }

    /// Resolve `:name:` against this community, for the reaction path.
    ///
    /// No membership check: the caller has already been authorized against the
    /// *room*, which is the narrower question, and re-asking it here would turn
    /// every reaction into two authorization round trips.
    pub async fn find_by_name(
        &self,
        community_id: CommunityId,
        name: &str,
    ) -> ServiceResult<Option<CustomEmoji>> {
        Ok(self.repository.find_by_name(community_id, name).await?)
    }

    /// Register an emoji.
    pub async fn create(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        input: CreateEmoji,
    ) -> ServiceResult<CustomEmoji> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageCommunity)?;

        let name = emoji::validate_emoji_name(&input.name)?;
        let image_url = emoji::validate_emoji_url(&input.image_url)?;

        // Checked before the insert so the ceiling reports itself as a limit
        // rather than as a unique-constraint failure with a confusing message.
        if self.repository.count(community_id).await? >= EMOJI_PER_COMMUNITY_MAX {
            return Err(ServiceError::Domain(DomainError::invalid(
                "name",
                format!("a community may hold at most {EMOJI_PER_COMMUNITY_MAX} emoji"),
            )));
        }

        let candidate = CustomEmoji {
            id: EmojiId::new(),
            community_id,
            name,
            image_url,
            is_animated: input.is_animated,
            created_by: Some(actor_id),
            created_at: now(),
        };

        let created = self.repository.create(&candidate).await.map_err(conflict)?;

        tracing::info!(
            %community_id,
            emoji_id = %created.id,
            name = %created.name,
            "custom emoji added"
        );
        Ok(created)
    }

    /// Rename an emoji.
    ///
    /// The artwork is deliberately not editable: repointing a shortcode at a
    /// different image would silently rewrite every message that already used
    /// it. Removing and re-adding says out loud what that actually is.
    pub async fn rename(
        &self,
        community_id: CommunityId,
        emoji_id: EmojiId,
        actor_id: UserId,
        name: &str,
    ) -> ServiceResult<CustomEmoji> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageCommunity)?;

        let name = emoji::validate_emoji_name(name)?;

        self.repository
            .rename(community_id, emoji_id, &name)
            .await
            .map_err(conflict)?
            .ok_or_else(|| ServiceError::not_found("emoji"))
    }

    /// Remove an emoji.
    ///
    /// Messages that used it keep their `:name:` text and lose the picture —
    /// there is nothing else to do that is not worse. Rewriting history to
    /// erase the shortcode would edit other people's words.
    pub async fn delete(
        &self,
        community_id: CommunityId,
        emoji_id: EmojiId,
        actor_id: UserId,
    ) -> ServiceResult<()> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageCommunity)?;

        if !self.repository.delete(community_id, emoji_id).await? {
            return Err(ServiceError::not_found("emoji"));
        }

        tracing::info!(%community_id, %emoji_id, "custom emoji removed");
        Ok(())
    }
}

/// Turn the name uniqueness index into the conflict it actually is.
///
/// Without this the caller sees a generic storage failure, and "that name is
/// taken" is the one thing the form needs to be told.
fn conflict(error: RepositoryError) -> ServiceError {
    if matches!(&error, RepositoryError::Conflict { .. }) {
        return ServiceError::Domain(DomainError::Conflict("emoji"));
    }
    ServiceError::Repository(error)
}
