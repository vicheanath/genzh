//! Points, referrals, and the cosmetics people spend points on.
//!
//! The currency is closed-loop: it is earned inside the product and spent
//! inside the product, and never leaves. That is what keeps this a
//! gamification model rather than a payments one — there is no cash-out, so
//! there is no float, no refund path and no ledger anybody is owed against.
//!
//! What there *is* is an append-only ledger. Every balance here is the sum of
//! the [`BalanceTransaction`] rows behind it, and each of those names its
//! reason, so "why do I have 350 points" is a question with an answer.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::ids::{InventoryId, ReferralId, StoreItemId, TransactionId, UserId};

/// What one referral pays out, to each side.
pub const REFERRAL_REWARD_POINTS: i64 = 100;

/// What a daily check-in pays before the streak bonus.
pub const DAILY_CHECKIN_BASE_POINTS: i64 = 50;

/// Extra points per consecutive day, capped by [`DAILY_STREAK_MAX_BONUS`].
pub const DAILY_STREAK_STEP_POINTS: i64 = 10;

/// The ceiling on the streak bonus.
///
/// Uncapped, a streak becomes the only thing worth doing in the product — the
/// reward for showing up on day 90 should not dwarf the reward for taking part.
pub const DAILY_STREAK_MAX_BONUS: i64 = 100;

/// Hours that must pass before the next check-in is allowed.
///
/// Twenty rather than twenty-four so somebody who checks in after work each day
/// is not slowly pushed later by their own punctuality.
pub const DAILY_CLAIM_COOLDOWN_HOURS: i64 = 20;

/// Hours after which a missed day breaks the streak.
pub const DAILY_STREAK_GRACE_HOURS: i64 = 48;

/// What a check-in pays given the streak it continues.
pub fn daily_checkin_reward(streak: i64) -> i64 {
    let bonus = (streak.max(1) - 1) * DAILY_STREAK_STEP_POINTS;
    DAILY_CHECKIN_BASE_POINTS + bonus.min(DAILY_STREAK_MAX_BONUS)
}

// ───────────────────────────── balance & ledger ─────────────────────────────

/// One account's standing in the closed-loop currency.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserBalance {
    pub user_id: UserId,
    /// Spendable now.
    pub balance: i64,
    /// Everything ever credited, ignoring what was spent. The number a profile
    /// shows off; `balance` is the one a purchase checks.
    pub lifetime_earned: i64,
    pub last_daily_claim: Option<Timestamp>,
    pub daily_streak: i32,
    pub updated_at: Timestamp,
}

/// One movement of points, credit or debit.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BalanceTransaction {
    pub id: TransactionId,
    pub user_id: UserId,
    /// Positive credits, negative debits.
    pub amount: i64,
    /// Stable key: `referral_invite_bonus`, `daily_checkin`, `store_purchase`,
    /// `admin_grant`. Written once and never rewritten.
    pub reason: String,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
}

// ──────────────────────────────── the catalog ───────────────────────────────

/// Where on a profile an item is worn.
///
/// One slot each: equipping a second frame replaces the first rather than
/// stacking, which is what makes [`EquippedCosmetics`] a row and not a list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    /// Animated ring drawn around the avatar.
    Frame,
    /// Small icon beside the display name.
    Badge,
    /// Wide image across the top of the profile card.
    Banner,
    /// Gradient or colour applied to the display name.
    NameColor,
}

impl ItemType {
    /// The value stored in the `item_type` column.
    pub const fn key(self) -> &'static str {
        match self {
            ItemType::Frame => "frame",
            ItemType::Badge => "badge",
            ItemType::Banner => "banner",
            ItemType::NameColor => "name_color",
        }
    }

    /// Parse a stored key back, rejecting anything the schema would not hold.
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "frame" => Some(ItemType::Frame),
            "badge" => Some(ItemType::Badge),
            "banner" => Some(ItemType::Banner),
            "name_color" => Some(ItemType::NameColor),
            _ => None,
        }
    }

    /// Every slot, for the console's pickers.
    pub const ALL: &'static [ItemType] = &[
        ItemType::Frame,
        ItemType::Badge,
        ItemType::Banner,
        ItemType::NameColor,
    ];
}

/// How rare an item is meant to feel. Presentation only — it gates nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ItemRarity {
    Common,
    Rare,
    Epic,
    Legendary,
}

impl ItemRarity {
    /// The value stored in the `rarity` column.
    pub const fn key(self) -> &'static str {
        match self {
            ItemRarity::Common => "common",
            ItemRarity::Rare => "rare",
            ItemRarity::Epic => "epic",
            ItemRarity::Legendary => "legendary",
        }
    }

    /// Parse a stored key back.
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "common" => Some(ItemRarity::Common),
            "rare" => Some(ItemRarity::Rare),
            "epic" => Some(ItemRarity::Epic),
            "legendary" => Some(ItemRarity::Legendary),
            _ => None,
        }
    }

    /// Every tier, for the console's pickers.
    pub const ALL: &'static [ItemRarity] = &[
        ItemRarity::Common,
        ItemRarity::Rare,
        ItemRarity::Epic,
        ItemRarity::Legendary,
    ];
}

/// One item in the catalog, as staff created it.
///
/// Nothing here is seeded. The catalog starts empty and is filled from the
/// platform console, which is also the only place a price is set.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoreItem {
    pub id: StoreItemId,
    pub sku: String,
    pub name: String,
    pub description: String,
    pub item_type: ItemType,
    pub rarity: ItemRarity,
    /// Zero is legitimate: a free item is how a reward is handed out through
    /// the same machinery as a purchase.
    pub price_points: i64,
    pub asset_url: Option<String>,
    /// Whatever the client needs to draw it without an asset — gradients, glow
    /// colours, animation keys.
    pub style_config: serde_json::Value,
    pub is_active: bool,
    pub is_limited: bool,
    /// `None` is unlimited.
    pub stock_limit: Option<i32>,
    pub sort_order: i32,
    pub created_by: Option<UserId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A catalog row plus what the viewer's own relationship to it is.
///
/// The store needs both on every tile — "500 points" and "you own this" are the
/// same question asked twice, and answering them in one query is what keeps the
/// grid from flickering between the two.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreListing {
    #[serde(flatten)]
    pub item: StoreItem,
    pub owned: bool,
    pub equipped: bool,
    /// How many people hold it. Shown against `stock_limit` when limited.
    pub owned_count: i64,
    /// False when the run is exhausted.
    pub in_stock: bool,
}

/// An item somebody owns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInventoryItem {
    pub id: InventoryId,
    pub user_id: UserId,
    pub item: StoreItem,
    /// What it cost at the time, which repricing must not rewrite.
    pub paid_points: i64,
    pub source: String,
    pub acquired_at: Timestamp,
    /// Whether it is currently worn in its slot.
    pub equipped: bool,
}

/// What somebody is currently wearing, resolved to whole items.
///
/// Resolved rather than four ids because every surface that renders a person —
/// a voice tile, a chat line, a member row — needs the gradient and the asset,
/// not a foreign key it would have to chase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquippedCosmetics {
    pub user_id: UserId,
    pub frame: Option<StoreItem>,
    pub badge: Option<StoreItem>,
    pub banner: Option<StoreItem>,
    pub name_color: Option<StoreItem>,
    pub updated_at: Option<Timestamp>,
}

impl EquippedCosmetics {
    /// An empty set, for somebody who has never equipped anything.
    pub fn empty(user_id: UserId) -> Self {
        Self {
            user_id,
            frame: None,
            badge: None,
            banner: None,
            name_color: None,
            updated_at: None,
        }
    }

    /// Whether anything is worn at all — the cheap check a renderer makes
    /// before reaching for a decorated avatar.
    pub fn is_empty(&self) -> bool {
        self.frame.is_none()
            && self.badge.is_none()
            && self.banner.is_none()
            && self.name_color.is_none()
    }
}

// ───────────────────────────────── referrals ────────────────────────────────

/// One person having invited another.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReferralRecord {
    pub id: ReferralId,
    pub referrer_id: UserId,
    /// Null once the invited account is deleted — the row outlives them.
    pub referee_id: Option<UserId>,
    pub referral_code: String,
    pub status: String,
    pub reward_points: i64,
    pub created_at: Timestamp,
    pub completed_at: Option<Timestamp>,
}

/// A referral with the invited person's name attached, for the referral hub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferralWithProfile {
    #[serde(flatten)]
    pub referral: ReferralRecord,
    pub referee_handle: Option<String>,
    pub referee_display_name: Option<String>,
    pub referee_avatar_url: Option<String>,
}

/// A rung on the invite ladder.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ReferralMilestone {
    /// Invites needed.
    pub invites: i64,
    /// Bonus paid on reaching it.
    pub bonus_points: i64,
    /// What to call it in the UI.
    pub label: &'static str,
}

/// The invite ladder, in order.
pub const REFERRAL_MILESTONES: &[ReferralMilestone] = &[
    ReferralMilestone { invites: 1, bonus_points: 0, label: "First Friend" },
    ReferralMilestone { invites: 3, bonus_points: 100, label: "Getting Loud" },
    ReferralMilestone { invites: 5, bonus_points: 250, label: "Recruiter" },
    ReferralMilestone { invites: 10, bonus_points: 750, label: "Community Builder" },
    ReferralMilestone { invites: 25, bonus_points: 2500, label: "Legend" },
];

/// Normalise a referral code for comparison.
///
/// Codes are shown uppercase and typed however people type them, so matching
/// folds case and strips the whitespace a paste brings with it.
pub fn normalize_referral_code(raw: &str) -> String {
    raw.trim().replace(['-', ' '], "").to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streak_bonus_is_capped() {
        assert_eq!(daily_checkin_reward(1), DAILY_CHECKIN_BASE_POINTS);
        assert_eq!(daily_checkin_reward(2), DAILY_CHECKIN_BASE_POINTS + 10);
        // Day 12 would pay a 110 bonus uncapped; the cap holds it at 100.
        assert_eq!(
            daily_checkin_reward(12),
            DAILY_CHECKIN_BASE_POINTS + DAILY_STREAK_MAX_BONUS
        );
        assert_eq!(
            daily_checkin_reward(400),
            DAILY_CHECKIN_BASE_POINTS + DAILY_STREAK_MAX_BONUS
        );
    }

    #[test]
    fn a_zero_streak_still_pays_the_base() {
        // A first-ever check-in arrives with streak 0 from the database default.
        assert_eq!(daily_checkin_reward(0), DAILY_CHECKIN_BASE_POINTS);
    }

    #[test]
    fn codes_match_however_they_are_typed() {
        assert_eq!(normalize_referral_code("  vic-hea "), "VICHEA");
        assert_eq!(normalize_referral_code("VICHEA"), "VICHEA");
    }

    #[test]
    fn item_keys_round_trip() {
        for t in ItemType::ALL {
            assert_eq!(ItemType::parse(t.key()), Some(*t));
        }
        for r in ItemRarity::ALL {
            assert_eq!(ItemRarity::parse(r.key()), Some(*r));
        }
    }
}
