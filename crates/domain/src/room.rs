//! Rooms & Spontaneous Moments.
//!
//! A room is a temporary or persistent social space where users interact
//! either within a community or across the global playground.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, RoomId, UserId};
use crate::permission::Permission;

/// Maximum length of a room name.
pub const ROOM_NAME_MAX_LEN: usize = 64;
/// Hard ceiling on participants in one media room, enforced by the API before
/// a media token is minted.
pub const MEDIA_ROOM_MAX_PARTICIPANTS: i32 = 50;
/// The `category` a two-person direct conversation carries.
///
/// Spelled once here because the string is load-bearing: block enforcement,
/// sidebar grouping and media joins all key off it.
pub const DIRECT_CATEGORY: &str = "dm";

/// Top-level pillar/family a room belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomFamily {
    /// 💬 Core conversation & RTC channels (Text, Voice, Video, Stage).
    Conversation,
    /// 🎮 Synchronized multiplayer games & social micro-experiences.
    SocialGames,
    /// 🧭 Matchmaking, spontaneous roulette, anonymous moments, and topical lounges.
    SocialDiscovery,
}

impl RoomFamily {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Conversation => "conversation",
            Self::SocialGames => "social_games",
            Self::SocialDiscovery => "social_discovery",
        }
    }
}

/// What a room is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "room_type", rename_all = "snake_case")]
pub enum RoomType {
    // 💬 Conversation Pillar
    /// Persistent chat only.
    Text,
    /// Audio-first hangout. Video may still be enabled per participant.
    Voice,
    /// Video-first room.
    Video,
    /// Moderated audience broadcast stage.
    Stage,

    // 🎮 Social Games Pillar
    /// Truth or Dare party game.
    TruthOrDare,
    /// Would You Rather binary dilemma voting.
    WouldYouRather,
    /// Hot Takes controversial opinion rating.
    HotTakes,
    /// Interactive live voting & opinion polling.
    Poll,
    /// Timed trivia quiz game with streaks & leaderboards.
    Trivia,
    /// Structured 2-sided debate with live vote tracking.
    Debate,
    /// 20 questions / secret persona guessing game.
    GuessWho,
    /// General party mini-games suite.
    Game,
    /// Mini-game or interactive activity lounge.
    Activity,

    // 🧭 Social Discovery Pillar
    /// Instant speed roulette / random matchmaking chat.
    RandomChat,
    /// Anonymous confessions and blind chat drops.
    AnonymousChat,
    /// Tag-based matchmaking by shared interests.
    MatchInterest,
    /// Community friend finder and icebreaker connections.
    FriendFinder,
    /// Dynamic thematic drop-in lounges.
    TopicRoom,
    /// Anonymous confessions & truth drops (legacy alias).
    Confession,
    /// Ephemeral speed-dating or fast spontaneous chat (legacy alias).
    QuickChat,
}

impl RoomType {
    /// Which top-level pillar this room type belongs to.
    pub const fn family(self) -> RoomFamily {
        match self {
            Self::Text | Self::Voice | Self::Video | Self::Stage => RoomFamily::Conversation,
            Self::TruthOrDare
            | Self::WouldYouRather
            | Self::HotTakes
            | Self::Poll
            | Self::Trivia
            | Self::Debate
            | Self::GuessWho
            | Self::Game
            | Self::Activity => RoomFamily::SocialGames,
            Self::RandomChat
            | Self::AnonymousChat
            | Self::MatchInterest
            | Self::FriendFinder
            | Self::TopicRoom
            | Self::Confession
            | Self::QuickChat => RoomFamily::SocialDiscovery,
        }
    }

    /// Does joining this room involve the media plane (audio/video/streams)?
    pub const fn is_media(self) -> bool {
        matches!(
            self,
            RoomType::Voice | RoomType::Video | RoomType::Activity | RoomType::Stage
        )
    }

    /// Is this room an interactive social game?
    pub const fn is_game(self) -> bool {
        matches!(self.family(), RoomFamily::SocialGames)
    }

    /// Is this room a social discovery / matchmaking room?
    pub const fn is_discovery(self) -> bool {
        matches!(self.family(), RoomFamily::SocialDiscovery)
    }

    /// Can messages/reactions be posted here?
    pub const fn allows_messages(self) -> bool {
        true
    }

    /// Stable lower-case name, used in errors, URLs, and logs.
    pub const fn as_str(self) -> &'static str {
        match self {
            RoomType::Text => "text",
            RoomType::Voice => "voice",
            RoomType::Video => "video",
            RoomType::Stage => "stage",
            RoomType::TruthOrDare => "truth_or_dare",
            RoomType::WouldYouRather => "would_you_rather",
            RoomType::HotTakes => "hot_takes",
            RoomType::Poll => "poll",
            RoomType::Trivia => "trivia",
            RoomType::Debate => "debate",
            RoomType::GuessWho => "guess_who",
            RoomType::Game => "game",
            RoomType::Activity => "activity",
            RoomType::RandomChat => "random_chat",
            RoomType::AnonymousChat => "anonymous_chat",
            RoomType::MatchInterest => "match_interest",
            RoomType::FriendFinder => "friend_finder",
            RoomType::TopicRoom => "topic_room",
            RoomType::Confession => "confession",
            RoomType::QuickChat => "quick_chat",
        }
    }

    /// The permission a participant needs to publish a camera track here.
    pub const fn camera_permission(self) -> Permission {
        match self {
            RoomType::Stage => Permission::ScreenShare,
            _ => Permission::UseVideo,
        }
    }
}

/// Lifecycle status of a room.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "room_status", rename_all = "snake_case")]
pub enum RoomStatus {
    Created,
    Waiting,
    #[default]
    Active,
    Ending,
    Ended,
}

/// Discoverability and access visibility of a room.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "room_visibility", rename_all = "snake_case")]
pub enum RoomVisibility {
    #[default]
    Public,
    Unlisted,
    FriendsOnly,
    Private,
}

/// Participant role within a room.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "room_participant_role", rename_all = "snake_case")]
pub enum RoomParticipantRole {
    Owner,
    Moderator,
    #[default]
    Participant,
    Observer,
}

/// A room on the platform (either standalone global or community-bound).
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Room {
    /// Primary key.
    pub id: RoomId,
    /// Owning community, if bounded to a persistent server.
    pub community_id: Option<CommunityId>,
    /// Owner user ID (optional for system/community rooms).
    pub owner_id: Option<UserId>,
    /// Display name.
    pub name: String,
    /// Topic line shown under the name.
    pub topic: Option<String>,
    /// Topic category (e.g., "gaming", "debate", "tech", "music", "confession", "random").
    pub category: String,
    /// What the room is for.
    pub room_type: RoomType,
    /// Visibility level for discovery.
    pub visibility: RoomVisibility,
    /// Lifecycle status.
    pub status: RoomStatus,
    /// Whether user real profiles are replaced with room-scoped anonymous identities.
    pub is_anonymous: bool,
    /// Sort order within a community (if applicable).
    pub position: i32,
    /// Cap on simultaneous participants; `None` means the global default.
    pub max_participants: Option<i32>,
    /// Current count of active participants.
    pub current_participants: i32,
    /// When the room session started.
    pub started_at: Option<Timestamp>,
    /// When the room session automatically expires (if temporary).
    pub expires_at: Option<Timestamp>,
    /// When the room was ended or archived.
    pub ended_at: Option<Timestamp>,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

impl Room {
    /// Effective participant cap for this room.
    pub fn participant_limit(&self) -> i32 {
        self.max_participants.unwrap_or(MEDIA_ROOM_MAX_PARTICIPANTS)
    }

    /// Is this a two-person direct conversation?
    ///
    /// Stored as a category rather than a room type: a direct conversation is a
    /// text room in every respect except who can see it, and giving it a type of
    /// its own would mean teaching every `match` on [`RoomType`] about a variant
    /// that behaves like `Text`.
    pub fn is_direct(&self) -> bool {
        self.category == DIRECT_CATEGORY
    }

    /// Reject media joins on non-media rooms early, with a typed error.
    ///
    /// A direct conversation passes despite being a text room. Calling someone
    /// is not a different room from messaging them — the DM *is* the place the
    /// two of them share, so the call happens in it rather than in a voice room
    /// conjured alongside it that the sidebar would then have to hide.
    pub fn require_media(&self) -> DomainResult<()> {
        if self.room_type.is_media() || self.is_direct() {
            Ok(())
        } else {
            Err(DomainError::UnsupportedRoomType(self.room_type.as_str()))
        }
    }

    /// Has this room expired?
    pub fn is_expired(&self, now: Timestamp) -> bool {
        if let Some(exp) = self.expires_at {
            now >= exp
        } else {
            false
        }
    }
}

/// An anonymous identity scoped strictly to a single room.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RoomAnonymousIdentity {
    pub room_id: RoomId,
    pub user_id: UserId,
    pub alias_name: String,
    pub avatar_seed: String,
    pub accent_color: String,
    pub created_at: Timestamp,
}

/// Participant membership in a live room.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RoomParticipant {
    pub room_id: RoomId,
    pub user_id: UserId,
    pub role: RoomParticipantRole,
    pub is_muted: bool,
    #[serde(default)]
    pub is_anonymous: bool,
    pub joined_at: Timestamp,
    pub last_seen_at: Timestamp,
}

/// Validate a room name.
pub fn validate_room_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > ROOM_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {ROOM_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

/// Adjectives for generating fun anonymous identities.
const ANONYMOUS_ADJECTIVES: &[&str] = &[
    "Blue", "Pixel", "Neon", "Velvet", "Cosmic", "Chill", "Spicy", "Golden", "Cyber", "Quiet",
    "Silver", "Mystic", "Electric", "Midnight", "Solar", "Shadow", "Sunny", "Happy", "Lucky",
    "Breezy", "Ruby", "Frosty", "Hyper", "Clever", "Brave", "Dreamy", "Astral", "Atomic",
];

/// Nouns for generating fun anonymous identities.
const ANONYMOUS_NOUNS: &[&str] = &[
    "Fox", "Cat", "Panda", "Ghost", "Owl", "Otter", "Falcon", "Wolf", "Koala", "Rabbit", "Dolphin",
    "Tiger", "Hawk", "Bear", "Raven", "Dragon", "Phoenix", "Badger", "Hedgehog", "Penguin",
    "Sloth", "Gecko", "Lynx", "Raccoon", "Sparrow", "Hamster", "Firefly", "Chameleon",
];

/// Fun accent colors for anonymous identities.
const ANONYMOUS_COLORS: &[&str] = &[
    "#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#3ba55d", "#a855f7", "#06b6d4",
    "#f97316", "#14b8a6", "#ec4899", "#8b5cf6",
];

/// Generate a deterministic, playful anonymous identity for a user in a room.
pub fn generate_anonymous_identity(
    room_id: RoomId,
    user_id: UserId,
) -> (String, String, String) {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in room_id.as_uuid().as_bytes() {
        hash = hash.wrapping_mul(0x100000001b3) ^ (*byte as u64);
    }
    for byte in user_id.as_uuid().as_bytes() {
        hash = hash.wrapping_mul(0x100000001b3) ^ (*byte as u64);
    }

    let adj_idx = (hash as usize) % ANONYMOUS_ADJECTIVES.len();
    let noun_idx = ((hash >> 8) as usize) % ANONYMOUS_NOUNS.len();
    let color_idx = ((hash >> 16) as usize) % ANONYMOUS_COLORS.len();
    let discriminator = ((hash >> 24) % 9000 + 1000) as u16;

    let alias = format!(
        "{}{}#{:04}",
        ANONYMOUS_ADJECTIVES[adj_idx], ANONYMOUS_NOUNS[noun_idx], discriminator
    );
    let avatar_seed = format!("{}-{}", ANONYMOUS_NOUNS[noun_idx], discriminator);
    let color = ANONYMOUS_COLORS[color_idx].to_string();

    (alias, avatar_seed, color)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn room(room_type: RoomType) -> Room {
        Room {
            id: RoomId::new(),
            community_id: Some(CommunityId::new()),
            owner_id: None,
            name: "lounge".into(),
            topic: None,
            category: "random".into(),
            room_type,
            visibility: RoomVisibility::Public,
            status: RoomStatus::Active,
            is_anonymous: false,
            position: 0,
            max_participants: None,
            current_participants: 0,
            started_at: Some(crate::now()),
            expires_at: None,
            ended_at: None,
            created_at: crate::now(),
            updated_at: crate::now(),
        }
    }

    #[test]
    fn only_media_room_types_accept_media_sessions() {
        assert!(room(RoomType::Voice).require_media().is_ok());
        assert!(room(RoomType::Video).require_media().is_ok());
        assert!(room(RoomType::Activity).require_media().is_ok());
        assert!(room(RoomType::Stage).require_media().is_ok());

        let err = room(RoomType::Text).require_media().unwrap_err();
        assert_eq!(err, DomainError::UnsupportedRoomType("text"));
    }

    #[test]
    fn a_direct_conversation_accepts_a_call_despite_being_a_text_room() {
        let mut dm = room(RoomType::Text);
        dm.category = DIRECT_CATEGORY.to_string();

        assert!(dm.is_direct());
        assert!(dm.require_media().is_ok());
    }

    #[test]
    fn deterministic_anonymous_identity() {
        let r_id = RoomId::new();
        let u_id = UserId::new();

        let (alias1, seed1, col1) = generate_anonymous_identity(r_id, u_id);
        let (alias2, seed2, col2) = generate_anonymous_identity(r_id, u_id);

        assert_eq!(alias1, alias2);
        assert_eq!(seed1, seed2);
        assert_eq!(col1, col2);
        assert!(alias1.contains('#'));
    }
}
