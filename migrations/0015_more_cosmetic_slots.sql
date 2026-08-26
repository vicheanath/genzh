-- Migration: 0015_more_cosmetic_slots.sql
-- Description: Four more things to wear — a typeface for your name, a custom
--              title beside it, an effect over your avatar, and a tint on your
--              chat messages.
--
-- Each is its own slot rather than another flag on an existing item, because
-- they compose: a name colour and a name font are two purchases that look good
-- together, and a frame and an avatar effect are worn at the same time.

-- The catalog's own list of what an item can be.
ALTER TABLE store_items DROP CONSTRAINT IF EXISTS store_items_item_type_check;

ALTER TABLE store_items
    ADD CONSTRAINT store_items_item_type_check
    CHECK (item_type IN (
        'frame',
        'badge',
        'banner',
        'name_color',
        -- The typeface a display name is set in.
        'name_font',
        -- A short tag shown beside the name: "Certified Yapper", "Night Owl".
        'title',
        -- Particles or an aura over the avatar, worn alongside a frame.
        'avatar_effect',
        -- A tint on the messages you send.
        'chat_bubble'
    ));

-- One column per slot, matching the four that are already here. A join table
-- would allow two frames at once, which is exactly what a slot is for
-- preventing.
ALTER TABLE user_equipped_items
    ADD COLUMN IF NOT EXISTS name_font_item_id     UUID REFERENCES store_items (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS title_item_id         UUID REFERENCES store_items (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS avatar_effect_item_id UUID REFERENCES store_items (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS chat_bubble_item_id   UUID REFERENCES store_items (id) ON DELETE SET NULL;
