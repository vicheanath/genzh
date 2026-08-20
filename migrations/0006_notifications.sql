-- In-app notifications.
--
-- Stored rather than only pushed over the WebSocket: a purely real-time signal
-- is lost for anyone who was offline when it fired, which is exactly the
-- audience a notification is for.

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY,
    -- Who is being told.
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Matches genzh_domain::notification::NotificationKind::key().
    kind       TEXT        NOT NULL,
    -- Who caused it. Null for anything the system raised on its own; the row
    -- survives the actor being deleted, because the notification still
    -- describes something that happened.
    actor_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    -- Where to go when it is clicked. Both cascade: a notification pointing at
    -- a deleted room or message has nowhere to send anyone.
    room_id    UUID REFERENCES rooms (id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages (id) ON DELETE CASCADE,
    -- A short excerpt, so rendering a list costs one query rather than one per
    -- row plus a join back to messages.
    preview    TEXT,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read pattern: this user's notifications, newest first.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON notifications (user_id, created_at DESC);

-- The unread badge is a count over this, and it is asked for on every page
-- load. Partial, because read rows are never counted.
CREATE INDEX IF NOT EXISTS notifications_unread_idx
    ON notifications (user_id) WHERE read_at IS NULL;

-- One mention of a person per message, however many times the message names
-- them. Deduplication belongs here as well as in the parser, so a retry or a
-- concurrent write cannot produce two.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_message_kind_idx
    ON notifications (user_id, message_id, kind) WHERE message_id IS NOT NULL;
