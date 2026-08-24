import type { Permission } from '@genzh/shared';

/**
 * The permission catalogue, in the order it is shown.
 *
 * The wording is the *effect* of granting it rather than the key's name:
 * "Talk in voice channels" is what someone building a role needs to know, and
 * `speak` is not.
 *
 * Kept in step with `Permission` in `crates/domain/src/permission.rs` — the
 * union type makes a removed key a compile error here, and a *new* key simply
 * goes unlisted. Order is presentational only: the API speaks in keys.
 */
export const ALL_PERMISSIONS: ReadonlyArray<{
  id: Permission;
  label: string;
  description: string;
}> = [
  { id: 'view_room', label: 'View rooms', description: 'See channels in this server by default.' },
  { id: 'send_message', label: 'Send messages', description: 'Post in text channels.' },
  { id: 'add_reaction', label: 'Add reactions', description: 'React to other people’s messages.' },
  { id: 'speak', label: 'Speak', description: 'Talk in voice channels.' },
  { id: 'use_video', label: 'Video', description: 'Turn on a camera.' },
  { id: 'screen_share', label: 'Screen share', description: 'Share a screen.' },
  { id: 'stream', label: 'Stream activity', description: 'Broadcast high-bitrate media.' },
  { id: 'mute_members', label: 'Mute members', description: 'Mute other people in voice channels.' },
  {
    id: 'move_members',
    label: 'Move members',
    description: 'Disconnect or move people between channels.',
  },
  { id: 'manage_room', label: 'Manage channels', description: 'Create, edit and delete channels.' },
  {
    id: 'manage_community',
    label: 'Manage server',
    description: 'Edit the name, icon and description.',
  },
  { id: 'manage_roles', label: 'Manage roles', description: 'Create roles and assign them.' },
  { id: 'manage_members', label: 'Manage members', description: 'Invite and remove people.' },
  {
    id: 'administrator',
    label: 'Administrator',
    description: 'Grants everything above, and bypasses every check.',
  },
];

/**
 * A role's powers in one line.
 *
 * `administrator` short-circuits every check server-side, so listing it
 * alongside a count would suggest the count meant something.
 */
export function summarisePermissions(permissions: Permission[]): string {
  if (permissions.includes('administrator')) return 'Administrator — everything';
  if (permissions.length === 0) return 'No permissions';
  return `${permissions.length} permission${permissions.length === 1 ? '' : 's'}`;
}

/** What a new role starts with: enough to take part, nothing to moderate. */
export const DEFAULT_NEW_ROLE_PERMISSIONS: ReadonlyArray<Permission> = [
  'view_room',
  'send_message',
  'add_reaction',
  'speak',
  'use_video',
];
