import { Avatar } from '@/components/Avatar'
import { Skeleton } from '@/components/Skeleton'
import { communities as communitiesApi, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { useProfiles } from '@/lib/useProfiles'

import styles from './MemberList.module.css'

/**
 * Everyone in a community.
 *
 * The API returns membership rows — ids and nicknames — so the names come from
 * the shared profile cache. That cache is already warm from the transcript, so
 * opening this beside a busy room usually costs no requests at all.
 */
export function MemberList({ communityId }: { communityId: Uuid }) {
  const { getToken, user } = useAuth()

  const members = useAsync(
    async () => communitiesApi.members(await getToken(), communityId),
    [getToken, communityId],
  )

  const lookup = useProfiles(members.data?.map((member) => member.user_id) ?? [])

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>
        Members
        {members.data && <span className={styles.count}>{members.data.length}</span>}
      </h2>

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

      {members.data?.map((member) => {
        const profile = lookup(member.user_id)
        // The nickname is community-scoped and outranks the global display name
        // — that is the whole reason it exists.
        const name = member.nickname ?? profile?.display_name ?? 'Loading…'

        return (
          <div key={member.user_id} className={styles.member}>
            <Avatar
              name={name}
              src={profile?.avatar_url}
              color={profile?.accent_color}
              size="sm"
            />
            <div className={styles.identity}>
              <div className={styles.name}>{name}</div>
              {profile && <div className={styles.handle}>@{profile.handle}</div>}
            </div>
            {member.user_id === user?.id && <span className={styles.youTag}>you</span>}
          </div>
        )
      })}

      {members.data?.length === 0 && <p className={styles.message}>Nobody here yet.</p>}
    </div>
  )
}
