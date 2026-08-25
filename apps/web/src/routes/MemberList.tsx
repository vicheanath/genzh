import { useState } from 'react'

import { UserRow } from '@/components/UserRow'
import { Skeleton } from '@/components/Skeleton'
import { type Uuid } from '@/lib/api'
import { useCommunityMembers, useRoomParticipantsQuery } from '@/features/api'
import { errorText } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import { ProfileDialog } from './ProfileDialog'
import styles from './MemberList.module.css'

interface MemberListProps {
  communityId?: Uuid | null
  roomId?: Uuid
}

export function MemberList({ communityId, roomId }: MemberListProps) {
  const { user } = useAuth()
  const [selectedUserId, setSelectedUserId] = useState<Uuid | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // A community lists its members, a standalone room its participants. Only
  // one of the two is enabled, and both read the cache the rest of the screen
  // has usually filled already.
  const communityMembers = useCommunityMembers(communityId)
  const participants = useRoomParticipantsQuery(communityId ? null : roomId)

  const source = communityId ? communityMembers : participants
  const members: { user_id: Uuid; nickname: string | null }[] = communityId
    ? (communityMembers.data ?? []).map((m) => ({ user_id: m.user_id, nickname: m.nickname }))
    : (participants.data ?? []).map((p) => ({ user_id: p.user_id, nickname: null }))

  const lookup = useProfiles(members.map((member) => member.user_id))
  const { isOnline } = usePresence()

  // Online first. A member list sorted by join order buries the people you can
  // actually talk to right now.
  const allMembers = [...members].sort(
    (a, b) => Number(isOnline(b.user_id)) - Number(isOnline(a.user_id)),
  )

  return (
    <div className={styles.panel}>
      {allMembers.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.heading}>
            {communityId ? 'MEMBERS' : 'PARTICIPANTS'} — {allMembers.length}
          </h2>
          {allMembers.map((member) => {
            const profile = lookup(member.user_id)
            const name = member.nickname ?? profile?.display_name ?? 'Loading…'
            return (
              <UserRow
                key={member.user_id}
                name={name}
                avatarUrl={profile?.avatar_url}
                accentColor={profile?.accent_color}
                presence={isOnline(member.user_id) ? 'online' : 'offline'}
                secondary={profile ? `@${profile.handle}` : undefined}
                tintName
                size="sm"
                onSelect={() => {
                  setSelectedUserId(member.user_id)
                  setDialogOpen(true)
                }}
                actions={
                  member.user_id === user?.id ? (
                    <span className={styles.youTag}>you</span>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      )}

      {source.isLoading && (
        <div className={styles.skeletons}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <Skeleton circle width="1.875rem" height="1.875rem" />
              <Skeleton width={`${[70, 52, 64, 45, 58, 66][index]}%`} height="0.8rem" />
            </div>
          ))}
        </div>
      )}

      {source.error && (
        <p className={styles.message}>{errorText(source.error, 'Could not load this list')}</p>
      )}
      {!source.isLoading && !source.error && members.length === 0 && (
        <p className={styles.message}>Nobody here yet.</p>
      )}

      {selectedUserId && (
        <ProfileDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          targetUserId={selectedUserId}
        />
      )}
    </div>
  )
}
