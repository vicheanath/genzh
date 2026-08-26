-- Migration: 0014_gamification_and_rewards.sql
-- Description: Closed-loop points balance, transaction ledger, referral system,
--              an admin-curated cosmetics catalog, inventories, and equipped items.
--
-- The catalog ships empty on purpose. Items are created from the platform
-- console, where staff set the name, artwork and price — a seeded catalog is a
-- price list nobody agreed to, baked into a file that can only be changed by a
-- deploy.

-- ─────────────────────────── 1. balance & ledger ───────────────────────────

CREATE TABLE user_balances (
    user_id          UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance          BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_earned  BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
    last_daily_claim TIMESTAMPTZ,
    daily_streak     INT NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only. A balance without the entries that produced it is a number
-- nobody can defend, so every write to `user_balances` writes here too.
CREATE TABLE balance_transactions (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount      BIGINT NOT NULL,  -- positive credit, negative debit
    reason      TEXT NOT NULL,    -- 'referral_bonus' | 'daily_checkin' | 'store_purchase' | 'admin_grant' | …
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_balance_transactions_user_id ON balance_transactions (user_id, created_at DESC);

-- ───────────────────────────── 2. referrals ────────────────────────────────

CREATE TABLE referrals (
    id             UUID PRIMARY KEY,
    referrer_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    referee_id     UUID REFERENCES users (id) ON DELETE SET NULL,
    referral_code  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('pending', 'completed', 'rewarded')),
    reward_points  BIGINT NOT NULL DEFAULT 100,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ DEFAULT now(),

    -- One person can only ever be referred once, and never by themselves.
    CONSTRAINT referrals_referee_unique UNIQUE (referee_id),
    CONSTRAINT referrals_not_self CHECK (referee_id IS NULL OR referee_id <> referrer_id)
);

CREATE INDEX idx_referrals_referrer_id ON referrals (referrer_id, created_at DESC);

-- The permanent, shareable code. Matching is case-insensitive, so the index is
-- on the folded value and the stored value keeps its display casing.
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT;

UPDATE profiles
   SET referral_code = UPPER(SUBSTRING(REPLACE(user_id::text, '-', ''), 1, 8))
 WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code
    ON profiles (LOWER(referral_code));

-- ─────────────────────── 3. the cosmetics catalog ──────────────────────────

CREATE TABLE store_items (
    id            UUID PRIMARY KEY,
    -- Stable, human-readable key. Staff type it once; nothing renames it after.
    sku           TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    item_type     TEXT NOT NULL CHECK (item_type IN ('frame', 'badge', 'banner', 'name_color')),
    rarity        TEXT NOT NULL DEFAULT 'common'
                  CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    price_points  BIGINT NOT NULL DEFAULT 0 CHECK (price_points >= 0),
    -- SVG / animated WebP / APNG. Null for items drawn purely from style_config.
    asset_url     TEXT,
    -- Gradients, glow colours, animation keys — whatever the client needs to
    -- render the item without shipping an asset for it.
    style_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    is_limited    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Null means unlimited. Enforced at purchase time against the inventory count.
    stock_limit   INT CHECK (stock_limit IS NULL OR stock_limit > 0),
    sort_order    INT NOT NULL DEFAULT 0,
    created_by    UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_items_type ON store_items (item_type, is_active, sort_order);

-- ───────────────────────────── 4. inventory ────────────────────────────────

CREATE TABLE user_inventory (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_id      UUID NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
    -- What it actually cost, at the time. Repricing an item must not rewrite
    -- what somebody already paid.
    paid_points  BIGINT NOT NULL DEFAULT 0,
    -- 'purchase' | 'grant' | 'reward'
    source       TEXT NOT NULL DEFAULT 'purchase',
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT user_inventory_user_item_unique UNIQUE (user_id, item_id)
);

CREATE INDEX idx_user_inventory_user_id ON user_inventory (user_id, acquired_at DESC);
CREATE INDEX idx_user_inventory_item_id ON user_inventory (item_id);

-- ────────────────────── 5. equipped profile cosmetics ──────────────────────

CREATE TABLE user_equipped_items (
    user_id            UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    frame_item_id      UUID REFERENCES store_items (id) ON DELETE SET NULL,
    badge_item_id      UUID REFERENCES store_items (id) ON DELETE SET NULL,
    banner_item_id     UUID REFERENCES store_items (id) ON DELETE SET NULL,
    name_color_item_id UUID REFERENCES store_items (id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
