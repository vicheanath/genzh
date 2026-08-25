-- Platform staff, the support queue, and the audit log.
--
-- Three things that only make sense together: staff need somewhere to work
-- (support), and everything they do to somebody else's account or content has
-- to leave a record that they cannot edit (audit).

-- ─────────────────────────── platform staff ──────────────────────────

-- Authority *above* a community, which `roles` cannot express: a community
-- role is scoped to the community that granted it, and nobody inside one can
-- be given power over another.
DO $$ BEGIN
    CREATE TYPE platform_role AS ENUM ('user', 'support', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS platform_role platform_role NOT NULL DEFAULT 'user';

-- Suspension reuses `is_active`, which login, refresh and session validation
-- already check — so a suspended account stops working everywhere without a
-- second flag that those paths would have to learn about. These two columns
-- record *why*, which `is_active` alone cannot say.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Staff are rare; this keeps the console's "list the staff" query off a table
-- scan of every account.
CREATE INDEX IF NOT EXISTS users_platform_role_idx
    ON users (platform_role)
    WHERE platform_role <> 'user';

-- ───────────────────────────── audit log ─────────────────────────────

-- Append-only by convention and by grant: there is no `updated_at` because a
-- row is never updated, and nothing in the application issues UPDATE or DELETE
-- against it. An audit trail that its subjects can rewrite is decoration.
CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID PRIMARY KEY,
    -- Who did it. Null for anything the system did on its own; the row
    -- outlives the actor, because what happened still happened.
    actor_id     UUID REFERENCES users (id) ON DELETE SET NULL,
    -- Kept denormalised: the whole point is to still read correctly after the
    -- actor is deleted and the join has nothing to find.
    actor_handle TEXT,
    -- Matches genzh_domain::audit::AuditAction::key(). Text rather than an
    -- enum so adding an action is a deploy, not a migration.
    action       TEXT        NOT NULL,
    -- What it was done to. Free-form for the same reason as `action`.
    subject_type TEXT,
    subject_id   UUID,
    -- One line a human can read without decoding `metadata`.
    summary      TEXT        NOT NULL,
    -- Whatever else the action needs. Deliberately schemaless: an audit row
    -- describes a past event, and past events do not get new columns.
    metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The console reads newest-first, and filters by actor or by subject.
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx      ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_subject_idx    ON audit_log (subject_type, subject_id);

-- ─────────────────────────── support queue ───────────────────────────

-- A report and a help request are the same object to the person handling it:
-- both arrive, get assigned, get answered and get closed. The kind changes what
-- is shown, not how it is worked.
DO $$ BEGIN
    CREATE TYPE support_ticket_kind AS ENUM ('report', 'help');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE support_ticket_status AS ENUM ('open', 'pending', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- What a report points at. Null for a help request, which is about the account
-- rather than about a thing.
DO $$ BEGIN
    CREATE TYPE support_subject_type AS ENUM ('message', 'user', 'room', 'community');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
    id            UUID                  PRIMARY KEY,
    kind          support_ticket_kind   NOT NULL,
    -- Who raised it. Cascades: a deleted account's open tickets are about a
    -- person who no longer exists.
    reporter_id   UUID                  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_type  support_subject_type,
    -- Not a foreign key on purpose. The reported message is often deleted
    -- before anyone reads the report, and losing the report at that moment
    -- destroys the only remaining evidence.
    subject_id    UUID,
    -- What the reporter said it was: harassment, spam, a billing question.
    category      TEXT                  NOT NULL,
    subject       TEXT                  NOT NULL,
    details       TEXT                  NOT NULL,
    status        support_ticket_status NOT NULL DEFAULT 'open',
    -- Who is working it. Null means nobody has picked it up.
    assignee_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ
);

-- The queue is "oldest open first", and a user reads their own tickets.
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
    ON support_tickets (status, created_at);
CREATE INDEX IF NOT EXISTS support_tickets_reporter_idx
    ON support_tickets (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx
    ON support_tickets (assignee_id, status);

CREATE TABLE IF NOT EXISTS support_messages (
    id         UUID        PRIMARY KEY,
    ticket_id  UUID        NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    -- Null for anything the system wrote, such as a status change.
    author_id  UUID REFERENCES users (id) ON DELETE SET NULL,
    body       TEXT        NOT NULL,
    -- An internal note: visible to staff, never returned to the reporter.
    -- Staff need somewhere to write "same account as #412" without saying it
    -- to the person being investigated.
    staff_only BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
    ON support_messages (ticket_id, created_at);
