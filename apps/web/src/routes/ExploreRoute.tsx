import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CompassIcon, PlusIcon, SearchIcon, SparkleIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { ApiError, type Uuid } from '@/lib/api'
import {
  explain,
  useCommunitiesList,
  useJoinCommunityMutation,
  useRecommendedCommunities,
} from '@/features/api'
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

        {/* Suggestions above the full list: this screen is reached by someone
            who has decided to look for something, and the ranked answer is
            more useful to them than the alphabetical one. */}
        <SuggestedCommunities onJoin={handleJoin} joiningId={joiningId} />

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

/**
 * Communities ranked for this account.
 *
 * Item-to-item collaborative filtering: the communities that the people in
 * *your* communities also belong to. Size is a term too, unlike the people
 * surface — joining is low-risk and an empty community is a bad experience
 * regardless of fit, so a popularity prior is doing honest work here.
 */
function SuggestedCommunities({
  onJoin,
  joiningId,
}: {
  onJoin: (id: Uuid) => void | Promise<void>
  joiningId: Uuid | null | undefined
}) {
  const suggestions = useRecommendedCommunities(6)
  const items = suggestions.data?.items ?? []

  // Silent when there is nothing to say. An account already in every community
  // has no suggestions, and that is a success rather than something to explain.
  if (suggestions.isLoading || items.length === 0) return null

  return (
    <section>
      <div className={styles.sectionTitle}>
        <span>{suggestions.data?.personalized ? 'Suggested for you' : 'Popular communities'}</span>
        <Badge>{items.length}</Badge>
      </div>

      <div className={styles.grid}>
        {items.map((community) => {
          const reason = explain(community.reasons)
          return (
            <div key={community.community_id} className={styles.card}>
              <div
                className={styles.cardBanner}
                style={{ '--seed': hueFor(community.name) } as React.CSSProperties}
              />
              <div className={styles.cardBody}>
                <div className={styles.cardAvatarWrap}>
                  <Avatar name={community.name} src={community.icon_url ?? undefined} size="lg" />
                </div>
                <h3 className={styles.cardName}>{community.name}</h3>
                <p className={styles.cardDescription}>
                  {community.description || 'Welcome to this community! Join to hang out and chat.'}
                </p>

                {reason && (
                  <p className={styles.reason}>
                    <SparkleIcon size={11} aria-hidden />
                    <span className={styles.reasonText} title={reason}>
                      {reason}
                    </span>
                  </p>
                )}

                <div className={styles.cardFooter}>
                  <span className={styles.cardTag}>
                    {community.member_count} member{community.member_count === 1 ? '' : 's'}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => void onJoin(community.community_id)}
                    disabled={joiningId === community.community_id}
                  >
                    {joiningId === community.community_id && <Spinner />}
                    Join
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
