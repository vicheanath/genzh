import { Callout } from '@/components/Callout'
import type { CommunityWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'

import { ChannelsTab } from './ChannelsTab'
import { MembersTab } from './MembersTab'
import { OverviewTab } from './OverviewTab'
import { RolesTab } from './RolesTab'
import { abilitiesFor, canOpenSettings, COMMUNITY_TABS, type CommunityTab } from './tabs'
import styles from './communitySettings.module.css'

export interface CommunitySettingsProps {
  community: CommunityWithPermissions
  activeTab: CommunityTab
  onTabChange: (tab: CommunityTab) => void
  /**
   * Where this is being shown.
   *
   * `dialog` is the desktop shape — a column of destinations beside the panel.
   * `page` is the phone one, where a 15rem sidebar would leave no page, so the
   * same list becomes a strip across the top.
   */
  variant: 'dialog' | 'page'
  onUpdated?: () => void
  onDeleted?: () => void
}

/**
 * Server settings, without deciding how it is presented.
 *
 * This used to be one 677-line component that was also a dialog, which is why
 * there was no way to show it as anything else. The split is between *what the
 * settings are* — this file and the four panels — and *where they appear*: the
 * dialog wrapper next door, and the route in `routes/CommunitySettingsRoute`.
 *
 * Each panel owns its own fetching. Before, the shell fetched roles, members
 * and channels the moment settings opened, so looking at the server's name cost
 * three requests for lists nobody had asked to see.
 */
export function CommunitySettings({
  community,
  activeTab,
  onTabChange,
  variant,
  onUpdated,
  onDeleted,
}: CommunitySettingsProps) {
  const { user } = useAuth()
  const abilities = abilitiesFor(community, user?.id)

  if (!canOpenSettings(abilities)) {
    return (
      <div className={styles.panel}>
        <Callout tone="info">
          You do not have permission to manage {community.name}.
        </Callout>
      </div>
    )
  }

  return (
    <div className={cx(styles.shell, variant === 'page' && styles.shellPage)}>
      <nav
        className={cx(styles.nav, variant === 'page' && styles.navStrip)}
        aria-label="Server settings"
      >
        {variant === 'dialog' && <div className={styles.navHeading}>{community.name}</div>}

        {COMMUNITY_TABS.map(({ id, label, short, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cx(styles.navButton, activeTab === id && styles.navButtonActive)}
            onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={16} />
            {variant === 'page' ? short : label}
          </button>
        ))}
      </nav>

      {/* Keyed so switching tabs remounts rather than carrying one panel's
          half-typed form into the next. */}
      <div className={styles.panel} key={activeTab}>
        {activeTab === 'overview' && (
          <OverviewTab
            community={community}
            abilities={abilities}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
        )}
        {activeTab === 'roles' && <RolesTab community={community} abilities={abilities} />}
        {activeTab === 'members' && <MembersTab community={community} abilities={abilities} />}
        {activeTab === 'channels' && <ChannelsTab community={community} abilities={abilities} />}
      </div>
    </div>
  )
}
