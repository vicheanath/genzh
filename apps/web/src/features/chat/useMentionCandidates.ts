import { useCommunityMembers, useRoomParticipantsQuery } from '@/features/api'
import type { Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import {
  EVERYONE_CANDIDATE,
  toCandidate,
  type MentionCandidate,
  type MentionMember,
} from './mentions'

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
  id: Uuid
  community_id: Uuid | null
}): MentionCandidate[] {
  const { user } = useAuth()
  const { isOnline } = usePresence()

  // Only one of the two ever runs: a channel completes to the community's
  // members, a standalone room to its participants. Both read the same cache
  // the member list fills, so opening the picker on a screen that already
  // listed them costs nothing.
  const communityMembers = useCommunityMembers(room.community_id)
  const participants = useRoomParticipantsQuery(room.community_id ? null : room.id)

  const roster: MentionMember[] = room.community_id
    ? (communityMembers.data ?? []).map((member) => ({
        userId: member.user_id,
        nickname: member.nickname,
      }))
    : (participants.data ?? []).map((participant) => ({ userId: participant.user_id }))

  const withoutSelf = roster.filter((member) => member.userId !== user?.id)

  // Resolving through the shared cache means a room whose transcript is already
  // on screen usually has every profile in hand before the first `@` is typed.
  const lookup = useProfiles(withoutSelf.map((member) => member.userId))

  const people = withoutSelf
    .map((member) => toCandidate(member, lookup(member.userId), isOnline(member.userId)))
    .filter((candidate): candidate is MentionCandidate => candidate !== null)

  // Deliberately not memoised: the list is small, `lookup` is a stable callback
  // that re-renders as profiles land, and a memo keyed on it would freeze the
  // rows at whatever had resolved first.
  return [EVERYONE_CANDIDATE, ...people]
}
