-- Migration 0009: Admin Console Enhancements
-- Adds community quarantine, system broadcasts, and moderation safety controls.

-- 1. Communities quarantine status
ALTER TABLE communities
    ADD COLUMN IF NOT EXISTS is_quarantined   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quarantined_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_communities_quarantined
    ON communities (is_quarantined)
    WHERE is_quarantined;

-- 2. System Broadcasts & Announcements
CREATE TABLE IF NOT EXISTS system_broadcasts (
    id          UUID PRIMARY KEY,
    title       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    level       TEXT        NOT NULL DEFAULT 'info', -- 'info', 'warning', 'danger'
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_active
    ON system_broadcasts (is_active, created_at DESC);
