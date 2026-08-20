import { Avatar } from '@/components/Avatar'
import { CompassIcon, MessageSquareIcon, PlusIcon, UsersIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import type { Community } from '@/lib/api'
import { cx } from '@/lib/cx'

import { RailItem } from './RailItem'
import styles from './shell.module.css'

/**
 * The community rail: everywhere you can go, stacked down the edge.
 *
 * Desktop renders it beside the sidebar; on a phone the same component sits in
 * the navigation drawer. It takes its data as props rather than fetching, so
 * either frame can mount it without a second request.
 */
export function CommunityRail({
  communities,
  loading,
  onAddClick,
}: {
  communities: Community[] | null
  loading: boolean
  onAddClick: () => void
}) {
  return (
    <nav className={styles.rail} aria-label="Communities">
      <RailItem to="/" end label="Direct Messages">
        <MessageSquareIcon size={20} />
      </RailItem>

      <RailItem to="/friends" label="Friends">
        <UsersIcon size={20} />
      </RailItem>

      <RailItem to="/explore" label="Explore Communities">
        <CompassIcon size={20} />
      </RailItem>

      <div className={styles.railDivider} />

      {loading &&
        Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} circle width="2.75rem" height="2.75rem" />
        ))}

      {communities?.map((community) => (
        <RailItem key={community.id} to={`/c/${community.id}`} label={community.name} bare>
          <Avatar name={community.name} src={community.icon_url} size="md" />
        </RailItem>
      ))}

      <RailItem label="Add a Server" onClick={onAddClick} className={cx(styles.railAdd)}>
        <PlusIcon size={20} className={styles.railAddIcon} />
      </RailItem>
    </nav>
  )
}
