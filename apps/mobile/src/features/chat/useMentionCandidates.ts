import { useMemo } from 'react';
import {
  useCommunityMembersQuery,
  useRoomParticipantsQuery,
  EVERYONE_CANDIDATE,
  toCandidate,
  type MentionCandidate,
  type MentionMember,
  type Uuid,
} from '@genzh/shared';

import { useAuth } from '../../context/AuthContext';
import { usePresence } from '../../lib/usePresence';
import { useProfiles } from '../../lib/useProfiles';

/**
 * Who the composer can complete an `@` to.
 *
 * Sourced the same way the member list is: a community channel completes to the
 * community's members, a standalone room to its participants. Fetched once per
 * room and filtered in memory — the list is capped server-side, and a request
 * per keystroke would put the network between a person and their own typing.
 *
 * Yourself is left out. Mentioning yourself notifies nobody, so a row for it is
 * a row in the way.
 */
export function useMentionCandidates(room: {
  id: Uuid;
  community_id: Uuid | null;
}): MentionCandidate[] {
  const { token, user } = useAuth();
  const { isOnline } = usePresence();

  // A community channel mentions the whole community; a standalone room only
  // mentions who is in it. Whichever applies, the other query stays disabled.
  const communityMembers = useCommunityMembersQuery(token, room.community_id ?? null);
  const roomParticipants = useRoomParticipantsQuery(token, room.community_id ? null : room.id);

  const members = useMemo<MentionMember[]>(
    () =>
      room.community_id
        ? (communityMembers.data ?? []).map((member) => ({
            userId: member.user_id,
            nickname: member.nickname,
          }))
        : (roomParticipants.data ?? []).map((participant) => ({
            userId: participant.user_id,
          })),
    [room.community_id, communityMembers.data, roomParticipants.data],
  );

  const roster = members.filter((member) => member.userId !== user?.id);

  // Resolving through the shared cache means a room whose transcript is already
  // on screen usually has every profile in hand before the first `@` is typed.
  const lookup = useProfiles(roster.map((member) => member.userId));

  const people = roster
    .map((member) => toCandidate(member, lookup(member.userId), isOnline(member.userId)))
    .filter((candidate): candidate is MentionCandidate => candidate !== null);

  return [EVERYONE_CANDIDATE, ...people];
}
