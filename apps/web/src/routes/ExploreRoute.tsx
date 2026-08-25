import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CompassIcon, PlusIcon, SearchIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { ApiError, type Uuid } from '@/lib/api'
import { useCommunitiesList, useJoinCommunityMutation } from '@/features/api'
import { errorText } from '@/lib/errors'
import { hueFor } from '@/lib/palette'

import { AddCommunityDialog } from './AddCommunityDialog'
import styles from './ExploreRoute.module.css'

export function ExploreRoute() {
  const navigate = useNavigate()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const communities = useCommunitiesList()
  const joinCommunity = useJoinCommunityMutation()
  // Which row is spinning, not merely that something is: several Join buttons
  // are on screen and only the pressed one should show it.
  const joiningId = joinCommunity.isPending ? joinCommunity.variables : null

  async function handleJoin(communityId: Uuid) {
    try {
      await joinCommunity.mutateAsync(communityId)
      toast.success('Joined community!')
      void navigate(`/c/${communityId}`)
    } catch (cause) {
      // Already a member: the button is stale, and the place they wanted to
      // reach is the one they are already in.
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        void navigate(`/c/${communityId}`)
        return
      }
      toast.error('Could not join community', errorText(cause))
    }
  }

  const filtered = (communities.data ?? []).filter((c) => {
    if (!query) return true
    const search = query.toLowerCase()
    return (
      c.name.toLowerCase().includes(search) ||
      (c.description && c.description.toLowerCase().includes(search))
    )
  })

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.greeting}>
            <CompassIcon size={16} />
            Explore
          </div>
          <h1 className={styles.title}>Find your community</h1>
          <p className={styles.lede}>
            From gaming and music to tech and art, discover public communities on genzh or create your own.
          </p>
        </header>

        {communities.error && (
          <Callout tone="danger">{errorText(communities.error, 'Could not load communities')}</Callout>
        )}

        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities by name or topic…"
            />
          </div>

          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <PlusIcon size={16} />
            Create Server
          </Button>
        </div>

        <section>
          <div className={styles.sectionTitle}>
            <span>Featured Communities</span>
            {communities.data && <Badge>{filtered.length}</Badge>}
          </div>

          {communities.isLoading && (
            <div className={styles.grid}>
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className={styles.card}>
                  <Skeleton height="4.5rem" />
                  <div style={{ padding: 'var(--space-4)' }}>
                    <Skeleton width="60%" height="1.1rem" />
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      <Skeleton width="90%" height="0.85rem" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!communities.isLoading && filtered.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyMark} aria-hidden>
                <CompassIcon size={22} />
              </span>
              <div>
                <p>No communities found{query ? ` matching "${query}"` : ''}.</p>
                {query && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                      Clear Search
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div className={styles.grid}>
              {filtered.map((community) => (
                <div key={community.id} className={styles.card}>
                  <div
                    className={styles.cardBanner}
                    style={{ '--seed': hueFor(community.name) } as React.CSSProperties}
                  />
                  <div className={styles.cardBody}>
                    <div className={styles.cardAvatarWrap}>
                      <Avatar name={community.name} src={community.icon_url} size="lg" />
                    </div>
                    <h3 className={styles.cardName}>{community.name}</h3>
                    <p className={styles.cardDescription}>
                      {community.description || 'Welcome to this community! Join to hang out and chat.'}
                    </p>

                    <div className={styles.cardFooter}>
                      <span className={styles.cardTag}>Public Community</span>
                      <Button
                        size="sm"
                        onClick={() => void handleJoin(community.id)}
                        disabled={joiningId === community.id}
                      >
                        {joiningId === community.id && <Spinner />}
                        Join
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AddCommunityDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />
    </div>
  )
}

/** Consistent hue per community name, matching the Avatar's and CommunityRoute's scheme */
