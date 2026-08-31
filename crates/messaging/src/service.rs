//! The messaging application service.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use genzh_community::EmojiRepository;
use genzh_domain::emoji;
use genzh_domain::message::{self, Message, ReactionSummary};
use genzh_domain::spam;
use genzh_domain::{DomainError, MessageId, Permission, RoomId, UserId, now};
use genzh_infrastructure::{
    DbPool, FloodGuard, FloodVerdict, ServiceError, ServiceResult,
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
    /// Only ever asked one question: does this community define `:name:`?
    ///
    /// Held here rather than checked by the callers because a reaction arrives
    /// over two transports, and the rule has to hold on both.
    emojis: EmojiRepository,
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
            messages: MessageRepository::new(pool.clone()),
            rooms,
            flood,
            emojis: EmojiRepository::new(pool),
        }
    }

    /// The same service, guarded differently.
    ///
    /// The guard is a port, so choosing another one should not mean rebuilding
    /// the service around a connection pool — which is what the composition
    /// root had to do, and what a second `unguarded()` constructor was working
    /// around. Both of those knew how this service is assembled; this one only
    /// knows that a guard can be replaced.
    pub fn with_flood_guard(&self, flood: Arc<dyn FloodGuard>) -> Self {
        Self {
            flood,
            ..self.clone()
        }
    }

    /// One message, whether or not the caller may see it.
    ///
    /// A raw read: the routes that use it are about to run their own check —
    /// deleting needs the author or a moderator, and the broadcast that follows
    /// needs the room the message was in. Anything that renders a message to a
    /// user goes through [`Self::history`], which is access-checked.
    pub async fn find(&self, message_id: MessageId) -> ServiceResult<Option<Message>> {
        Ok(self.messages.find(message_id).await?)
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
        reply_to_id: Option<MessageId>,
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

        // A reply must point at a message in the same room. Without this a
        // reply could quote something out of a room the reader cannot see, and
        // the quoted excerpt would leak it.
        if let Some(parent_id) = reply_to_id {
            let parent = self
                .messages
                .find(parent_id)
                .await?
                .ok_or_else(|| ServiceError::not_found("message"))?;
            if parent.room_id != room_id {
                return Err(ServiceError::not_found("message"));
            }
        }

        let candidate = Message {
            id: MessageId::new(),
            room_id,
            author_id,
            content,
            is_anonymous,
            reply_to_id,
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

        // A `:shortcode:` has to name a glyph that actually exists here.
        // Without this, any string between colons becomes a permanent reaction
        // key that every client renders as literal text and nobody can explain.
        //
        // Costed deliberately: unicode emoji — very nearly all of them — skip
        // the lookup entirely, because `shortcode_name` answers `None`.
        if let Some(name) = emoji::shortcode_name(&reaction) {
            let defined = match access.room.community_id {
                Some(community_id) => self
                    .emojis
                    .find_by_name(community_id, &name)
                    .await?
                    .is_some(),
                // A direct conversation belongs to no community, so it has no
                // custom glyphs to offer.
                None => false,
            };

            if !defined {
                return Err(ServiceError::Domain(DomainError::invalid(
                    "reaction",
                    format!(":{name}: is not an emoji in this community"),
                )));
            }
        }

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

    // ── pins ─────────────────────────────────────────────────────────────

    /// Pin a message to the top of its room.
    ///
    /// `manage_room`, not authorship: a pin is the room saying "this matters",
    /// which is a moderation decision rather than something the author gets to
    /// make about their own message.
    pub async fn pin(&self, message_id: MessageId, user_id: UserId) -> ServiceResult<()> {
        let message = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(message.room_id, user_id).await?;
        access.require(Permission::ManageRoom)?;

        Ok(self.messages.pin(message.room_id, message_id, user_id).await?)
    }

    /// Remove a pin. Same permission as adding one.
    pub async fn unpin(&self, message_id: MessageId, user_id: UserId) -> ServiceResult<()> {
        let message = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(message.room_id, user_id).await?;
        access.require(Permission::ManageRoom)?;

        Ok(self.messages.unpin(message.room_id, message_id).await?)
    }

    /// A room's pinned messages, newest pin first.
    pub async fn pins(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<Vec<Message>> {
        // Reading pins needs only what reading the room needs.
        self.rooms.visible_access(room_id, user_id).await?;
        Ok(self.messages.pins(room_id).await?)
    }

    // ── search ───────────────────────────────────────────────────────────

    /// Find messages the caller can already see.
    ///
    /// Scoped by the rooms they are in rather than filtered afterwards: a
    /// search that queries everything and hides the rest still tells you how
    /// many results it hid, and how long they took to find.
    pub async fn search(
        &self,
        user_id: UserId,
        query: &str,
        room_id: Option<RoomId>,
        limit: Option<i64>,
    ) -> ServiceResult<Vec<Message>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }

        if let Some(room_id) = room_id {
            self.rooms.visible_access(room_id, user_id).await?;
        }

        Ok(self
            .messages
            .search(user_id, query, room_id, message::clamp_page_size(limit))
            .await?)
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