import { useState } from 'react'
import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { Callout } from '@/components/Callout'
import { ArrowLeftIcon } from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { CommunitySettings, type CommunityTab } from '@/features/community-settings'
import { communities as communitiesApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'

import type { ShellContext } from './AppShell'
import styles from './CommunitySettingsRoute.module.css'

/**
 * Server settings as a screen.
 *
 * A dialog on a phone is a page wearing a costume: it covers the whole viewport
 * anyway, but it is not a place, so the back gesture closes the app's idea of
 * where you are instead of taking you back. This is the same settings, mounted
 * at a URL — which means back works, the address can be shared with a
 * co-owner, and a reload lands where you were.
 *
 * The desktop keeps the dialog. Settings there sit *over* the server you are
 * looking at, and losing that context to a full-page navigation would be a
 * downgrade.
 */
export function CommunitySettingsRoute() {
  const { communityId = '' } = useParams<{ communityId: string }>()
  const { getToken } = useAuth()
  const { reloadRooms, reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [activeTab, setActiveTab] = useState<CommunityTab>('overview')

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  )

  // A widened window, or a link opened on a desktop: go to the server and open
  // the dialog there, which is where these settings live in that layout.
  // Redirecting to the home screen instead would lose what the link was about.
  if (!isMobile) {
    return <Navigate to={`/c/${communityId}`} replace state={{ openSettings: true }} />
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => void navigate(`/c/${communityId}`)}
          aria-label="Back to the server"
        >
          <ArrowLeftIcon size={18} />
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Server settings</h1>
          <p className={styles.subtitle}>{community.data?.name ?? '…'}</p>
        </div>
      </header>

      {community.loading && <LoadingPanel />}
      {community.error && (
        <div className={styles.message}>
          <Callout tone="danger">{community.error}</Callout>
        </div>
      )}

      {community.data && (
        <CommunitySettings
          community={community.data}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="page"
          onUpdated={() => {
            community.reload()
            reloadCommunities()
            // A renamed server has to change in the rail behind this screen,
            // and a new channel has to be in the list you go back to.
            reloadRooms()
          }}
          onDeleted={() => {
            reloadCommunities()
            void navigate('/')
          }}
        />
      )}
    </div>
  )
}
