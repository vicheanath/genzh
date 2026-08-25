//! Communities — the top-level social container that owns rooms, roles and
//! members.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, RoleId, UserId};
use crate::permission::PermissionSet;
use crate::room::RoomType;

/// Maximum length of a community name.
pub const COMMUNITY_NAME_MAX_LEN: usize = 64;
/// Maximum length of a role name.
pub const ROLE_NAME_MAX_LEN: usize = 48;
/// Name of the implicit role every member carries.
pub const EVERYONE_ROLE_NAME: &str = "@everyone";

/// A role a community is created with.
///
/// Static shapes, not rows: the repository turns these into `roles` and
/// `role_permissions` when the community is made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoleTemplate {
    pub name: &'static str,
    pub color: Option<&'static str>,
    /// Higher wins when roles disagree, and gates who may edit whom.
    pub position: i32,
    /// The implicit role every member carries. Exactly one is true.
    pub is_default: bool,
    pub permissions: PermissionSet,
}

/// The roles every new community starts with.
///
/// A community used to be created with `@everyone` alone, which left an owner
/// with no way to delegate anything without first designing a role from a list
/// of fourteen permissions — and no way for an ordinary member to share a
/// screen at all, since `@everyone` deliberately withholds it.
///
/// These are a starting point, not a fixed set: they are ordinary rows, so an
/// owner can rename, re-permission or delete any of them except `@everyone`.
pub fn starter_roles() -> Vec<RoleTemplate> {
    vec![
        RoleTemplate {
            name: EVERYONE_ROLE_NAME,
            color: None,
            position: 0,
            is_default: true,
            permissions: PermissionSet::default_member(),
        },
        RoleTemplate {
            name: "Presenter",
            color: Some("#2fe6a7"),
            position: 1,
            is_default: false,
            // The gap `@everyone` leaves: everything a member can do, plus the
            // two publishing rights that are withheld by default.
            permissions: PermissionSet::default_member()
                .union(PermissionSet::SCREEN_SHARE)
                .union(PermissionSet::STREAM),
        },
        RoleTemplate {
            name: "Moderator",
            color: Some("#06b6d4"),
            position: 2,
            is_default: false,
            // Can run the place day to day, but cannot change what the place
            // *is* — no community settings, no roles, no members removed.
            permissions: PermissionSet::default_member()
                .union(PermissionSet::SCREEN_SHARE)
                .union(PermissionSet::MUTE_MEMBERS)
                .union(PermissionSet::MOVE_MEMBERS)
                .union(PermissionSet::MANAGE_ROOM),
        },
        RoleTemplate {
            name: "Admin",
            color: Some("#8b5cf6"),
            position: 3,
            is_default: false,
            // Administrator short-circuits every check, so it needs no others.
            permissions: PermissionSet::ADMINISTRATOR,
        },
    ]
}

/// A room a community is created with.
///
/// Static shapes, not rows — the same relationship [`RoleTemplate`] has to
/// `roles`. `position` is the order the channel list shows them in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoomTemplate {
    pub name: &'static str,
    pub topic: Option<&'static str>,
    pub room_type: RoomType,
    pub position: i32,
}

/// A starting shape for a whole community: its channels and its roles.
///
/// The client used to hold this list, and it only ever prefilled the name and
/// description fields — picking "Gaming" and picking "Study" produced byte-
/// identical servers. The rooms and roles live here instead, so a template is
/// something the server can actually build, and so web and mobile cannot
/// disagree about what "Gaming" means.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommunityTemplate {
    /// Stable identifier the API accepts. Never reuse one for a new meaning.
    pub key: &'static str,
    /// Display name, e.g. "Gaming".
    pub name: &'static str,
    /// Emoji shown on the picker card.
    pub icon: &'static str,
    /// One line describing who it is for.
    pub description: &'static str,
    /// Prefilled community name, which the creator may overwrite.
    pub suggested_name: &'static str,
    /// Prefilled community description.
    pub suggested_description: &'static str,
    /// The channels the community starts with.
    pub rooms: Vec<RoomTemplate>,
    /// Roles this template adds on top of [`starter_roles`].
    ///
    /// Additive rather than a replacement: every community needs `@everyone`,
    /// and the permission checks assume the staff ladder exists. A template
    /// contributes the *trusted member* role its kind of community wants, not
    /// a different permission model.
    pub extra_roles: Vec<RoleTemplate>,
}

/// The key used when a caller names no template.
///
/// Deliberately not the blank one: before templates existed every new community
/// was given a `general` channel, and a caller that says nothing should still
/// get what it always got.
pub const DEFAULT_TEMPLATE_KEY: &str = "general";

/// A community with no channels at all, for someone who would rather build it.
pub const BLANK_TEMPLATE_KEY: &str = "blank";

/// Every template a community can be created from.
pub fn community_templates() -> Vec<CommunityTemplate> {
    vec![
        CommunityTemplate {
            key: BLANK_TEMPLATE_KEY,
            name: "Create my own",
            icon: "✏️",
            description: "An empty server — you make the channels",
            suggested_name: "",
            suggested_description: "",
            rooms: vec![],
            extra_roles: vec![],
        },
        CommunityTemplate {
            key: DEFAULT_TEMPLATE_KEY,
            name: "Just a server",
            icon: "🏠",
            description: "A blank slate with somewhere to talk and somewhere to call",
            suggested_name: "",
            suggested_description: "",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Welcome to your new server!"),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "General Voice",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 1,
                },
            ],
            extra_roles: vec![],
        },
        CommunityTemplate {
            key: "gaming",
            name: "Gaming",
            icon: "🎮",
            description: "For clips, squads, and late night matches",
            suggested_name: "Gamers' Den",
            suggested_description: "A community for gaming, voice chats, and squading up.",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Talk about anything."),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "clips",
                    topic: Some("Post your best plays."),
                    room_type: RoomType::Text,
                    position: 1,
                },
                RoomTemplate {
                    name: "looking-for-group",
                    topic: Some("Find people to queue with."),
                    room_type: RoomType::Text,
                    position: 2,
                },
                RoomTemplate {
                    name: "Squad Voice",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 3,
                },
                RoomTemplate {
                    name: "Game Night",
                    topic: Some("Party games, whenever enough people show up."),
                    room_type: RoomType::Game,
                    position: 4,
                },
            ],
            extra_roles: vec![RoleTemplate {
                name: "Squad Leader",
                color: Some("#f59e0b"),
                position: 0,
                is_default: false,
                permissions: PermissionSet::default_member()
                    .union(PermissionSet::SCREEN_SHARE)
                    .union(PermissionSet::STREAM)
                    .union(PermissionSet::MOVE_MEMBERS),
            }],
        },
        CommunityTemplate {
            key: "friends",
            name: "Friends & hanging out",
            icon: "👥",
            description: "For everyday chill chat, voice calls, and memes",
            suggested_name: "The Hangout Lounge",
            suggested_description: "Just a chill place to talk and hang out with friends.",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Talk about anything."),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "memes",
                    topic: Some("The good stuff."),
                    room_type: RoomType::Text,
                    position: 1,
                },
                RoomTemplate {
                    name: "Hangout Voice",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 2,
                },
                RoomTemplate {
                    name: "Confessions",
                    topic: Some("Anonymous by design."),
                    room_type: RoomType::Confession,
                    position: 3,
                },
            ],
            extra_roles: vec![RoleTemplate {
                name: "Host",
                color: Some("#ec4899"),
                position: 0,
                is_default: false,
                permissions: PermissionSet::default_member()
                    .union(PermissionSet::SCREEN_SHARE)
                    .union(PermissionSet::STREAM)
                    .union(PermissionSet::MOVE_MEMBERS),
            }],
        },
        CommunityTemplate {
            key: "tech",
            name: "Tech & code",
            icon: "💻",
            description: "For builders, hackers, devs, and startups",
            suggested_name: "Dev & Build Club",
            suggested_description: "Building cool software, sharing projects, and solving bugs.",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Talk about anything."),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "showcase",
                    topic: Some("Show what you are building."),
                    room_type: RoomType::Text,
                    position: 1,
                },
                RoomTemplate {
                    name: "help",
                    topic: Some("Stuck on something? Ask here."),
                    room_type: RoomType::Text,
                    position: 2,
                },
                RoomTemplate {
                    name: "Pair Programming",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 3,
                },
                RoomTemplate {
                    name: "Standup",
                    topic: Some("One speaker, everyone else listening."),
                    room_type: RoomType::Stage,
                    position: 4,
                },
            ],
            extra_roles: vec![RoleTemplate {
                name: "Maintainer",
                color: Some("#38bdf8"),
                position: 0,
                is_default: false,
                permissions: PermissionSet::default_member()
                    .union(PermissionSet::SCREEN_SHARE)
                    .union(PermissionSet::STREAM)
                    .union(PermissionSet::MANAGE_ROOM),
            }],
        },
        CommunityTemplate {
            key: "study",
            name: "Study & school",
            icon: "📚",
            description: "For classes, homework help, and study sessions",
            suggested_name: "Study Hall",
            suggested_description: "Focus sessions, group study, and shared notes.",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Talk about anything."),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "homework-help",
                    topic: Some("Ask, and show your working."),
                    room_type: RoomType::Text,
                    position: 1,
                },
                RoomTemplate {
                    name: "resources",
                    topic: Some("Notes, links, and past papers."),
                    room_type: RoomType::Text,
                    position: 2,
                },
                RoomTemplate {
                    name: "Study Room",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 3,
                },
                RoomTemplate {
                    name: "Focus Sessions",
                    topic: Some("Work alongside other people, quietly."),
                    room_type: RoomType::Activity,
                    position: 4,
                },
            ],
            extra_roles: vec![RoleTemplate {
                name: "Tutor",
                color: Some("#22c55e"),
                position: 0,
                is_default: false,
                permissions: PermissionSet::default_member()
                    .union(PermissionSet::SCREEN_SHARE)
                    .union(PermissionSet::STREAM)
                    .union(PermissionSet::MUTE_MEMBERS),
            }],
        },
        CommunityTemplate {
            key: "creative",
            name: "Art & creativity",
            icon: "🎨",
            description: "For artists, music makers, design, and writing",
            suggested_name: "Creative Studio",
            suggested_description: "Sharing artwork, music, WIPs, and creative feedback.",
            rooms: vec![
                RoomTemplate {
                    name: "general",
                    topic: Some("Talk about anything."),
                    room_type: RoomType::Text,
                    position: 0,
                },
                RoomTemplate {
                    name: "showcase",
                    topic: Some("Finished work goes here."),
                    room_type: RoomType::Text,
                    position: 1,
                },
                RoomTemplate {
                    name: "feedback",
                    topic: Some("Works in progress, and honest notes on them."),
                    room_type: RoomType::Text,
                    position: 2,
                },
                RoomTemplate {
                    name: "Studio Voice",
                    topic: None,
                    room_type: RoomType::Voice,
                    position: 3,
                },
                RoomTemplate {
                    name: "Critique Stage",
                    topic: Some("One piece at a time, in front of everyone."),
                    room_type: RoomType::Stage,
                    position: 4,
                },
            ],
            extra_roles: vec![RoleTemplate {
                name: "Curator",
                color: Some("#a78bfa"),
                position: 0,
                is_default: false,
                permissions: PermissionSet::default_member()
                    .union(PermissionSet::SCREEN_SHARE)
                    .union(PermissionSet::STREAM)
                    .union(PermissionSet::MANAGE_ROOM),
            }],
        },
    ]
}

/// Look a template up by key.
pub fn community_template(key: &str) -> Option<CommunityTemplate> {
    community_templates()
        .into_iter()
        .find(|template| template.key == key)
}

/// The full role list a community built from `template` starts with.
///
/// The template's extras are folded in above `Presenter` and below the staff
/// roles, and everything is renumbered from zero. Position is hierarchy — it
/// gates who may edit whom — so appending extras at the top would let a Squad
/// Leader edit a Moderator, which is the opposite of what the name suggests.
pub fn roles_for_template(template: &CommunityTemplate) -> Vec<RoleTemplate> {
    // Staff is everything ranked above `Presenter` in the starter ladder.
    const STAFF_FLOOR: i32 = 2;

    let starters = starter_roles();
    let (staff, base): (Vec<_>, Vec<_>) = starters
        .into_iter()
        .partition(|role| role.position >= STAFF_FLOOR);

    base.into_iter()
        .chain(template.extra_roles.iter().copied())
        .chain(staff)
        .enumerate()
        .map(|(index, mut role)| {
            role.position = index as i32;
            role
        })
        .collect()
}

/// A community ("server", "hangout").
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Community {
    /// Primary key.
    pub id: CommunityId,
    /// Display name.
    pub name: String,
    /// Short description shown in discovery.
    pub description: Option<String>,
    /// Icon image URL.
    pub icon_url: Option<String>,
    /// The account with implicit [`crate::Permission::Administrator`].
    pub owner_id: UserId,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

impl Community {
    /// Owners bypass the role system entirely; this keeps that rule in one place.
    pub fn is_owner(&self, user_id: UserId) -> bool {
        self.owner_id == user_id
    }
}

/// Membership of a user in a community.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CommunityMember {
    /// Community the membership belongs to.
    pub community_id: CommunityId,
    /// Member account.
    pub user_id: UserId,
    /// Per-community override of the profile display name.
    pub nickname: Option<String>,
    /// When the user joined (UTC).
    pub joined_at: Timestamp,
}

/// A named bundle of permissions inside one community.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Role {
    /// Primary key.
    pub id: RoleId,
    /// Owning community.
    pub community_id: CommunityId,
    /// Display name.
    pub name: String,
    /// Badge colour as `#rrggbb`.
    pub color: Option<String>,
    /// Higher wins when roles conflict; also gates who may edit whom.
    pub position: i32,
    /// True for the implicit `@everyone` role, which cannot be deleted.
    pub is_default: bool,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

/// A role together with the permissions it grants, as resolved from the
/// `role_permissions` join table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleWithPermissions {
    /// The role itself.
    #[serde(flatten)]
    pub role: Role,
    /// Folded permission mask.
    pub permissions: PermissionSet,
}

/// A member together with the roles they have been given.
///
/// The member row and their roles are two tables, and every screen that lists
/// members wants both — who is here, and what they can do. Pairing them here
/// keeps that from being two requests and a join in the client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberWithRoles {
    /// The membership itself.
    #[serde(flatten)]
    pub member: CommunityMember,
    /// Roles explicitly assigned, highest position first.
    ///
    /// Excludes `@everyone`: every member holds it by definition, so listing it
    /// would say nothing about anyone.
    pub roles: Vec<Role>,
}

/// Validate a community name.
pub fn validate_community_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > COMMUNITY_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {COMMUNITY_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

/// Validate a role name.
pub fn validate_role_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > ROLE_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {ROLE_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn community(owner: UserId) -> Community {
        Community {
            id: CommunityId::new(),
            name: "Night Owls".into(),
            description: None,
            icon_url: None,
            owner_id: owner,
            created_at: crate::now(),
            updated_at: crate::now(),
        }
    }

    #[test]
    fn ownership_is_identity_based() {
        let owner = UserId::new();
        let c = community(owner);
        assert!(c.is_owner(owner));
        assert!(!c.is_owner(UserId::new()));
    }

    #[test]
    fn names_are_bounded() {
        assert!(validate_community_name("  ").is_err());
        assert_eq!(
            validate_community_name(" Night Owls ").unwrap(),
            "Night Owls"
        );
        assert!(validate_community_name(&"x".repeat(65)).is_err());
        assert!(validate_role_name(&"x".repeat(49)).is_err());
    }
}

#[cfg(test)]
mod starter_role_tests {
    use super::*;
    use crate::Permission;

    #[test]
    fn exactly_one_starter_role_is_the_default() {
        let defaults = starter_roles().iter().filter(|r| r.is_default).count();
        assert_eq!(defaults, 1);
    }

    #[test]
    fn the_default_role_is_everyone_and_sits_at_the_bottom() {
        let roles = starter_roles();
        let everyone = roles.iter().find(|r| r.is_default).expect("a default role");
        assert_eq!(everyone.name, EVERYONE_ROLE_NAME);
        assert_eq!(everyone.position, 0);
    }

    #[test]
    fn positions_are_distinct_so_precedence_is_unambiguous() {
        let mut positions: Vec<i32> = starter_roles().iter().map(|r| r.position).collect();
        positions.sort_unstable();
        let before = positions.len();
        positions.dedup();
        assert_eq!(positions.len(), before);
    }

    #[test]
    fn presenter_closes_the_gap_everyone_leaves() {
        let roles = starter_roles();
        let everyone = roles.iter().find(|r| r.is_default).unwrap();
        let presenter = roles.iter().find(|r| r.name == "Presenter").unwrap();

        assert!(!everyone.permissions.allows(Permission::ScreenShare));
        assert!(presenter.permissions.allows(Permission::ScreenShare));
        assert!(presenter.permissions.allows(Permission::Speak));
    }

    #[test]
    fn moderator_runs_the_place_but_cannot_redefine_it() {
        let roles = starter_roles();
        let moderator = roles.iter().find(|r| r.name == "Moderator").unwrap();

        assert!(moderator.permissions.allows(Permission::ManageRoom));
        assert!(moderator.permissions.allows(Permission::MuteMembers));
        assert!(!moderator.permissions.allows(Permission::ManageCommunity));
        assert!(!moderator.permissions.allows(Permission::ManageRoles));
        assert!(!moderator.permissions.allows(Permission::Administrator));
    }

    #[test]
    fn admin_is_administrator_and_therefore_allows_everything() {
        let roles = starter_roles();
        let admin = roles.iter().find(|r| r.name == "Admin").unwrap();
        for permission in Permission::ALL {
            assert!(admin.permissions.allows(*permission), "{permission:?}");
        }
    }
}

#[cfg(test)]
mod template_tests {
    use super::*;

    #[test]
    fn every_template_key_is_unique() {
        let templates = community_templates();
        let mut keys: Vec<_> = templates.iter().map(|t| t.key).collect();
        keys.sort_unstable();
        let count = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), count, "template keys must be unique");
    }

    #[test]
    fn the_default_and_blank_keys_resolve() {
        assert!(community_template(DEFAULT_TEMPLATE_KEY).is_some());
        assert!(community_template(BLANK_TEMPLATE_KEY).is_some());
        assert!(community_template("no-such-template").is_none());
    }

    #[test]
    fn the_blank_template_builds_nothing_but_the_starter_roles() {
        let blank = community_template(BLANK_TEMPLATE_KEY).unwrap();
        assert!(blank.rooms.is_empty());
        assert_eq!(
            roles_for_template(&blank).len(),
            starter_roles().len(),
            "a template with no extras must not change the role ladder"
        );
    }

    #[test]
    fn the_default_template_still_gives_a_general_channel() {
        // Communities were given one before templates existed; a caller that
        // names no template must keep getting it.
        let default = community_template(DEFAULT_TEMPLATE_KEY).unwrap();
        assert!(default.rooms.iter().any(|room| room.name == "general"));
    }

    #[test]
    fn extra_roles_rank_below_the_staff_ladder() {
        for template in community_templates() {
            let roles = roles_for_template(&template);

            let moderator = roles.iter().find(|r| r.name == "Moderator").unwrap();
            let admin = roles.iter().find(|r| r.name == "Admin").unwrap();

            for extra in &template.extra_roles {
                let placed = roles.iter().find(|r| r.name == extra.name).unwrap();
                // Position is hierarchy: it gates who may edit whom. A Squad
                // Leader outranking a Moderator would be the opposite of what
                // the names promise.
                assert!(
                    placed.position < moderator.position,
                    "{} outranks Moderator in `{}`",
                    extra.name,
                    template.key
                );
                assert!(placed.position < admin.position);
            }
        }
    }

    #[test]
    fn every_template_keeps_exactly_one_default_role() {
        for template in community_templates() {
            let roles = roles_for_template(&template);
            let defaults = roles.iter().filter(|r| r.is_default).count();
            assert_eq!(defaults, 1, "`{}` must have one @everyone", template.key);
            assert_eq!(
                roles.iter().find(|r| r.is_default).unwrap().position,
                0,
                "@everyone sits at the bottom of the ladder"
            );
        }
    }

    #[test]
    fn positions_are_contiguous_and_unique() {
        for template in community_templates() {
            let roles = roles_for_template(&template);
            let mut positions: Vec<_> = roles.iter().map(|r| r.position).collect();
            positions.sort_unstable();
            let expected: Vec<i32> = (0..roles.len() as i32).collect();
            assert_eq!(positions, expected, "`{}` role positions", template.key);

            let mut room_positions: Vec<_> = template.rooms.iter().map(|r| r.position).collect();
            room_positions.sort_unstable();
            let expected_rooms: Vec<i32> = (0..template.rooms.len() as i32).collect();
            assert_eq!(room_positions, expected_rooms, "`{}` room positions", template.key);
        }
    }

    #[test]
    fn template_names_are_valid_for_the_things_they_create() {
        for template in community_templates() {
            for room in &template.rooms {
                assert!(
                    crate::room::validate_room_name(room.name).is_ok(),
                    "`{}` has an unusable room name `{}`",
                    template.key,
                    room.name
                );
            }
            for role in &template.extra_roles {
                assert!(
                    validate_role_name(role.name).is_ok(),
                    "`{}` has an unusable role name `{}`",
                    template.key,
                    role.name
                );
            }
        }
    }
}
