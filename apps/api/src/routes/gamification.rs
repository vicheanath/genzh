//! Points, referrals, and the cosmetics store.
//!
//! Two audiences share this file. Members earn and spend: check in, invite
//! somebody, buy a frame, wear it. Staff curate: create the items and set the
//! prices, because the catalog is data somebody decided on, not a seed file
//! that ships with a deploy.
//!
//! Every handler that moves points does it inside one transaction that writes
//! both the balance and the ledger row explaining it. A balance updated without
//! its entry is a number with no history behind it, and the first dispute is
//! the moment you find out you cannot answer it.

use axum::Json;
use axum::extract::{Path, Query, State};
use genzh_domain::audit::AuditAction;
use genzh_domain::gamification::{
    DAILY_CLAIM_COOLDOWN_HOURS, DAILY_STREAK_GRACE_HOURS, REFERRAL_MILESTONES,
    REFERRAL_REWARD_POINTS, ReferralMilestone, daily_checkin_reward, normalize_referral_code,
};
use genzh_domain::{
    BalanceTransaction, EquippedCosmetics, ItemRarity, ItemType, ReferralRecord,
    ReferralWithProfile, StoreItem, StoreItemId, StoreListing, Timestamp, UserBalance,
    UserInventoryItem, UserId,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgExecutor, Postgres, Transaction};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::extract::ApiJson;
use crate::middleware::{AdminUser, CurrentUser};
use crate::state::AppState;

/// The catalog columns, spelled out once for every query that returns an item.
///
/// A macro rather than a constant because the result has to stay a *literal*:
/// `sqlx::query_as` only accepts one, which is the check that stops a query
/// from being assembled out of runtime strings. The argument is the table
/// alias to qualify each column with — `""` for a single-table query,
/// `"si."` wherever a join would otherwise make `id` and `updated_at`
/// ambiguous.
///
/// A `SELECT *` would decode whatever the next migration adds, in whatever
/// order it lands, and the first mismatch would be a runtime decode failure in
/// production rather than something anybody noticed here.
macro_rules! item_columns {
    ($p:literal) => {
        concat!(
            $p, "id, ", $p, "sku, ", $p, "name, ", $p, "description, ", $p, "item_type, ",
            $p, "rarity, ", $p, "price_points, ", $p, "asset_url, ", $p, "style_config, ",
            $p, "is_active, ", $p, "is_limited, ", $p, "stock_limit, ", $p, "sort_order, ",
            $p, "created_by, ", $p, "created_at, ", $p, "updated_at"
        )
    };
}

/// How many ledger entries the balance screen shows.
const LEDGER_PAGE: i64 = 30;

// ────────────────────────────── wire payloads ──────────────────────────────

/// `GET /api/v1/referrals/overview` response.
#[derive(Debug, Serialize)]
pub struct ReferralOverviewResponse {
    pub referral_code: String,
    /// The link to paste into a chat, already assembled.
    pub share_url: String,
    pub total_referred: i64,
    pub total_earned_points: i64,
    /// Whether this account has itself been referred; a code can only be
    /// claimed once, and the UI hides the field rather than letting somebody
    /// discover that by failing.
    pub has_claimed_code: bool,
    pub referrals: Vec<ReferralWithProfile>,
    pub milestones: Vec<MilestoneProgress>,
}

/// One rung of the invite ladder, with this account's progress against it.
#[derive(Debug, Serialize)]
pub struct MilestoneProgress {
    pub label: &'static str,
    pub invites: i64,
    pub bonus_points: i64,
    pub reached: bool,
}

/// `POST /api/v1/referrals/claim` body.
#[derive(Debug, Deserialize)]
pub struct ClaimReferralRequest {
    pub code: String,
}

/// `POST /api/v1/referrals/claim` response.
#[derive(Debug, Serialize)]
pub struct ClaimReferralResponse {
    pub message: String,
    pub points_awarded: i64,
    pub new_balance: i64,
}

/// `GET /api/v1/economy/balance` response.
#[derive(Debug, Serialize)]
pub struct BalanceOverviewResponse {
    pub balance: i64,
    pub lifetime_earned: i64,
    pub daily_streak: i32,
    pub can_claim_daily: bool,
    /// When the next check-in unlocks; null when it already has.
    pub next_claim_at: Option<Timestamp>,
    /// What the next check-in would pay, streak included, so the button can
    /// say so before it is pressed.
    pub next_claim_points: i64,
    pub recent_transactions: Vec<BalanceTransaction>,
}

/// `POST /api/v1/economy/daily-checkin` response.
#[derive(Debug, Serialize)]
pub struct DailyCheckinResponse {
    pub points_awarded: i64,
    pub new_balance: i64,
    pub daily_streak: i32,
}

/// `GET /api/v1/store/items` query string.
#[derive(Debug, Deserialize)]
pub struct StoreFilter {
    /// Narrow to one slot: `frame`, `badge`, `banner`, `name_color`.
    #[serde(default)]
    pub item_type: Option<String>,
}

/// `POST /api/v1/inventory/equip` body.
///
/// Absent and null mean different things. An absent field leaves that slot as
/// it is; an explicit null clears it. Without that distinction, equipping a
/// badge would silently take off the frame.
#[derive(Debug, Deserialize)]
pub struct EquipCosmeticsRequest {
    #[serde(default, deserialize_with = "double_option")]
    pub frame_item_id: Option<Option<StoreItemId>>,
    #[serde(default, deserialize_with = "double_option")]
    pub badge_item_id: Option<Option<StoreItemId>>,
    #[serde(default, deserialize_with = "double_option")]
    pub banner_item_id: Option<Option<StoreItemId>>,
    #[serde(default, deserialize_with = "double_option")]
    pub name_color_item_id: Option<Option<StoreItemId>>,
}

/// `GET /api/v1/cosmetics` query string: `?user_ids=a,b,c`.
#[derive(Debug, Deserialize)]
pub struct CosmeticsQuery {
    pub user_ids: String,
}

/// Distinguishes "field omitted" from "field set to null".
fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    serde::Deserialize::deserialize(deserializer).map(Some)
}

// ───────────────────────────────── referrals ────────────────────────────────

/// `GET /api/v1/referrals/overview` — this account's code, link and invitees.
pub async fn get_referral_overview(
    caller: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<ReferralOverviewResponse>> {
    let code = ensure_referral_code(&state, caller.user_id).await?;

    let rows: Vec<ReferralJoinRow> = sqlx::query_as(
        "SELECT r.id, r.referrer_id, r.referee_id, r.referral_code, r.status, r.reward_points,
                r.created_at, r.completed_at,
                u.handle AS referee_handle,
                p.display_name AS referee_display_name,
                p.avatar_url AS referee_avatar_url
           FROM referrals r
           LEFT JOIN users u ON u.id = r.referee_id
           LEFT JOIN profiles p ON p.user_id = r.referee_id
          WHERE r.referrer_id = $1
          ORDER BY r.created_at DESC
          LIMIT 100",
    )
    .bind(caller.user_id)
    .fetch_all(&state.pool)
    .await?;

    let total_earned = rows.iter().map(|r| r.reward_points).sum();
    let total_referred = rows.len() as i64;

    let has_claimed_code: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM referrals WHERE referee_id = $1)",
    )
    .bind(caller.user_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(ReferralOverviewResponse {
        share_url: share_url(&state, &code),
        referral_code: code,
        total_referred,
        total_earned_points: total_earned,
        has_claimed_code,
        referrals: rows.into_iter().map(ReferralJoinRow::into_domain).collect(),
        milestones: milestone_progress(total_referred),
    }))
}

/// `POST /api/v1/referrals/claim` — apply somebody's invite code.
///
/// Pays both sides. The referrer is credited for the invite and the new account
/// for accepting it, which is the only arrangement where neither party has a
/// reason to talk the other out of it.
pub async fn claim_referral(
    caller: CurrentUser,
    State(state): State<AppState>,
    ApiJson(payload): ApiJson<ClaimReferralRequest>,
) -> ApiResult<Json<ClaimReferralResponse>> {
    let code = normalize_referral_code(&payload.code);
    if code.is_empty() {
        return Err(ApiError::bad_request("Enter a referral code."));
    }

    let referrer_id: Option<UserId> = sqlx::query_scalar(
        "SELECT user_id FROM profiles WHERE LOWER(referral_code) = LOWER($1)",
    )
    .bind(&code)
    .fetch_optional(&state.pool)
    .await?;

    let Some(referrer_id) = referrer_id else {
        return Err(ApiError::not_found("referral code"));
    };

    if referrer_id == caller.user_id {
        return Err(ApiError::bad_request("You cannot use your own invite code."));
    }

    let mut tx = state.pool.begin().await?;

    // The unique constraint on `referee_id` is what actually enforces this;
    // the check is here so the second attempt reads as a refusal rather than
    // as a constraint violation surfacing as a 500.
    let already: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM referrals WHERE referee_id = $1)")
            .bind(caller.user_id)
            .fetch_one(&mut *tx)
            .await?;
    if already {
        return Err(ApiError::conflict("referral"));
    }

    sqlx::query(
        "INSERT INTO referrals (id, referrer_id, referee_id, referral_code, status, reward_points)
         VALUES ($1, $2, $3, $4, 'completed', $5)",
    )
    .bind(Uuid::new_v4())
    .bind(referrer_id)
    .bind(caller.user_id)
    .bind(&code)
    .bind(REFERRAL_REWARD_POINTS)
    .execute(&mut *tx)
    .await?;

    credit(
        &mut tx,
        caller.user_id,
        REFERRAL_REWARD_POINTS,
        "referral_welcome_bonus",
        serde_json::json!({ "code": code, "referrer_id": referrer_id }),
    )
    .await?;

    credit(
        &mut tx,
        referrer_id,
        REFERRAL_REWARD_POINTS,
        "referral_invite_bonus",
        serde_json::json!({ "code": code, "referee_id": caller.user_id }),
    )
    .await?;

    // Crossing a rung pays its bonus once, inside the same transaction that
    // created the referral — a milestone awarded by a later job is a milestone
    // that can be awarded twice.
    let invites: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM referrals WHERE referrer_id = $1")
            .bind(referrer_id)
            .fetch_one(&mut *tx)
            .await?;

    if let Some(rung) = REFERRAL_MILESTONES
        .iter()
        .find(|m| m.invites == invites && m.bonus_points > 0)
    {
        credit(
            &mut tx,
            referrer_id,
            rung.bonus_points,
            "referral_milestone",
            serde_json::json!({ "milestone": rung.label, "invites": invites }),
        )
        .await?;
    }

    let new_balance = balance_of(&mut *tx, caller.user_id).await?;
    tx.commit().await?;

    Ok(Json(ClaimReferralResponse {
        message: format!("Invite accepted — {REFERRAL_REWARD_POINTS} points added."),
        points_awarded: REFERRAL_REWARD_POINTS,
        new_balance,
    }))
}

// ─────────────────────────────── balance & ledger ───────────────────────────

/// `GET /api/v1/economy/balance` — balance, streak, and recent movements.
pub async fn get_balance(
    caller: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<BalanceOverviewResponse>> {
    let row: Option<UserBalance> = sqlx::query_as(
        "SELECT user_id, balance, lifetime_earned, last_daily_claim, daily_streak, updated_at
           FROM user_balances WHERE user_id = $1",
    )
    .bind(caller.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let (balance, lifetime, streak, last_claim) = match row {
        Some(b) => (b.balance, b.lifetime_earned, b.daily_streak, b.last_daily_claim),
        None => (0, 0, 0, None),
    };

    let next_claim_at =
        last_claim.map(|t| t + chrono::Duration::hours(DAILY_CLAIM_COOLDOWN_HOURS));
    let can_claim = next_claim_at.is_none_or(|t| chrono::Utc::now() >= t);

    let transactions: Vec<BalanceTransaction> = sqlx::query_as(
        "SELECT id, user_id, amount, reason, metadata, created_at
           FROM balance_transactions
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2",
    )
    .bind(caller.user_id)
    .bind(LEDGER_PAGE)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(BalanceOverviewResponse {
        balance,
        lifetime_earned: lifetime,
        daily_streak: streak,
        can_claim_daily: can_claim,
        next_claim_at: if can_claim { None } else { next_claim_at },
        next_claim_points: daily_checkin_reward(next_streak(last_claim, streak as i64)),
        recent_transactions: transactions,
    }))
}

/// `POST /api/v1/economy/daily-checkin` — claim today's points.
pub async fn claim_daily_checkin(
    caller: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<DailyCheckinResponse>> {
    let mut tx = state.pool.begin().await?;

    // `FOR UPDATE` on the balance row is what makes a double-tapped button one
    // claim rather than two: the second request waits here and then reads the
    // timestamp the first one wrote.
    let existing: Option<(Option<Timestamp>, i32)> = sqlx::query_as(
        "SELECT last_daily_claim, daily_streak FROM user_balances WHERE user_id = $1 FOR UPDATE",
    )
    .bind(caller.user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (last_claim, streak) = existing.unwrap_or((None, 0));

    if let Some(last) = last_claim
        && (chrono::Utc::now() - last).num_hours() < DAILY_CLAIM_COOLDOWN_HOURS
    {
        return Err(ApiError::bad_request(
            "Already claimed today — come back tomorrow.",
        ));
    }

    let streak = next_streak(last_claim, streak as i64);
    let reward = daily_checkin_reward(streak);

    sqlx::query(
        "INSERT INTO user_balances
             (user_id, balance, lifetime_earned, last_daily_claim, daily_streak, updated_at)
         VALUES ($1, $2, $2, now(), $3, now())
         ON CONFLICT (user_id) DO UPDATE
            SET balance = user_balances.balance + $2,
                lifetime_earned = user_balances.lifetime_earned + $2,
                last_daily_claim = now(),
                daily_streak = $3,
                updated_at = now()",
    )
    .bind(caller.user_id)
    .bind(reward)
    .bind(streak as i32)
    .execute(&mut *tx)
    .await?;

    write_ledger(
        &mut tx,
        caller.user_id,
        reward,
        "daily_checkin",
        serde_json::json!({ "streak": streak }),
    )
    .await?;

    let new_balance = balance_of(&mut *tx, caller.user_id).await?;
    tx.commit().await?;

    Ok(Json(DailyCheckinResponse {
        points_awarded: reward,
        new_balance,
        daily_streak: streak as i32,
    }))
}

// ──────────────────────────── the store & inventory ─────────────────────────

/// `GET /api/v1/store/items` — the active catalog, annotated for the viewer.
pub async fn list_store_items(
    caller: CurrentUser,
    State(state): State<AppState>,
    Query(filter): Query<StoreFilter>,
) -> ApiResult<Json<Vec<StoreListing>>> {
    // A filter naming a slot that does not exist is a client bug, not an empty
    // catalog: saying so beats returning nothing and letting them guess.
    let slot = match filter.item_type.as_deref() {
        None | Some("") | Some("all") => None,
        Some(raw) => Some(
            ItemType::parse(raw)
                .ok_or_else(|| ApiError::bad_request(format!("Unknown item type '{raw}'.")))?,
        ),
    };

    let rows: Vec<ListingRow> = sqlx::query_as(concat!(
        "SELECT ", item_columns!("si."), ",
                (inv.item_id IS NOT NULL) AS owned,
                COALESCE(held.holders, 0) AS owned_count,
                (eq.user_id IS NOT NULL) AS equipped
           FROM store_items si
           LEFT JOIN user_inventory inv
                  ON inv.item_id = si.id AND inv.user_id = $1
           LEFT JOIN (SELECT item_id, COUNT(*) AS holders FROM user_inventory GROUP BY item_id) held
                  ON held.item_id = si.id
           LEFT JOIN user_equipped_items eq
                  ON eq.user_id = $1
                 AND si.id IN (eq.frame_item_id, eq.badge_item_id, eq.banner_item_id,
                               eq.name_color_item_id)
          WHERE si.is_active = TRUE
            AND ($2::text IS NULL OR si.item_type = $2)
          ORDER BY si.sort_order ASC, si.price_points ASC, si.created_at DESC"
    ))
    .bind(caller.user_id)
    .bind(slot.map(ItemType::key))
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(ListingRow::into_domain).collect()))
}

/// `POST /api/v1/store/items/{id}/purchase` — buy one item with points.
pub async fn purchase_store_item(
    caller: CurrentUser,
    State(state): State<AppState>,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<UserInventoryItem>> {
    let mut tx = state.pool.begin().await?;

    // Locked for the duration: between reading the price and taking the points,
    // nothing may reprice the row or sell the last of a limited run.
    let item: Option<StoreItem> = sqlx::query_as(concat!(
        "SELECT ", item_columns!(""),
        " FROM store_items WHERE id = $1 AND is_active = TRUE FOR UPDATE"
    ))
    .bind(item_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(item) = item else {
        return Err(ApiError::not_found("store item"));
    };

    let owned: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2)",
    )
    .bind(caller.user_id)
    .bind(item_id)
    .fetch_one(&mut *tx)
    .await?;
    if owned {
        return Err(ApiError::conflict("inventory item"));
    }

    if let Some(limit) = item.stock_limit {
        let sold: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_inventory WHERE item_id = $1")
            .bind(item_id)
            .fetch_one(&mut *tx)
            .await?;
        if sold >= i64::from(limit) {
            return Err(ApiError::bad_request("This item is sold out."));
        }
    }

    let balance: i64 = sqlx::query_scalar(
        "SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE",
    )
    .bind(caller.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(0);

    if balance < item.price_points {
        return Err(ApiError::bad_request(format!(
            "Not enough points — {} costs {}, you have {}.",
            item.name, item.price_points, balance
        )));
    }

    if item.price_points > 0 {
        sqlx::query(
            "UPDATE user_balances SET balance = balance - $1, updated_at = now()
              WHERE user_id = $2",
        )
        .bind(item.price_points)
        .bind(caller.user_id)
        .execute(&mut *tx)
        .await?;

        write_ledger(
            &mut tx,
            caller.user_id,
            -item.price_points,
            "store_purchase",
            serde_json::json!({ "item_id": item.id, "sku": item.sku, "name": item.name }),
        )
        .await?;
    }

    let inventory_id = Uuid::new_v4();
    let acquired_at: Timestamp = sqlx::query_scalar(
        "INSERT INTO user_inventory (id, user_id, item_id, paid_points, source)
         VALUES ($1, $2, $3, $4, 'purchase')
         RETURNING acquired_at",
    )
    .bind(inventory_id)
    .bind(caller.user_id)
    .bind(item_id)
    .bind(item.price_points)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(UserInventoryItem {
        id: genzh_domain::InventoryId(inventory_id),
        user_id: caller.user_id,
        paid_points: item.price_points,
        source: "purchase".into(),
        acquired_at,
        equipped: false,
        item,
    }))
}

/// `GET /api/v1/inventory/my-items` — everything this account owns.
pub async fn get_my_inventory(
    caller: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<UserInventoryItem>>> {
    let rows: Vec<InventoryRow> = sqlx::query_as(concat!(
        "SELECT ", item_columns!("si."), ",
                inv.id AS inventory_id,
                inv.user_id AS owner_id,
                inv.paid_points,
                inv.source,
                inv.acquired_at,
                (eq.user_id IS NOT NULL) AS equipped
           FROM user_inventory inv
           JOIN store_items si ON si.id = inv.item_id
           LEFT JOIN user_equipped_items eq
                  ON eq.user_id = inv.user_id
                 AND si.id IN (eq.frame_item_id, eq.badge_item_id, eq.banner_item_id,
                               eq.name_color_item_id)
          WHERE inv.user_id = $1
          ORDER BY inv.acquired_at DESC"
    ))
    .bind(caller.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(InventoryRow::into_domain).collect()))
}

/// `GET /api/v1/inventory/equipped` — what this account is wearing.
pub async fn get_my_equipped(
    caller: CurrentUser,
    State(state): State<AppState>,
) -> ApiResult<Json<EquippedCosmetics>> {
    Ok(Json(load_equipped(&state, caller.user_id).await?))
}

/// `POST /api/v1/inventory/equip` — wear or remove cosmetics.
///
/// Ownership is re-checked here against the inventory. The store UI only offers
/// what somebody owns, but the endpoint is what makes that true.
pub async fn equip_cosmetics(
    caller: CurrentUser,
    State(state): State<AppState>,
    ApiJson(payload): ApiJson<EquipCosmeticsRequest>,
) -> ApiResult<Json<EquippedCosmetics>> {
    // Each slot pairs the type it accepts with the one statement that writes
    // it. Four statements rather than one with the column name interpolated:
    // a slot name is not data, and building it into SQL is how it becomes data.
    let slots = [
        (
            ItemType::Frame,
            "UPDATE user_equipped_items SET frame_item_id = $1, updated_at = now() \
             WHERE user_id = $2",
            payload.frame_item_id,
        ),
        (
            ItemType::Badge,
            "UPDATE user_equipped_items SET badge_item_id = $1, updated_at = now() \
             WHERE user_id = $2",
            payload.badge_item_id,
        ),
        (
            ItemType::Banner,
            "UPDATE user_equipped_items SET banner_item_id = $1, updated_at = now() \
             WHERE user_id = $2",
            payload.banner_item_id,
        ),
        (
            ItemType::NameColor,
            "UPDATE user_equipped_items SET name_color_item_id = $1, updated_at = now() \
             WHERE user_id = $2",
            payload.name_color_item_id,
        ),
    ];

    let mut tx = state.pool.begin().await?;

    sqlx::query(
        "INSERT INTO user_equipped_items (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(caller.user_id)
    .execute(&mut *tx)
    .await?;

    for (slot, statement, change) in slots {
        // Absent leaves the slot alone; `null` clears it. See the payload doc.
        let Some(target) = change else { continue };

        if let Some(item_id) = target {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT si.item_type
                   FROM user_inventory inv
                   JOIN store_items si ON si.id = inv.item_id
                  WHERE inv.user_id = $1 AND inv.item_id = $2",
            )
            .bind(caller.user_id)
            .bind(item_id)
            .fetch_optional(&mut *tx)
            .await?;

            let Some((item_type,)) = row else {
                return Err(ApiError::bad_request("You do not own that item."));
            };
            if item_type != slot.key() {
                return Err(ApiError::bad_request(format!(
                    "A {item_type} cannot be worn in the {} slot.",
                    slot.key()
                )));
            }
        }

        sqlx::query(statement)
            .bind(target)
            .bind(caller.user_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(Json(load_equipped(&state, caller.user_id).await?))
}

/// `GET /api/v1/cosmetics?user_ids=a,b,c` — what a set of people are wearing.
///
/// Batched because the surfaces that need it — a voice grid, a member list, a
/// page of chat — need it for everybody on screen at once, and one request per
/// face is how a room with thirty people in it becomes thirty requests.
pub async fn get_cosmetics_batch(
    _caller: CurrentUser,
    State(state): State<AppState>,
    Query(query): Query<CosmeticsQuery>,
) -> ApiResult<Json<Vec<EquippedCosmetics>>> {
    let ids: Vec<Uuid> = query
        .user_ids
        .split(',')
        .filter_map(|raw| Uuid::parse_str(raw.trim()).ok())
        .take(100)
        .collect();

    if ids.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let rows: Vec<EquippedRow> = sqlx::query_as(
        "SELECT user_id, frame_item_id, badge_item_id, banner_item_id, name_color_item_id,
                updated_at
           FROM user_equipped_items
          WHERE user_id = ANY($1)",
    )
    .bind(&ids)
    .fetch_all(&state.pool)
    .await?;

    let items = resolve_items(&state, rows.iter().flat_map(EquippedRow::item_ids)).await?;

    Ok(Json(
        rows.into_iter().map(|row| row.resolve(&items)).collect(),
    ))
}

// ─────────────────────────── the console: curation ──────────────────────────

/// `POST`/`PATCH` body for a catalog item.
///
/// On create every required field must be present; on update anything omitted
/// is left as it was.
#[derive(Debug, Deserialize)]
pub struct StoreItemInput {
    pub sku: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub item_type: Option<String>,
    pub rarity: Option<String>,
    pub price_points: Option<i64>,
    #[serde(default, deserialize_with = "double_option")]
    pub asset_url: Option<Option<String>>,
    pub style_config: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub is_limited: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub stock_limit: Option<Option<i32>>,
    pub sort_order: Option<i32>,
}

/// `POST /api/v1/admin/economy/grant` response.
#[derive(Debug, Serialize)]
pub struct GrantPointsResponse {
    /// Signed: negative for a correction taking points back.
    pub amount: i64,
    pub new_balance: i64,
}

/// `POST /api/v1/admin/economy/grant` body.
#[derive(Debug, Deserialize)]
pub struct GrantPointsRequest {
    pub user_id: UserId,
    pub amount: i64,
    #[serde(default)]
    pub note: Option<String>,
}

/// `POST /api/v1/admin/store/items/{id}/grant` body.
#[derive(Debug, Deserialize)]
pub struct GrantItemRequest {
    pub user_id: UserId,
}

/// `GET /api/v1/admin/store/items` — the whole catalog, inactive rows included.
pub async fn admin_list_store_items(
    _admin: AdminUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<StoreListing>>> {
    let rows: Vec<ListingRow> = sqlx::query_as(concat!(
        "SELECT ", item_columns!("si."), ",
                FALSE AS owned,
                COALESCE(held.holders, 0) AS owned_count,
                FALSE AS equipped
           FROM store_items si
           LEFT JOIN (SELECT item_id, COUNT(*) AS holders FROM user_inventory GROUP BY item_id) held
                  ON held.item_id = si.id
          ORDER BY si.sort_order ASC, si.created_at DESC"
    ))
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(ListingRow::into_domain).collect()))
}

/// `POST /api/v1/admin/store/items` — add an item to the catalog.
pub async fn admin_create_store_item(
    admin: AdminUser,
    State(state): State<AppState>,
    ApiJson(input): ApiJson<StoreItemInput>,
) -> ApiResult<Json<StoreItem>> {
    let sku = normalize_sku(input.sku.as_deref().unwrap_or_default())?;
    let name = require_text(input.name.as_deref(), "name", 64)?;
    let item_type = parse_item_type(input.item_type.as_deref())?;
    let rarity = parse_rarity(input.rarity.as_deref().unwrap_or("common"))?;
    let price = validate_price(input.price_points.unwrap_or(0))?;
    let stock_limit = validate_stock(input.stock_limit.flatten())?;

    let taken: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM store_items WHERE sku = $1)")
        .bind(&sku)
        .fetch_one(&state.pool)
        .await?;
    if taken {
        return Err(ApiError::conflict("store item sku"));
    }

    let item: StoreItem = sqlx::query_as(concat!(
        "INSERT INTO store_items
             (id, sku, name, description, item_type, rarity, price_points, asset_url,
              style_config, is_active, is_limited, stock_limit, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ", item_columns!("")
    ))
    .bind(Uuid::new_v4())
    .bind(&sku)
    .bind(&name)
    .bind(input.description.unwrap_or_default())
    .bind(item_type.key())
    .bind(rarity.key())
    .bind(price)
    .bind(input.asset_url.flatten().filter(|u| !u.trim().is_empty()))
    .bind(input.style_config.unwrap_or_else(|| serde_json::json!({})))
    .bind(input.is_active.unwrap_or(true))
    .bind(input.is_limited.unwrap_or(false))
    .bind(stock_limit)
    .bind(input.sort_order.unwrap_or(0))
    .bind(admin.user_id)
    .fetch_one(&state.pool)
    .await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(admin.user_id),
                AuditAction::StoreItemCreated,
                format!("Created store item '{}' at {} points", item.name, item.price_points),
            )
            .about("store_item", item.id.as_uuid())
            .with(serde_json::json!({ "sku": item.sku, "price_points": item.price_points })),
        )
        .await;

    Ok(Json(item))
}

/// `PATCH /api/v1/admin/store/items/{id}` — edit an item, price included.
///
/// Repricing changes what the item costs from now on. It does not touch
/// `user_inventory.paid_points`, so what somebody already paid stays what they
/// paid.
pub async fn admin_update_store_item(
    admin: AdminUser,
    State(state): State<AppState>,
    Path(item_id): Path<Uuid>,
    ApiJson(input): ApiJson<StoreItemInput>,
) -> ApiResult<Json<StoreItem>> {
    let existing: Option<StoreItem> = sqlx::query_as(concat!(
        "SELECT ", item_columns!(""), " FROM store_items WHERE id = $1"
    ))
    .bind(item_id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(existing) = existing else {
        return Err(ApiError::not_found("store item"));
    };

    let name = match input.name.as_deref() {
        Some(raw) => require_text(Some(raw), "name", 64)?,
        None => existing.name.clone(),
    };
    let item_type = match input.item_type.as_deref() {
        Some(raw) => parse_item_type(Some(raw))?,
        None => existing.item_type,
    };
    let rarity = match input.rarity.as_deref() {
        Some(raw) => parse_rarity(raw)?,
        None => existing.rarity,
    };
    let price = validate_price(input.price_points.unwrap_or(existing.price_points))?;
    let stock_limit = match input.stock_limit {
        Some(value) => validate_stock(value)?,
        None => existing.stock_limit,
    };

    let updated: StoreItem = sqlx::query_as(concat!(
        "UPDATE store_items
            SET name = $2,
                description = $3,
                item_type = $4,
                rarity = $5,
                price_points = $6,
                asset_url = $7,
                style_config = $8,
                is_active = $9,
                is_limited = $10,
                stock_limit = $11,
                sort_order = $12,
                updated_at = now()
          WHERE id = $1
          RETURNING ", item_columns!("")
    ))
    .bind(item_id)
    .bind(&name)
    .bind(input.description.unwrap_or_else(|| existing.description.clone()))
    .bind(item_type.key())
    .bind(rarity.key())
    .bind(price)
    .bind(match input.asset_url {
        Some(value) => value.filter(|u| !u.trim().is_empty()),
        None => existing.asset_url.clone(),
    })
    .bind(input.style_config.unwrap_or_else(|| existing.style_config.clone()))
    .bind(input.is_active.unwrap_or(existing.is_active))
    .bind(input.is_limited.unwrap_or(existing.is_limited))
    .bind(stock_limit)
    .bind(input.sort_order.unwrap_or(existing.sort_order))
    .fetch_one(&state.pool)
    .await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(admin.user_id),
                AuditAction::StoreItemUpdated,
                if existing.price_points == updated.price_points {
                    format!("Updated store item '{}'", updated.name)
                } else {
                    format!(
                        "Repriced '{}' from {} to {} points",
                        updated.name, existing.price_points, updated.price_points
                    )
                },
            )
            .about("store_item", item_id)
            .with(serde_json::json!({
                "sku": updated.sku,
                "price_before": existing.price_points,
                "price_after": updated.price_points,
                "active": updated.is_active,
            })),
        )
        .await;

    Ok(Json(updated))
}

/// `DELETE /api/v1/admin/store/items/{id}` — remove an item from the catalog.
///
/// Refused once anybody owns it. Deleting would cascade the row out of their
/// inventory and silently unequip it, which is taking back something that was
/// paid for; deactivating is the reversible answer and the response says so.
pub async fn admin_delete_store_item(
    admin: AdminUser,
    State(state): State<AppState>,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let item: Option<StoreItem> = sqlx::query_as(concat!(
        "SELECT ", item_columns!(""), " FROM store_items WHERE id = $1"
    ))
    .bind(item_id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(item) = item else {
        return Err(ApiError::not_found("store item"));
    };

    let owners: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_inventory WHERE item_id = $1")
        .bind(item_id)
        .fetch_one(&state.pool)
        .await?;

    if owners > 0 {
        let who = if owners == 1 { "1 person owns" } else { &format!("{owners} people own") };
        return Err(ApiError::bad_request(format!(
            "{who} '{}'. Deactivate it instead of deleting it.",
            item.name
        )));
    }

    sqlx::query("DELETE FROM store_items WHERE id = $1")
        .bind(item_id)
        .execute(&state.pool)
        .await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(admin.user_id),
                AuditAction::StoreItemRemoved,
                format!("Deleted store item '{}'", item.name),
            )
            .about("store_item", item_id)
            .with(serde_json::json!({ "sku": item.sku })),
        )
        .await;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

/// `POST /api/v1/admin/economy/grant` — credit or debit an account by hand.
pub async fn admin_grant_points(
    admin: AdminUser,
    State(state): State<AppState>,
    ApiJson(input): ApiJson<GrantPointsRequest>,
) -> ApiResult<Json<GrantPointsResponse>> {
    if input.amount == 0 {
        return Err(ApiError::bad_request("Enter an amount other than zero."));
    }
    if input.amount.abs() > 1_000_000 {
        return Err(ApiError::bad_request("That is more than one grant may move."));
    }

    let mut tx = state.pool.begin().await?;

    if input.amount > 0 {
        credit(
            &mut tx,
            input.user_id,
            input.amount,
            "admin_grant",
            serde_json::json!({ "by": admin.user_id, "note": input.note }),
        )
        .await?;
    } else {
        // A debit may not push a balance below zero — the column's own CHECK
        // would reject it, and a 500 is a worse way to learn that than a
        // refusal naming the balance.
        let balance: i64 =
            sqlx::query_scalar("SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE")
                .bind(input.user_id)
                .fetch_optional(&mut *tx)
                .await?
                .unwrap_or(0);

        if balance < input.amount.abs() {
            return Err(ApiError::bad_request(format!(
                "That account only holds {balance} points."
            )));
        }

        sqlx::query(
            "UPDATE user_balances SET balance = balance + $1, updated_at = now()
              WHERE user_id = $2",
        )
        .bind(input.amount)
        .bind(input.user_id)
        .execute(&mut *tx)
        .await?;

        write_ledger(
            &mut tx,
            input.user_id,
            input.amount,
            "admin_adjustment",
            serde_json::json!({ "by": admin.user_id, "note": input.note }),
        )
        .await?;
    }

    let new_balance = balance_of(&mut *tx, input.user_id).await?;
    tx.commit().await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(admin.user_id),
                AuditAction::PointsGranted,
                format!("Adjusted balance by {} points", input.amount),
            )
            .about("user", input.user_id.as_uuid())
            .with(serde_json::json!({ "amount": input.amount, "note": input.note })),
        )
        .await;

    Ok(Json(GrantPointsResponse {
        amount: input.amount,
        new_balance,
    }))
}

/// `POST /api/v1/admin/store/items/{id}/grant` — give an item away.
pub async fn admin_grant_item(
    admin: AdminUser,
    State(state): State<AppState>,
    Path(item_id): Path<Uuid>,
    ApiJson(input): ApiJson<GrantItemRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM store_items WHERE id = $1)")
        .bind(item_id)
        .fetch_one(&state.pool)
        .await?;
    if !exists {
        return Err(ApiError::not_found("store item"));
    }

    let inserted = sqlx::query(
        "INSERT INTO user_inventory (id, user_id, item_id, paid_points, source)
         VALUES ($1, $2, $3, 0, 'grant')
         ON CONFLICT (user_id, item_id) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(input.user_id)
    .bind(item_id)
    .execute(&state.pool)
    .await?
    .rows_affected()
        > 0;

    if inserted {
        state
            .audit
            .record_best_effort(
                genzh_admin::AuditRecord::new(
                    Some(admin.user_id),
                    AuditAction::ItemGranted,
                    "Granted a cosmetic item".to_string(),
                )
                .about("store_item", item_id)
                .with(serde_json::json!({ "to": input.user_id })),
            )
            .await;
    }

    Ok(Json(serde_json::json!({ "granted": inserted })))
}

// ────────────────────────────────── helpers ─────────────────────────────────

/// This account's referral code, generating one the first time it is asked for.
async fn ensure_referral_code(state: &AppState, user_id: UserId) -> ApiResult<String> {
    let existing: Option<Option<String>> =
        sqlx::query_scalar("SELECT referral_code FROM profiles WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?;

    match existing.flatten() {
        Some(code) if !code.trim().is_empty() => Ok(code),
        _ => {
            // Derived from the account id rather than random, so retrying after
            // a failed write lands on the same code instead of minting a
            // second one for the same person.
            let code = user_id
                .as_uuid()
                .simple()
                .to_string()
                .chars()
                .take(8)
                .collect::<String>()
                .to_uppercase();

            sqlx::query("UPDATE profiles SET referral_code = $1 WHERE user_id = $2")
                .bind(&code)
                .bind(user_id)
                .execute(&state.pool)
                .await?;

            Ok(code)
        }
    }
}

/// The invite link, pointed at whatever origin this deployment serves.
fn share_url(state: &AppState, code: &str) -> String {
    let base = state.config.frontend_url.trim_end_matches('/');
    format!("{base}/join?ref={code}")
}

/// The ladder, marked up with what this account has reached.
fn milestone_progress(invites: i64) -> Vec<MilestoneProgress> {
    REFERRAL_MILESTONES
        .iter()
        .map(|m: &ReferralMilestone| MilestoneProgress {
            label: m.label,
            invites: m.invites,
            bonus_points: m.bonus_points,
            reached: invites >= m.invites,
        })
        .collect()
}

/// The streak a check-in right now would be part of.
///
/// Continuing needs the previous claim to be inside the grace window; a longer
/// gap starts again at one. A first-ever claim is also one.
fn next_streak(last_claim: Option<Timestamp>, current: i64) -> i64 {
    match last_claim {
        Some(last) if (chrono::Utc::now() - last).num_hours() < DAILY_STREAK_GRACE_HOURS => {
            current.max(0) + 1
        }
        _ => 1,
    }
}

/// Credit points and write the entry that explains them, as one unit.
async fn credit(
    tx: &mut Transaction<'_, Postgres>,
    user_id: UserId,
    amount: i64,
    reason: &str,
    metadata: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO user_balances (user_id, balance, lifetime_earned, updated_at)
         VALUES ($1, $2, $2, now())
         ON CONFLICT (user_id) DO UPDATE
            SET balance = user_balances.balance + $2,
                lifetime_earned = user_balances.lifetime_earned + $2,
                updated_at = now()",
    )
    .bind(user_id)
    .bind(amount)
    .execute(&mut **tx)
    .await?;

    write_ledger(tx, user_id, amount, reason, metadata).await
}

/// Append one ledger entry.
async fn write_ledger(
    tx: &mut Transaction<'_, Postgres>,
    user_id: UserId,
    amount: i64,
    reason: &str,
    metadata: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO balance_transactions (id, user_id, amount, reason, metadata)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(amount)
    .bind(reason)
    .bind(metadata)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// The current balance, treating "no row yet" as zero.
async fn balance_of<'e, E: PgExecutor<'e>>(executor: E, user_id: UserId) -> ApiResult<i64> {
    let balance: Option<i64> =
        sqlx::query_scalar("SELECT balance FROM user_balances WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(executor)
            .await?;
    Ok(balance.unwrap_or(0))
}

/// One person's equipped set, resolved to whole items.
async fn load_equipped(state: &AppState, user_id: UserId) -> ApiResult<EquippedCosmetics> {
    let row: Option<EquippedRow> = sqlx::query_as(
        "SELECT user_id, frame_item_id, badge_item_id, banner_item_id, name_color_item_id,
                updated_at
           FROM user_equipped_items
          WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        return Ok(EquippedCosmetics::empty(user_id));
    };

    let items = resolve_items(state, row.item_ids()).await?;
    Ok(row.resolve(&items))
}

/// Load the named items in one query, keyed by id.
async fn resolve_items(
    state: &AppState,
    ids: impl Iterator<Item = Uuid>,
) -> ApiResult<std::collections::HashMap<Uuid, StoreItem>> {
    let ids: Vec<Uuid> = ids.collect();
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let items: Vec<StoreItem> = sqlx::query_as(concat!(
        "SELECT ", item_columns!(""), " FROM store_items WHERE id = ANY($1)"
    ))
    .bind(&ids)
    .fetch_all(&state.pool)
    .await?;

    Ok(items.into_iter().map(|i| (i.id.as_uuid(), i)).collect())
}

fn normalize_sku(raw: &str) -> ApiResult<String> {
    let sku = raw.trim().to_lowercase().replace(' ', "-");
    if sku.len() < 3 || sku.len() > 64 {
        return Err(ApiError::bad_request(
            "The SKU must be between 3 and 64 characters.",
        ));
    }
    if !sku
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::bad_request(
            "The SKU may only contain letters, digits, '-' and '_'.",
        ));
    }
    Ok(sku)
}

fn require_text(raw: Option<&str>, field: &str, max: usize) -> ApiResult<String> {
    let value = raw.unwrap_or_default().trim();
    if value.is_empty() {
        return Err(ApiError::bad_request(format!("The {field} is required.")));
    }
    if value.chars().count() > max {
        return Err(ApiError::bad_request(format!(
            "The {field} must be {max} characters or fewer."
        )));
    }
    Ok(value.to_string())
}

fn parse_item_type(raw: Option<&str>) -> ApiResult<ItemType> {
    ItemType::parse(raw.unwrap_or_default().trim()).ok_or_else(|| {
        ApiError::bad_request("Pick a slot: frame, badge, banner or name_color.")
    })
}

fn parse_rarity(raw: &str) -> ApiResult<ItemRarity> {
    ItemRarity::parse(raw.trim())
        .ok_or_else(|| ApiError::bad_request("Pick a rarity: common, rare, epic or legendary."))
}

fn validate_price(price: i64) -> ApiResult<i64> {
    if !(0..=10_000_000).contains(&price) {
        return Err(ApiError::bad_request(
            "The price must be between 0 and 10,000,000 points.",
        ));
    }
    Ok(price)
}

fn validate_stock(limit: Option<i32>) -> ApiResult<Option<i32>> {
    match limit {
        Some(n) if n <= 0 => Err(ApiError::bad_request(
            "A stock limit must be at least 1. Leave it empty for unlimited.",
        )),
        other => Ok(other),
    }
}

// ────────────────────────────────── row types ───────────────────────────────

/// A referral joined to whoever accepted it.
#[derive(sqlx::FromRow)]
struct ReferralJoinRow {
    id: genzh_domain::ReferralId,
    referrer_id: UserId,
    referee_id: Option<UserId>,
    referral_code: String,
    status: String,
    reward_points: i64,
    created_at: Timestamp,
    completed_at: Option<Timestamp>,
    referee_handle: Option<String>,
    referee_display_name: Option<String>,
    referee_avatar_url: Option<String>,
}

impl ReferralJoinRow {
    fn into_domain(self) -> ReferralWithProfile {
        ReferralWithProfile {
            referral: ReferralRecord {
                id: self.id,
                referrer_id: self.referrer_id,
                referee_id: self.referee_id,
                referral_code: self.referral_code,
                status: self.status,
                reward_points: self.reward_points,
                created_at: self.created_at,
                completed_at: self.completed_at,
            },
            referee_handle: self.referee_handle,
            referee_display_name: self.referee_display_name,
            referee_avatar_url: self.referee_avatar_url,
        }
    }
}

/// A catalog row with the viewer's relationship to it attached.
#[derive(sqlx::FromRow)]
struct ListingRow {
    #[sqlx(flatten)]
    item: StoreItem,
    owned: bool,
    owned_count: i64,
    equipped: bool,
}

impl ListingRow {
    fn into_domain(self) -> StoreListing {
        let in_stock = match self.item.stock_limit {
            Some(limit) => self.owned_count < i64::from(limit),
            None => true,
        };
        StoreListing {
            item: self.item,
            owned: self.owned,
            equipped: self.equipped,
            owned_count: self.owned_count,
            in_stock,
        }
    }
}

/// An inventory row joined to its catalog item.
#[derive(sqlx::FromRow)]
struct InventoryRow {
    #[sqlx(flatten)]
    item: StoreItem,
    inventory_id: Uuid,
    owner_id: UserId,
    paid_points: i64,
    source: String,
    acquired_at: Timestamp,
    equipped: bool,
}

impl InventoryRow {
    fn into_domain(self) -> UserInventoryItem {
        UserInventoryItem {
            id: genzh_domain::InventoryId(self.inventory_id),
            user_id: self.owner_id,
            item: self.item,
            paid_points: self.paid_points,
            source: self.source,
            acquired_at: self.acquired_at,
            equipped: self.equipped,
        }
    }
}

/// The four equipped slots as stored: ids, not items.
#[derive(sqlx::FromRow)]
struct EquippedRow {
    user_id: UserId,
    frame_item_id: Option<Uuid>,
    badge_item_id: Option<Uuid>,
    banner_item_id: Option<Uuid>,
    name_color_item_id: Option<Uuid>,
    updated_at: Timestamp,
}

impl EquippedRow {
    fn item_ids(&self) -> impl Iterator<Item = Uuid> + '_ {
        [
            self.frame_item_id,
            self.badge_item_id,
            self.banner_item_id,
            self.name_color_item_id,
        ]
        .into_iter()
        .flatten()
    }

    fn resolve(self, items: &std::collections::HashMap<Uuid, StoreItem>) -> EquippedCosmetics {
        let pick = |id: Option<Uuid>| id.and_then(|id| items.get(&id).cloned());
        EquippedCosmetics {
            user_id: self.user_id,
            frame: pick(self.frame_item_id),
            badge: pick(self.badge_item_id),
            banner: pick(self.banner_item_id),
            name_color: pick(self.name_color_item_id),
            updated_at: Some(self.updated_at),
        }
    }
}
