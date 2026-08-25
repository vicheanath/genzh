import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { Callout } from '@/components/Callout'
import { ArrowLeftIcon } from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import { CommunitySettings, type CommunityTab } from '@/features/community-settings'
import { useCommunityDetail } from '@/features/api'
import { errorText } from '@/lib/errors'
import { useIsMobile } from '@/lib/useMediaQuery'

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
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [activeTab, setActiveTab] = useState<CommunityTab>('overview')

  const community = useCommunityDetail(communityId)

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

      {community.isLoading && <LoadingPanel />}
      {community.error && (
        <div className={styles.message}>
          <Callout tone="danger">{errorText(community.error, 'Could not load this server')}</Callout>
        </div>
      )}

      {community.data && (
        <CommunitySettings
          community={community.data}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="page"
          // The tabs' own mutations invalidate the community, its rooms and
          // the list in the rail, so a rename is already in the sidebar behind
          // this screen by the time the callback fires.
          onUpdated={() => {}}
          onDeleted={() => void navigate('/')}
        />
      )}
    </div>
  )
}
