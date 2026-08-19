-- Migration 0003: Social Playground Rooms & Anonymous Moments

-- 1. Extend room_type enum
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'stage';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'poll';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'debate';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'game';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'confession';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'quick_chat';

-- 2. New Enums
DO $$ BEGIN
    CREATE TYPE room_status AS ENUM ('created', 'waiting', 'active', 'ending', 'ended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE room_visibility AS ENUM ('public', 'unlisted', 'friends_only', 'private');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE room_participant_role AS ENUM ('owner', 'moderator', 'participant', 'observer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Modify rooms table for standalone/community playground rooms
ALTER TABLE rooms ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'random';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility room_visibility NOT NULL DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status room_status NOT NULL DEFAULT 'active';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_participants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 4. Room Anonymous Identities
CREATE TABLE IF NOT EXISTS room_anonymous_identities (
    room_id      UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    alias_name   TEXT NOT NULL,
    avatar_seed  TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id),
    CONSTRAINT room_anon_unique_alias UNIQUE (room_id, alias_name)
);

CREATE INDEX IF NOT EXISTS idx_room_anon_lookup ON room_anonymous_identities (room_id, user_id);

-- 5. Room Participants & Presence
CREATE TABLE IF NOT EXISTS room_participants (
    room_id      UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         room_participant_role NOT NULL DEFAULT 'participant',
    is_muted     BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants (user_id);

-- 6. Room Discovery Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_discovery ON rooms (status, visibility, current_participants DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_category ON rooms (category, status, visibility);

-- 7. Room Moderation Reports & Bans
CREATE TABLE IF NOT EXISTS room_reports (
    id               UUID PRIMARY KEY,
    room_id          UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    reporter_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_bans (
    room_id    UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason     TEXT,
    banned_by  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    banned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
