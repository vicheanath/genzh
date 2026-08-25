-- Replies, pins, read state, search and invite links.
--
-- Five things a chat product is expected to have and this one did not: you
-- could not answer a specific message, keep an important one at the top, tell
-- which rooms had something new, find anything you had already said, or invite
-- somebody without sending them a raw UUID.

-- ───────────────────────────── replies ───────────────────────────────

-- `SET NULL`, not `CASCADE`: deleting a message must not delete the answers to
-- it. The reply survives and renders as a reply to something that is gone,
-- which is what actually happened.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages (id) ON DELETE SET NULL;

-- "Show me the replies to this message" — and the count beside it.
CREATE INDEX IF NOT EXISTS messages_reply_to_idx
    ON messages (reply_to_id)
    WHERE reply_to_id IS NOT NULL;

-- ─────────────────────────── pinned messages ─────────────────────────

CREATE TABLE IF NOT EXISTS pinned_messages (
    room_id    UUID        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    message_id UUID        NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    -- Who pinned it. Null once they leave; the pin is the room's, not theirs.
    pinned_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    pinned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Pinning twice is the same pin.
    PRIMARY KEY (room_id, message_id)
);

CREATE INDEX IF NOT EXISTS pinned_messages_room_idx
    ON pinned_messages (room_id, pinned_at DESC);

-- ─────────────────────── read state and muting ───────────────────────

-- Where each person got to in each room.
--
-- One row per person per room they have actually opened — absent means "never
-- read", which is the correct answer for a room you just joined and reads as
-- "everything is unread" without needing a backfill.
CREATE TABLE IF NOT EXISTS room_read_state (
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    room_id      UUID        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    -- Everything created at or before this is read.
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A muted room still counts its unread messages; it just does not ask for
    -- attention. Muting is about notification, not about marking things read.
    muted        BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, room_id)
);

-- The sidebar asks "for all my rooms, how many unread" on every page load.
CREATE INDEX IF NOT EXISTS room_read_state_user_idx ON room_read_state (user_id);

-- ──────────────────────────── full-text search ───────────────────────

-- A generated column rather than a trigger: the index cannot fall out of step
-- with the text it indexes, because there is no second write to forget.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS messages_content_tsv_idx ON messages USING GIN (content_tsv);

ALTER TABLE communities
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english', name || ' ' || coalesce(description, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS communities_search_tsv_idx ON communities USING GIN (search_tsv);

-- ─────────────────────────── invite links ────────────────────────────

CREATE TABLE IF NOT EXISTS community_invites (
    -- The code *is* the key: it is what appears in the link, so looking one up
    -- is a primary key hit rather than an index on a secondary column.
    code         TEXT        PRIMARY KEY,
    community_id UUID        NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
    -- Null once they leave. The invite belongs to the community.
    created_by   UUID REFERENCES users (id) ON DELETE SET NULL,
    -- Null means "never expires".
    expires_at   TIMESTAMPTZ,
    -- Null means "unlimited".
    max_uses     INTEGER,
    uses         INTEGER     NOT NULL DEFAULT 0,
    -- Revoking keeps the row, so a link that stops working can still be
    -- explained: "revoked", not "never existed".
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT community_invites_max_uses_positive
        CHECK (max_uses IS NULL OR max_uses > 0)
);

CREATE INDEX IF NOT EXISTS community_invites_community_idx
    ON community_invites (community_id, created_at DESC);
