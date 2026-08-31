-- Migration 0018: Custom emoji, scoped to a community.
--
-- A community's own `:name:` glyphs. Referenced from two places that already
-- exist and are deliberately left alone: `messages.content`, where a shortcode
-- is plain text until a client draws it, and `message_reactions.reaction`,
-- which has always been documented as "emoji or `:custom_name:`".
--
-- Nothing here stores an image. The platform has no object storage, so the row
-- carries a URL an administrator supplies; the API only accepts `https://`.

CREATE TABLE community_emojis (
    id           UUID PRIMARY KEY,
    community_id UUID        NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
    -- The shortcode without its colons, lower-case: `:party_blob:` is stored
    -- as `party_blob`. Uniqueness is per community, so two communities may
    -- each have their own `blob` and a member of both sees the right one.
    name         TEXT        NOT NULL,
    image_url    TEXT        NOT NULL,
    -- Rendered rather than enforced: a still frame is fine to autoplay, an
    -- animation may need the viewer's "reduce motion" honoured.
    is_animated  BOOLEAN     NOT NULL DEFAULT FALSE,
    -- SET NULL rather than CASCADE: an emoji outlives the account that added
    -- it. Deleting a member must not silently strip the room of its glyphs.
    created_by   UUID        REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (community_id, name)
);

-- The only query that matters: "everything this community has", asked once per
-- room the client opens.
CREATE INDEX community_emojis_community_id_idx ON community_emojis (community_id, name);
