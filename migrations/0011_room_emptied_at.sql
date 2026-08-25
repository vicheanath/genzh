-- Room emptiness, as a fact with a timestamp.
--
-- `current_participants = 0` says a room is empty. It does not say for how
-- long, and the two are not the same question: a room nobody has joined yet and
-- a room everyone walked out of an hour ago look identical, and only one of
-- them should be ended. Without this column the background sweep could only
-- guess, and guessing wrong ends a call somebody is still in.
--
-- Maintained by the same statements that maintain `current_participants`: set
-- when the count reaches zero, cleared when it stops being zero. NULL therefore
-- means "not empty", which is also the honest answer for every row that existed
-- before this migration ran.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS emptied_at TIMESTAMPTZ;

-- Rooms that are already empty have been so since at least now; dating them
-- from now rather than from `started_at` gives the first sweep after deploy a
-- full grace window instead of ending every one of them at once.
UPDATE rooms
   SET emptied_at = now()
 WHERE emptied_at IS NULL
   AND current_participants = 0
   AND status <> 'ended';

-- The sweep asks for active rooms that emptied before a cutoff, and nothing
-- else reads this column; partial on `emptied_at IS NOT NULL` because the rows
-- that matter are the minority.
CREATE INDEX IF NOT EXISTS idx_rooms_emptied
    ON rooms (emptied_at)
    WHERE emptied_at IS NOT NULL;

-- The sweep's other half deletes participants by staleness across every room,
-- which without this is a sequential scan of the table on every pass.
CREATE INDEX IF NOT EXISTS idx_room_participants_last_seen
    ON room_participants (last_seen_at);
