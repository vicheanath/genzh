import { useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { Skeleton } from '@/components/Skeleton'
import {
  communities as communitiesApi,
  rooms as roomsApi,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import { ProfileDialog } from './ProfileDialog'
import styles from './MemberList.module.css'

interface MemberListProps {
  communityId?: Uuid | null
  roomId?: Uuid
}

export function MemberList({ communityId, roomId }: MemberListProps) {
  const { getToken, user } = useAuth()
  const [selectedUserId, setSelectedUserId] = useState<Uuid | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const members = useAsync(async () => {
    const token = await getToken()
    if (communityId) {
      const list = await communitiesApi.members(token, communityId)
      return list.map((m) => ({ user_id: m.user_id, nickname: m.nickname }))
    }
    if (roomId) {
      const list = await roomsApi.participants(token, roomId)
      return list.map((p) => ({ user_id: p.user_id, nickname: undefined }))
    }
    return []
  }, [getToken, communityId, roomId])

  const lookup = useProfiles(members.data?.map((member) => member.user_id) ?? [])
  const { isOnline } = usePresence()

  // Online first. A member list sorted by join order buries the people you can
  // actually talk to right now.
  const allMembers = [...(members.data ?? [])].sort(
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
              <div
                key={member.user_id}
                className={styles.member}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedUserId(member.user_id)
                  setDialogOpen(true)
                }}
              >
                <Avatar
                  name={name}
                  src={profile?.avatar_url}
                  color={profile?.accent_color}
                  size="sm"
                  presence={isOnline(member.user_id) ? 'online' : 'offline'}
                />
                <div className={styles.identity}>
                  <div className={styles.name} style={{ color: profile?.accent_color ?? undefined }}>
                    {name}
                  </div>
                  {profile && <div className={styles.handle}>@{profile.handle}</div>}
                </div>
                {member.user_id === user?.id && <span className={styles.youTag}>you</span>}
              </div>
            )
          })}
        </div>
      )}

      {members.loading && (
        <div className={styles.skeletons}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <Skeleton circle width="1.875rem" height="1.875rem" />
              <Skeleton width={`${[70, 52, 64, 45, 58, 66][index]}%`} height="0.8rem" />
            </div>
          ))}
        </div>
      )}

      {members.error && <p className={styles.message}>{members.error}</p>}
      {members.data?.length === 0 && <p className={styles.message}>Nobody here yet.</p>}

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
