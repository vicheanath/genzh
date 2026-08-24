import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useState } from 'react'

import { SignOutIcon, XIcon } from '@/components/Icons'
import { Tabs } from '@/components/Tabs'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'

import { AccountTab } from './AccountTab'
import { AnonymousTab } from './AnonymousTab'
import { AppearanceTab } from './AppearanceTab'
import { BlockedTab } from './BlockedTab'
import { DevicesTab } from './DevicesTab'
import { ProfileTab } from './ProfileTab'
import { SETTINGS_GROUPS, type SettingsTab } from './tabs'
import styles from './settings.module.css'

export type { SettingsTab }

interface UserSettingsModalProps {
  open: boolean
  initialTab?: SettingsTab
  onClose: () => void
}

/**
 * The settings shell: navigation, the close affordance, and which panel is up.
 *
 * Each tab owns its own state and requests. That is the point of the split —
 * this file used to hold all six panels plus their forms, their drafts and
 * their fetches in one component, so opening settings ran every tab's effects
 * whether or not you looked at them. `Tabs.Panel` keeps that property: it does
 * not mount a hidden panel, so switching tabs is still what triggers a tab's
 * fetch, and switching away unmounts its draft state.
 *
 * The navigation was six hand-written buttons wired with `aria-current="page"`,
 * which described the sidebar as a set of links to elsewhere rather than as a
 * tab list over panels in this dialog. Base UI wires the real relationship —
 * `aria-controls`/`aria-labelledby` in both directions — and gives the column
 * arrow-key navigation as one tab stop instead of six.
 */
export function UserSettingsModal({
  open,
  initialTab = 'profile',
  onClose,
}: UserSettingsModalProps) {
  const { user, logout } = useAuth()
  const storeTab = useAppStore((s) => s.userSettingsTab)
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || storeTab)

  // Opening the modal returns to the tab the caller asked for; while it stays
  // open, the user's own navigation wins.
  useEffect(() => {
    if (open) setActiveTab(initialTab || storeTab)
  }, [open, initialTab, storeTab])

  if (!open || !user) return null

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.modal}>
          <Tabs.Root
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsTab)}
            orientation="vertical"
            className={styles.tabsRoot}
          >
            <aside className={styles.sidebar}>
              <Tabs.List variant="rail" className={styles.navList}>
                {SETTINGS_GROUPS.map((group) => (
                  <div key={group.heading} className={styles.sidebarGroup}>
                    <div className={styles.sidebarHeading}>{group.heading}</div>
                    {group.tabs.map(({ id, label, icon: Icon }) => (
                      <Tabs.Tab key={id} value={id} className={styles.navTab}>
                        <Icon size={16} />
                        {label}
                      </Tabs.Tab>
                    ))}
                  </div>
                ))}
              </Tabs.List>

              {/* Outside the tab list on purpose: signing out is an action, not
                  a destination, and putting it in the list would make it an
                  arrow-key stop between panels. */}
              <div className={cx(styles.sidebarGroup, styles.sidebarFooter)}>
                <button
                  type="button"
                  className={cx(styles.navButton, styles.dangerButton)}
                  onClick={() => void logout()}
                >
                  <SignOutIcon size={16} />
                  Sign out
                </button>
              </div>
            </aside>

            <div className={styles.contentWrapper}>
              <div className={styles.closeButtonContainer}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={onClose}
                  aria-label="Close settings"
                >
                  <XIcon size={18} />
                </button>
                <span className={styles.escKey}>ESC</span>
              </div>

              <Tabs.Panel value="profile" className={styles.scrollArea}>
                <ProfileTab user={user} />
              </Tabs.Panel>
              <Tabs.Panel value="anonymous" className={styles.scrollArea}>
                <AnonymousTab user={user} />
              </Tabs.Panel>
              <Tabs.Panel value="account" className={styles.scrollArea}>
                <AccountTab user={user} />
              </Tabs.Panel>
              <Tabs.Panel value="appearance" className={styles.scrollArea}>
                <AppearanceTab />
              </Tabs.Panel>
              <Tabs.Panel value="voice" className={styles.scrollArea}>
                <DevicesTab />
              </Tabs.Panel>
              <Tabs.Panel value="blocked" className={styles.scrollArea}>
                <BlockedTab />
              </Tabs.Panel>
            </div>
          </Tabs.Root>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
