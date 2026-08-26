-- Migration 0017: Three Pillars Room Types (Conversation, Social Games, Social Discovery)

-- 1. Extend room_type enum with new Social Games and Social Discovery room types
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'truth_or_dare';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'would_you_rather';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'hot_takes';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'trivia';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'guess_who';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'random_chat';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'anonymous_chat';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'match_interest';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'friend_finder';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'topic_room';

-- 2. Add family column to rooms table for fast group queries
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'conversation';

-- 3. Backfill family column based on existing and new room_type values.
--
--    Compared as text, not as enum literals. sqlx runs a migration inside one
--    transaction, and Postgres refuses to *use* an enum label added by the same
--    transaction — 'truth_or_dare' as a room_type here fails with "unsafe use
--    of new value". Casting the column to text compares strings instead, which
--    never materialises the new label and works in the same breath as step 1.
UPDATE rooms SET family = 'conversation'
 WHERE room_type::text IN ('text', 'voice', 'video', 'stage');

UPDATE rooms SET family = 'social_games'
 WHERE room_type::text IN (
     'poll', 'debate', 'game', 'activity',
     'truth_or_dare', 'would_you_rather', 'hot_takes', 'trivia', 'guess_who'
 );

UPDATE rooms SET family = 'social_discovery'
 WHERE room_type::text IN (
     'confession', 'quick_chat',
     'random_chat', 'anonymous_chat', 'match_interest', 'friend_finder', 'topic_room'
 );

-- 4. Create index for fast pillar filtering
CREATE INDEX IF NOT EXISTS idx_rooms_family ON rooms (family, status, visibility);
