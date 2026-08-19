-- The permission catalogue.
--
-- Keys must match `social_domain::Permission::key()` exactly. The integration
-- test `permission_catalogue_matches_the_domain` fails the build if a
-- permission is added in Rust and not here, or vice versa.

INSERT INTO permissions (key, description) VALUES
    ('view_room',        'See a room and its participants'),
    ('send_message',     'Post messages in a room'),
    ('add_reaction',     'React to messages'),
    ('speak',            'Publish audio in a voice or video room'),
    ('use_video',        'Publish a camera track'),
    ('screen_share',     'Publish a screen-share track'),
    ('stream',           'Publish a high-bitrate stream or activity capture'),
    ('mute_members',     'Server-mute other members'),
    ('move_members',     'Move or disconnect other members'),
    ('manage_room',      'Create, edit and delete rooms'),
    ('manage_community', 'Edit community settings'),
    ('manage_roles',     'Create, edit and assign roles'),
    ('manage_members',   'Invite and remove members'),
    ('administrator',    'Bypass every permission check')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
