import { useMemo } from 'react';
import type { CallMember, Uuid } from '@genzh/shared';

import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { useProfiles } from '../../lib/useProfiles';

/**
 * A call member with the bits the tiles need to draw one.
 *
 * The view model already answers who is in the call and what they are
 * transmitting. It does not know what they look like, and it should not: an
 * avatar URL is a rendering concern, and the profile cache that resolves it is
 * this app's, not the shared layer's.
 */
export interface CallTile extends CallMember {
  isSelf: boolean;
  /** Always a string here — the VM's may be null before the SFU names them. */
  name: string;
  avatarUrl: string | null;
}

export interface CallRoster {
  /** You first, then everyone else — the order the tiles are laid out in. */
  tiles: CallTile[];
  /** Whoever the spotlight is on: pinned, else presenting, else speaking. */
  spotlight: CallTile | null;
  hasScreenShare: boolean;
  screenShare: CallTile | null;
}

/**
 * The roster, dressed for display.
 *
 * A thin adapter over `useCallVM` rather than a second source of truth: it adds
 * your own tile, resolves faces, and picks the spotlight. Everything about who
 * is actually connected and what they are sending comes from the view model.
 */
export function useCallRoster(pinnedId: string | null): CallRoster {
  const { user } = useAuth();
  const {
    members,
    screenSharer,
    muted,
    isCameraOn,
    isScreenSharing,
    handRaised,
    cameraStream,
    screenStream,
    isConnected,
  } = useVoice();

  const remoteIds = useMemo(() => members.map((member) => member.id), [members]);
  const lookupProfile = useProfiles(remoteIds);

  const selfId = (user?.id ?? 'self') as Uuid;

  const tiles = useMemo<CallTile[]>(() => {
    const self: CallTile = {
      id: selfId,
      displayName: user?.profile?.display_name ?? null,
      role: 'owner',
      anonymous: false,
      muted,
      // Without a level meter from the SFU, "unmuted and connected" is the
      // honest approximation of your own speaking state.
      speaking: !muted && isConnected,
      cameraOn: isCameraOn,
      screenSharing: isScreenSharing,
      handRaised,
      stream: cameraStream,
      cameraStream,
      screenStream,
      isSelf: true,
      name: user?.profile?.display_name || user?.handle || 'You',
      avatarUrl: user?.profile?.avatar_url ?? null,
    };

    const others = members.map<CallTile>((member) => {
      const profile = lookupProfile(member.id);
      return {
        ...member,
        isSelf: false,
        name: member.displayName || profile?.display_name || 'Member',
        avatarUrl: profile?.avatar_url ?? null,
      };
    });

    return [self, ...others];
  }, [
    selfId,
    user,
    muted,
    isConnected,
    isCameraOn,
    isScreenSharing,
    handRaised,
    cameraStream,
    screenStream,
    members,
    lookupProfile,
  ]);

  const screenShare = useMemo(
    () => (screenSharer ? (tiles.find((tile) => tile.id === screenSharer.id) ?? null) : null),
    [screenSharer, tiles],
  );

  const spotlight = useMemo(() => {
    // A pin is a decision the user made, so nothing else outranks it.
    const pinned = pinnedId ? tiles.find((tile) => tile.id === pinnedId) : undefined;
    if (pinned) return pinned;
    if (screenShare) return screenShare;
    // Someone else talking, before falling back to your own tile — a spotlight
    // that lands on yourself while another person speaks is the wrong one.
    const speaking = tiles.find((tile) => !tile.isSelf && tile.speaking);
    return speaking ?? tiles[0] ?? null;
  }, [pinnedId, screenShare, tiles]);

  return {
    tiles,
    spotlight,
    hasScreenShare: screenShare !== null,
    screenShare,
  };
}
