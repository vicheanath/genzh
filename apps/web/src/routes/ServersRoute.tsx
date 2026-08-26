import { Link } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { CompassIcon } from '@/components/Icons'
import { ModeSwitch } from '@/components/ModeSwitch'
import { Skeleton } from '@/components/Skeleton'
import { useCommunitiesList } from '@/features/api'

import styles from './ServersRoute.module.css'

/**
 * The community half's front door.
 *
 * On a wide screen the rail beside it already lists these, and this page is
 * still what the switch out of the playground lands on: arriving in the other
 * half of the app on whichever channel you last read would be a strange way in,
 * and a phone has no rail at all.
 */
export function ServersRoute() {
  const communities = useCommunitiesList()
  const list = communities.data ?? []

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Servers</h1>
            <p className={styles.lede}>
              Communities you belong to. Channels, roles and history — the half of
              genzh that is still here tomorrow.
            </p>
          </div>
          <div className={styles.actions}>
            <ModeSwitch />
            <Link to="/explore">
              <Button size="sm" variant="secondary">
                <CompassIcon size={15} />
                Explore servers
              </Button>
            </Link>
          </div>
        </header>

        {communities.isLoading && (
          <div className={styles.grid}>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={styles.card}>
                <Skeleton circle width="2.375rem" height="2.375rem" />
                <div className={styles.cardBody} style={{ flex: 1 }}>
                  <Skeleton width="70%" height="1rem" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!communities.isLoading && list.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyMark} aria-hidden>
              <CompassIcon size={22} />
            </span>
            <div>
              <p>You have not joined any communities yet.</p>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Link to="/explore">
                  <Button size="sm">
                    <CompassIcon size={15} />
                    Browse communities
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div className={styles.grid}>
            {list.map((community) => (
              <Link key={community.id} to={`/c/${community.id}`} className={styles.card}>
                <Avatar name={community.name} src={community.icon_url} size="md" />
                <div className={styles.cardBody}>
                  <div className={styles.cardName}>{community.name}</div>
                  <div className={styles.cardDescription}>
                    {community.description ?? 'Server'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
