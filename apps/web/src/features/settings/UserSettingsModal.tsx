import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useState } from 'react'

import { SignOutIcon, XIcon } from '@/components/Icons'
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
 * whether or not you looked at them.
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
          <aside className={styles.sidebar}>
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.heading} className={styles.sidebarGroup}>
                <div className={styles.sidebarHeading}>{group.heading}</div>
                {group.tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={cx(
                      styles.navButton,
                      activeTab === id && styles.navButtonActive,
                    )}
                    onClick={() => setActiveTab(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            ))}

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

            {/* Keyed so switching tabs remounts rather than carrying one tab's
                draft state into the next. */}
            <div className={styles.scrollArea} key={activeTab}>
              {activeTab === 'profile' && <ProfileTab user={user} />}
              {activeTab === 'anonymous' && <AnonymousTab user={user} />}
              {activeTab === 'account' && <AccountTab user={user} />}
              {activeTab === 'appearance' && <AppearanceTab />}
              {activeTab === 'voice' && <DevicesTab />}
              {activeTab === 'blocked' && <BlockedTab />}
            </div>
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
