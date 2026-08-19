//! The messaging application service.

use chrono::{DateTime, Utc};
use genzh_domain::message::{self, Message, ReactionTally};
use genzh_domain::{DomainError, MessageId, Permission, RoomId, UserId, now};
use genzh_infrastructure::{DbPool, ServiceError, ServiceResult};
use genzh_room::RoomService;

use crate::repository::{MessagePage, MessageRepository};

/// Messages and reactions, authorised against room permissions.
#[derive(Debug, Clone)]
pub struct MessagingService {
    messages: MessageRepository,
    rooms: RoomService,
}

impl MessagingService {
    /// Build the service.
    pub fn new(pool: DbPool, rooms: RoomService) -> Self {
        Self {
            messages: MessageRepository::new(pool),
            rooms,
        }
    }

    /// Post a message.
    pub async fn post(
        &self,
        room_id: RoomId,
        author_id: UserId,
        content: &str,
    ) -> ServiceResult<Message> {
        let access = self.rooms.visible_access(room_id, author_id).await?;
        access.require(Permission::SendMessage)?;

        let content = message::validate_message_content(content)?;

        let candidate = Message {
            id: MessageId::new(),
            room_id,
            author_id,
            content,
            edited_at: None,
            created_at: now(),
        };

        Ok(self.messages.create(&candidate).await?)
    }

    /// Read history.
    pub async fn history(
        &self,
        room_id: RoomId,
        user_id: UserId,
        before: Option<DateTime<Utc>>,
        limit: Option<i64>,
    ) -> ServiceResult<MessagePage> {
        self.rooms.visible_access(room_id, user_id).await?;
        Ok(self
            .messages
            .list(room_id, before, message::clamp_page_size(limit))
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
    ) -> ServiceResult<Vec<ReactionTally>> {
        let existing = self
            .messages
            .find(message_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("message"))?;

        let access = self.rooms.visible_access(existing.room_id, user_id).await?;
        access.require(Permission::AddReaction)?;

        let reaction = message::validate_reaction(reaction)?;
        self.messages
            .add_reaction(message_id, user_id, &reaction)
            .await?;
        Ok(self.messages.reaction_tallies(message_id).await?)
    }

    /// Remove a reaction.
    pub async fn unreact(
        &self,
        message_id: MessageId,
        user_id: UserId,
        reaction: &str,
    ) -> ServiceResult<Vec<ReactionTally>> {
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
        Ok(self.messages.reaction_tallies(message_id).await?)
    }
}
