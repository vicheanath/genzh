import { useMemo } from 'react';

import { useAuth } from '../../context/AuthContext';
import { useVoice, type VoiceParticipant } from '../../context/VoiceContext';
import { useProfiles } from '../../lib/useProfiles';

/**
 * A participant with their identity already resolved.
 *
 * The context hands out ids; a name and a face take a profile lookup, and
 * whether the row is *you* changes where both come from. Four places on the
 * call screen needed all three — the grid, the spotlight, the filmstrip and the
 * roster — and each had its own copy of the same three-way `||` chain. One of
 * them said "Member" where another said "Active Speaker" for the same person.
 */
export interface CallMember extends VoiceParticipant {
  isSelf: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface CallRoster {
  /** You first, then everyone else — the order the tiles are laid out in. */
  members: CallMember[];
  /** Whoever the spotlight is on: pinned, else presenting, else speaking. */
  spotlight: CallMember | null;
  /** True while anyone, you included, is sharing a screen. */
  hasScreenShare: boolean;
  screenShare: CallMember | null;
}

/**
 * The call's roster, in the shape the screen actually draws.
 *
 * Kept out of the screen because it is the one piece with real logic in it —
 * who is on stage, and what each person is called — and because a spotlight
 * rule that lives next to a `<View>` is a spotlight rule nobody finds.
 */
export function useCallRoster(pinnedId: string | null): CallRoster {
  const { user } = useAuth();
  const {
    status,
    muted,
    isCameraOn,
    isScreenSharing,
    isHandRaised,
    participants,
    screenSharingParticipant,
  } = useVoice();

  const remoteIds = useMemo(() => participants.map((p) => p.id), [participants]);
  const lookupProfile = useProfiles(remoteIds);

  const selfId = user?.id ?? 'self';

  const members = useMemo<CallMember[]>(() => {
    const self: CallMember = {
      id: selfId,
      role: 'owner',
      muted,
      anonymous: false,
      isCameraOn,
      isScreenSharing,
      isHandRaised,
      // Without a level meter from the SFU, "unmuted and connected" is the
      // honest approximation of your own speaking state.
      isSpeaking: !muted && status === 'connected',
      isSelf: true,
      displayName: user?.profile?.display_name || user?.handle || 'You',
      avatarUrl: user?.profile?.avatar_url ?? null,
    };

    const remotes = participants.map<CallMember>((participant) => {
      const profile = lookupProfile(participant.id);
      return {
        ...participant,
        isSelf: false,
        displayName: profile?.display_name || 'Member',
        avatarUrl: profile?.avatar_url ?? null,
      };
    });

    return [self, ...remotes];
  }, [
    selfId,
    user,
    muted,
    status,
    isCameraOn,
    isScreenSharing,
    isHandRaised,
    participants,
    lookupProfile,
  ]);

  const screenShare = useMemo(() => {
    if (isScreenSharing) return members[0] ?? null;
    if (!screenSharingParticipant) return null;
    return members.find((m) => m.id === screenSharingParticipant.id) ?? null;
  }, [isScreenSharing, screenSharingParticipant, members]);

  const spotlight = useMemo(() => {
    // A pin is a decision the user made, so nothing else outranks it.
    const pinned = pinnedId ? members.find((m) => m.id === pinnedId) : undefined;
    if (pinned) return pinned;
    if (screenShare) return screenShare;
    // Someone else talking, before falling back to your own tile — a spotlight
    // that lands on yourself while another person speaks is the wrong one.
    const speaking = members.find((m) => !m.isSelf && m.isSpeaking);
    return speaking ?? members[0] ?? null;
  }, [pinnedId, screenShare, members]);

  return {
    members,
    spotlight,
    hasScreenShare: screenShare !== null,
    screenShare,
  };
}
