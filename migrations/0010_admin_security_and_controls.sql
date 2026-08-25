-- Migration 0010: Admin Security, Feature Flags, AutoMod, and System Controls

-- 1. Global System Settings / Feature Flags
CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users (id) ON DELETE SET NULL
);

-- Seed default feature flags if not present
INSERT INTO system_settings (key, value, updated_at)
VALUES 
    ('maintenance_mode', 'false'::jsonb, now()),
    ('registrations_enabled', 'true'::jsonb, now()),
    ('voice_calls_enabled', 'true'::jsonb, now()),
    ('screen_sharing_enabled', 'true'::jsonb, now()),
    ('community_creation_enabled', 'true'::jsonb, now()),
    ('file_uploads_enabled', 'true'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 2. IP & CIDR Bans
CREATE TABLE IF NOT EXISTS ip_bans (
    id          UUID PRIMARY KEY,
    ip_or_cidr  TEXT NOT NULL UNIQUE,
    reason      TEXT NOT NULL,
    banned_by   UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ip_bans_lookup ON ip_bans (ip_or_cidr);

-- 3. Blocked Email Domains (e.g. temporary/disposable inboxes)
CREATE TABLE IF NOT EXISTS blocked_email_domains (
    domain      TEXT PRIMARY KEY,
    reason      TEXT,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Auto-Mod Rules & Keyword Filters
CREATE TABLE IF NOT EXISTS automod_rules (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    pattern     TEXT NOT NULL,
    is_regex    BOOLEAN NOT NULL DEFAULT FALSE,
    action      TEXT NOT NULL DEFAULT 'block', -- 'block' or 'flag_report'
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automod_active ON automod_rules (is_active);
