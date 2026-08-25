import { Callout } from '@/components/Callout'
import { Tabs } from '@/components/Tabs'
import type { CommunityWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'

import { ChannelsTab } from './ChannelsTab'
import { InvitesTab } from './InvitesTab'
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

  // The two shapes are two tab layouts, not two components: a column of
  // destinations beside the panel on a desktop, a strip across the top on a
  // phone where a 15rem sidebar would leave no page.
  const isDialog = variant === 'dialog'

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => onTabChange(value as CommunityTab)}
      orientation={isDialog ? 'vertical' : 'horizontal'}
      className={cx(styles.shell, !isDialog && styles.shellPage)}
    >
      <nav className={cx(styles.nav, !isDialog && styles.navStrip)} aria-label="Server settings">
        {isDialog && <div className={styles.navHeading}>{community.name}</div>}

        <Tabs.List variant={isDialog ? 'rail' : 'pill'} className={styles.navList}>
          {COMMUNITY_TABS.map(({ id, label, short, icon: Icon }) => (
            <Tabs.Tab key={id} value={id} className={styles.navTab}>
              <Icon size={16} />
              {isDialog ? label : short}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </nav>

      {/* Base UI does not mount a hidden panel, so each tab still fetches only
          when it is looked at, and switching away drops its half-typed form
          rather than carrying it into the next panel. */}
      <Tabs.Panel value="overview" className={styles.panel}>
        <OverviewTab
          community={community}
          abilities={abilities}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      </Tabs.Panel>
      <Tabs.Panel value="roles" className={styles.panel}>
        <RolesTab community={community} abilities={abilities} />
      </Tabs.Panel>
      <Tabs.Panel value="members" className={styles.panel}>
        <MembersTab community={community} abilities={abilities} />
      </Tabs.Panel>
      <Tabs.Panel value="channels" className={styles.panel}>
        <ChannelsTab community={community} abilities={abilities} />
      </Tabs.Panel>
      <Tabs.Panel value="invites" className={styles.panel}>
        <InvitesTab community={community} abilities={abilities} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}
