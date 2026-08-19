-- ─────────────────────────────────────────────────────────────────────────────
-- User Choice: Anonymous vs Public Persona in Rooms & Messages
-- ─────────────────────────────────────────────────────────────────────────────

-- Add per-message anonymity choice
ALTER TABLE messages
    ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

-- Add per-participant active persona setting
ALTER TABLE room_participants
    ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
