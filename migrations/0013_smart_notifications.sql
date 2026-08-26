-- Notifications that stand for a run of events rather than a single one.
--
-- Before this, every message that earned a notification wrote its own row: ten
-- messages from one person in one room meant ten identical-looking lines and a
-- badge that read "10" for what is, to the person reading it, one conversation.
--
-- A row now covers everything that happened in one conversation since you last
-- looked at it. The first message opens it; each one after folds in, bumping
-- `count` and `updated_at`. Reading it closes it, so the next message opens a
-- fresh one — the fold is "until you have seen it", not "forever".

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 1;

-- Nullable to begin with so existing rows can be backfilled from their own
-- creation time; a plain DEFAULT now() would date every historical row today.
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE notifications SET updated_at = created_at WHERE updated_at IS NULL;

-- Existing rows already hold what this change forbids: several unread
-- notifications for one conversation. They are folded into the newest of each
-- group here, because the unique index below cannot be created over them.
WITH groups AS (
    SELECT user_id,
           room_id,
           actor_id,
           kind,
           count(*)                                   AS total,
           (array_agg(id ORDER BY created_at DESC))[1] AS keep_id,
           max(created_at)                            AS latest
      FROM notifications
     WHERE read_at IS NULL AND room_id IS NOT NULL
     GROUP BY user_id, room_id, actor_id, kind
    HAVING count(*) > 1
), folded AS (
    UPDATE notifications n
       SET count = g.total,
           updated_at = g.latest
      FROM groups g
     WHERE n.id = g.keep_id
    RETURNING n.id
)
DELETE FROM notifications n
 USING groups g
 WHERE n.read_at IS NULL
   AND n.room_id IS NOT NULL
   AND n.user_id = g.user_id
   AND n.room_id = g.room_id
   AND n.actor_id IS NOT DISTINCT FROM g.actor_id
   AND n.kind = g.kind
   AND n.id <> g.keep_id;

ALTER TABLE notifications
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

-- The list is ordered by when a row last had something folded into it, so a
-- conversation that gets a new message rises back to the top instead of sitting
-- wherever it first appeared. This replaces the created_at ordering; the old
-- index is left in place because pruning still reads created_at.
CREATE INDEX IF NOT EXISTS notifications_user_updated_idx
    ON notifications (user_id, updated_at DESC);

-- At most one open row per (person, room, actor, reason).
--
-- Partial on `read_at IS NULL`, because folding is only right while the row is
-- unread: once it has been seen, the next message is news again. Room-scoped
-- only — a friend request is a single event with nothing to fold into, and two
-- of them are two facts.
--
-- `actor_id` is coalesced to a sentinel because an anonymous author has none,
-- and NULLs are distinct from each other in a unique index: without this, every
-- anonymous message would open its own row, which is the behaviour the index
-- exists to end. `NULLS NOT DISTINCT` says the same thing more directly and is
-- deliberately not used — it needs PostgreSQL 15, and nothing else here does.
--
-- The sentinel is the nil UUID, which cannot collide with a real account: ids
-- are v4 and every v4 has its version nibble set.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_open_group_idx
    ON notifications (
        user_id,
        room_id,
        coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
        kind
    )
    WHERE read_at IS NULL AND room_id IS NOT NULL;
