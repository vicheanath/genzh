import { useMemo, useState } from 'react'

import { SearchIcon, XIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { UserRow } from '@/components/UserRow'
import { type Uuid } from '@/lib/api'
import { useCommunityMembers, useCosmeticsFor, useRoomParticipantsQuery } from '@/features/api'
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

interface MemberEntry {
  user_id: Uuid
  nickname: string | null
  roles: { id: Uuid; name: string; color: string | null; position: number }[]
}

export function MemberList({ communityId, roomId }: MemberListProps) {
  const { user } = useAuth()
  const [selectedUserId, setSelectedUserId] = useState<Uuid | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')

  const communityMembers = useCommunityMembers(communityId)
  const participants = useRoomParticipantsQuery(communityId ? null : roomId)

  // One request for everybody in the list rather than one per row — the whole
  // reason the cosmetics endpoint takes a set of ids.
  const cosmetics = useCosmeticsFor(
    useMemo(
      () =>
        (communityId ? (communityMembers.data ?? []) : (participants.data ?? [])).map(
          (entry) => entry.user_id,
        ),
      [communityId, communityMembers.data, participants.data],
    ),
  )

  const source = communityId ? communityMembers : participants
  const members: MemberEntry[] = useMemo(() => {
    if (communityId) {
      return (communityMembers.data ?? []).map((m) => ({
        user_id: m.user_id,
        nickname: m.nickname,
        roles: m.roles ?? [],
      }))
    }
    return (participants.data ?? []).map((p) => ({
      user_id: p.user_id,
      nickname: null,
      roles: [],
    }))
  }, [communityId, communityMembers.data, participants.data])

  const userIds = useMemo(() => members.map((m) => m.user_id), [members])
  const lookup = useProfiles(userIds)
  const { isOnline } = usePresence()

  // Filter by query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const p = lookup(m.user_id)
      const name = m.nickname ?? p?.display_name ?? ''
      const handle = p?.handle ?? ''
      return name.toLowerCase().includes(q) || handle.toLowerCase().includes(q)
    })
  }, [members, query, lookup])

  // Group members into Online and Offline
  const { online, offline } = useMemo(() => {
    const on: MemberEntry[] = []
    const off: MemberEntry[] = []

    for (const m of filtered) {
      if (isOnline(m.user_id)) {
        on.push(m)
      } else {
        off.push(m)
      }
    }

    // Sort alphabetically by name
    const sortFn = (a: MemberEntry, b: MemberEntry) => {
      const nameA = a.nickname ?? lookup(a.user_id)?.display_name ?? ''
      const nameB = b.nickname ?? lookup(b.user_id)?.display_name ?? ''
      return nameA.localeCompare(nameB)
    }

    on.sort(sortFn)
    off.sort(sortFn)

    return { online: on, offline: off }
  }, [filtered, isOnline, lookup])

  function renderMember(member: MemberEntry) {
    const profile = lookup(member.user_id)
    const name = member.nickname ?? profile?.display_name ?? 'Loading…'
    const highestRole = member.roles.length > 0 ? member.roles[0] : null
    const roleColor = highestRole?.color ?? profile?.accent_color ?? undefined

    return (
      <UserRow
        key={member.user_id}
        name={name}
        avatarUrl={profile?.avatar_url}
        accentColor={roleColor}
        presence={isOnline(member.user_id) ? 'online' : 'offline'}
        secondary={
          highestRole ? (
            <span
              className={styles.roleTag}
              style={{ color: highestRole.color ?? undefined }}
            >
              {highestRole.name}
            </span>
          ) : profile ? (
            `@${profile.handle}`
          ) : undefined
        }
        cosmetics={cosmetics.data?.get(member.user_id)}
        tintName={Boolean(highestRole?.color)}
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
  }

  return (
    <div className={styles.panel}>
      {members.length > 8 && (
        <div className={styles.searchContainer}>
          <div className={styles.searchBar}>
            <SearchIcon size={13} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search members..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {online.length > 0 && (
        <div className={styles.group}>
          <div className={styles.heading}>
            <span>Online</span>
            <span className={styles.groupBadge}>{online.length}</span>
          </div>
          {online.map(renderMember)}
        </div>
      )}

      {offline.length > 0 && (
        <div className={styles.group}>
          <div className={styles.heading}>
            <span>Offline</span>
            <span className={styles.groupBadge}>{offline.length}</span>
          </div>
          {offline.map(renderMember)}
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

      {!source.isLoading && members.length > 0 && filtered.length === 0 && (
        <p className={styles.message}>No members matching "{query}"</p>
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
