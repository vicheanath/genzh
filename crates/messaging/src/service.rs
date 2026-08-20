//! The messaging application service.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use genzh_domain::message::{self, Message, ReactionSummary};
use genzh_domain::spam;
use genzh_domain::{DomainError, MessageId, Permission, RoomId, UserId, now};
use genzh_infrastructure::{
    DbPool, FloodGuard, FloodVerdict, PermissiveFloodGuard, ServiceError, ServiceResult,
};
use genzh_room::RoomService;

use crate::repository::{MessagePage, MessageRepository};

/// Messages and reactions, authorised against room permissions.
///
/// Anti-spam lives here rather than in an HTTP middleware for one reason: a
/// message can also arrive down a WebSocket, which the middleware never sees.
/// Both paths call [`MessagingService::post`], so this is the narrowest place
/// that covers both — and the only one that cannot be bypassed by choosing a
/// different transport.
#[derive(Clone)]
pub struct MessagingService {
    messages: MessageRepository,
    rooms: RoomService,
    flood: Arc<dyn FloodGuard>,
}

// Written out rather than derived: the guard is a trait object, and requiring
// `Debug` of every future implementation — a Redis client, say — to keep a
// derive working would be the tail wagging the dog.
impl std::fmt::Debug for MessagingService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MessagingService").finish_non_exhaustive()
    }
}

impl MessagingService {
    /// Build the service with a flood guard.
    pub fn new(pool: DbPool, rooms: RoomService, flood: Arc<dyn FloodGuard>) -> Self {
        Self {
            messages: MessageRepository::new(pool),
            rooms,
            flood,
        }
    }

    /// Build the service with no flood guard at all.
    ///
    /// For seeding and for tests, which post a room's worth of history in a
    /// tight loop and would otherwise be refused for it. Named for what it
    /// leaves out, so nothing reaches for it as the convenient constructor.
    pub fn unguarded(pool: DbPool, rooms: RoomService) -> Self {
        Self::new(pool, rooms, PermissiveFloodGuard::new())
    }

    /// Underlying repository.
    pub fn repository(&self) -> &MessageRepository {
        &self.messages
    }

    /// Post a message.
    ///
    /// Order matters: permission, then shape, then content caps, and only then
    /// the flood guard. Cheap refusals come first, and a message that was going
    /// to be rejected anyway never spends the poster's budget.
    pub async fn post(
        &self,
        room_id: RoomId,
        author_id: UserId,
        content: &str,
        is_anonymous: bool,
    ) -> ServiceResult<Message> {
        let access = self.rooms.visible_access(room_id, author_id).await?;
        access.require(Permission::SendMessage)?;

        let content = message::validate_message_content(content)?;
        spam::check_content(&content)?;

        // Scoped per room: someone talking in three rooms at once is doing
        // something people do, and a shared budget would punish them for it.
        self.guard(
            &format!("message:{author_id}:{room_id}"),
            spam::digest(&content),
            FLOODING,
            REPEATING,
        )
        .await?;

        let candidate = Message {
            id: MessageId::new(),
            room_id,
            author_id,
            content,
            is_anonymous,
            edited_at: None,
            created_at: now(),
        };

        Ok(self.messages.create(&candidate).await?)
    }

    /// Read history.
    ///
    /// `before` / `before_id` are the cursor from the previous page. Both
    /// together, because paging on the timestamp alone can skip messages that
    /// share one — see [`crate::MessagePage::next_before_id`].
    pub async fn history(
        &self,
        room_id: RoomId,
        user_id: UserId,
        before: Option<DateTime<Utc>>,
        before_id: Option<MessageId>,
        limit: Option<i64>,
    ) -> ServiceResult<MessagePage> {
        self.rooms.visible_access(room_id, user_id).await?;
        Ok(self
            .messages
            .list(room_id, before, before_id, message::clamp_page_size(limit))
            .await?)
    }

    /// Reaction summaries for a page of messages the caller can already see.
    ///
    /// Kept separate from [`Self::history`] rather than folded into it so the
    /// page query stays exactly what it was — one keyset scan — and a caller
    /// that does not render reactions pays nothing for them.
    pub async fn reactions_for(
        &self,
        room_id: RoomId,
        user_id: UserId,
        message_ids: &[MessageId],
    ) -> ServiceResult<HashMap<MessageId, Vec<ReactionSummary>>> {
        self.rooms.visible_access(room_id, user_id).await?;
        Ok(self
            .messages
            .reaction_summaries_for(message_ids, user_id)
            .await?)
    }

    /// Edit a message.
    ///
    /// Authors only. `manage_room` lets a moderator delete, not rewrite —
    /// putting words in someone's mouth is a different power entirely.
    pub async fn edit(
        &self,
        message_id: MessageId,
        user_id: UserId,
        content: &str,
    ) -> ServiceResult<Message> {
        let existing = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(existing.room_id, user_id).await?;
        access.require(Permission::SendMessage)?;

        if existing.author_id != user_id {
            return Err(ServiceError::denied("message_author_only"));
        }

        let content = message::validate_message_content(content)?;
        // The same caps as posting. Without this, a message could go up inside
        // the limits and then be rewritten to name the whole community.
        spam::check_content(&content)?;

        Ok(self.messages.update_content(message_id, &content).await?)
    }

    /// Delete a message.
    ///
    /// The author, or anyone with `manage_room` in that room.
    pub async fn delete(&self, message_id: MessageId, user_id: UserId) -> ServiceResult<()> {
        let existing = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(existing.room_id, user_id).await?;
        if existing.author_id != user_id {
            access.require(Permission::ManageRoom)?;
        }

        if !self.messages.delete(message_id).await? {
            return Err(ServiceError::not_found("message"));
        }
        Ok(())
    }

    /// React to a message.
    pub async fn react(
        &self,
        message_id: MessageId,
        user_id: UserId,
        reaction: &str,
    ) -> ServiceResult<Vec<ReactionSummary>> {
        let existing = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(existing.room_id, user_id).await?;
        access.require(Permission::AddReaction)?;

        let reaction = message::validate_reaction(reaction)?;

        // Reactions are cheaper than messages but not free: each one is a row
        // and a broadcast to everyone in the room, and toggling one on and off
        // is the easiest flood in the app to write.
        self.guard(
            &format!("reaction:{user_id}"),
            reaction_digest(message_id, &reaction),
            REACTING_TOO_FAST,
            REACTION_TOGGLING,
        )
        .await?;

        self.messages
            .add_reaction(message_id, user_id, &reaction)
            .await?;
        Ok(self
            .messages
            .reaction_summaries(message_id, user_id)
            .await?)
    }

    /// Remove a reaction.
    pub async fn unreact(
        &self,
        message_id: MessageId,
        user_id: UserId,
        reaction: &str,
    ) -> ServiceResult<Vec<ReactionSummary>> {
        let existing = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        // Visibility is enough: removing your own reaction is never a
        // privileged act, even if `add_reaction` was revoked since.
        self.rooms.visible_access(existing.room_id, user_id).await?;

        let reaction = message::validate_reaction(reaction)?;
        if !self
            .messages
            .remove_reaction(message_id, user_id, &reaction)
            .await?
        {
            return Err(ServiceError::Domain(DomainError::NotFound("reaction")));
        }
        Ok(self
            .messages
            .reaction_summaries(message_id, user_id)
            .await?)
    }

    /// Ask the flood guard, and turn a refusal into a throttled domain error.
    ///
    /// A guard that cannot answer fails **open**, matching the per-address
    /// limiter: refusing every message because a counter is unreachable would
    /// turn a degraded dependency into an outage, and this defends against
    /// abuse rather than protecting correctness.
    async fn guard(
        &self,
        key: &str,
        digest: u64,
        too_fast: &'static str,
        repeated: &'static str,
    ) -> ServiceResult<()> {
        let verdict = match self.flood.check(key, digest).await {
            Ok(verdict) => verdict,
            Err(error) => {
                tracing::error!(%error, key, "flood guard unavailable; allowing");
                return Ok(());
            }
        };

        match verdict {
            FloodVerdict::Allowed => Ok(()),
            FloodVerdict::TooFast { retry_after } => {
                tracing::warn!(key, "refused: too fast");
                Err(DomainError::throttled(too_fast, retry_after).into())
            }
            FloodVerdict::Repeated { retry_after } => {
                tracing::warn!(key, "refused: repeated content");
                Err(DomainError::throttled(repeated, retry_after).into())
            }
        }
    }
}

/// What a throttled poster is told. Phrased as advice, not as an accusation —
/// most of the people who see these are enthusiastic rather than malicious.
const FLOODING: &str = "You are sending messages too quickly — wait a moment";
const REPEATING: &str = "You have already sent that message — try saying something else";
const REACTING_TOO_FAST: &str = "You are reacting too quickly — wait a moment";
const REACTION_TOGGLING: &str = "You have toggled that reaction too many times";

/// Fingerprint of "this reaction on this message", so the repeat rule catches a
/// toggle storm on one message without touching someone reacting to twenty.
fn reaction_digest(message_id: MessageId, reaction: &str) -> u64 {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    message_id.hash(&mut hasher);
    reaction.hash(&mut hasher);
    hasher.finish()
}
