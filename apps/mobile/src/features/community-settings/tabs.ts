import { Hash, Link2, Lock, Shield, Users } from 'lucide-react-native';
import { can, type CommunityWithPermissions, type Uuid } from '@genzh/shared';

export type CommunityTab = 'overview' | 'roles' | 'members' | 'channels' | 'invites';

export interface CommunityTabInfo {
  id: CommunityTab;
  label: string;
  /** The short form, for the strip where the label has to fit. */
  short: string;
  icon: typeof Users;
}

/**
 * The nav, as data — the same list the web app's dialog renders from, so a new
 * tab is one entry here rather than two hand-written buttons kept looking alike.
 */
export const COMMUNITY_TABS: ReadonlyArray<CommunityTabInfo> = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: Shield },
  { id: 'roles', label: 'Roles & permissions', short: 'Roles', icon: Lock },
  { id: 'members', label: 'Members', short: 'Members', icon: Users },
  { id: 'channels', label: 'Channels', short: 'Channels', icon: Hash },
  { id: 'invites', label: 'Invite links', short: 'Invites', icon: Link2 },
];

/**
 * What the caller may change in this community.
 *
 * Resolved once and handed down, rather than each tab repeating the
 * `isOwner || can(…)` pair. The owner clause is not redundant with
 * `administrator`: a community's owner is not guaranteed to hold a role at all,
 * and being unable to administer the place you created would be absurd.
 */
export interface CommunityAbilities {
  isOwner: boolean;
  community: boolean;
  roles: boolean;
  members: boolean;
  rooms: boolean;
}

export function abilitiesFor(
  community: CommunityWithPermissions,
  userId: Uuid | undefined,
): CommunityAbilities {
  const isOwner = userId !== undefined && userId === community.owner_id;
  const granted = (permission: Parameters<typeof can>[1]) =>
    isOwner || can(community.your_permissions, permission);

  return {
    isOwner,
    community: granted('manage_community'),
    roles: granted('manage_roles'),
    members: granted('manage_members'),
    rooms: granted('manage_room'),
  };
}

/**
 * May this person open server settings at all?
 *
 * Any one of the four powers is enough. The tabs they cannot act in are still
 * worth reading — who has which role, what the channels are — and each panel
 * hides its own controls, so the answer here is only about the door.
 */
export function canOpenSettings(abilities: CommunityAbilities): boolean {
  return (
    abilities.isOwner ||
    abilities.community ||
    abilities.roles ||
    abilities.members ||
    abilities.rooms
  );
}
