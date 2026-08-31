import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArrowLeftIcon, SignOutIcon, XIcon } from '@/components/Icons'
import { Tabs } from '@/components/Tabs'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'

import { AccountTab } from './AccountTab'
import { AnonymousTab } from './AnonymousTab'
import { AppearanceTab } from './AppearanceTab'
import { BlockedTab } from './BlockedTab'
import { DevicesTab } from './DevicesTab'
import { LanguageTab } from './LanguageTab'
import { ProfileTab } from './ProfileTab'
import { SETTINGS_GROUPS, type SettingsTab } from './tabs'
import styles from './settings.module.css'

export type { SettingsTab }

interface UserSettingsModalProps {
  open: boolean
  /** A specific destination, or omitted for "just open settings". */
  initialTab?: SettingsTab | null
  onClose: () => void
}

/** The label for a tab id, for the mobile header. */
function labelOf(tab: SettingsTab): string {
  for (const group of SETTINGS_GROUPS) {
    const found = group.tabs.find((candidate) => candidate.id === tab)
    if (found) return found.label
  }
  return 'Settings'
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
 *
 * # Two shapes, one tree
 *
 * On a wide screen this is a sidebar beside a panel. On a phone it is a
 * *drill-down*: the menu fills the screen, tapping an entry slides to that
 * panel, and a back button returns. Both fall out of the same markup — only
 * `data-view` changes, and the stylesheet decides whether it means anything —
 * so the tab semantics, the focus order and the panel mounting behaviour are
 * identical on both, rather than being two implementations to keep agreeing.
 *
 * The previous attempt turned the sidebar into a horizontal strip under 768px.
 * It did not work: the two groups became two side-by-side columns, `margin-top:
 * auto` on the sign-out row stretched the strip to the full height of the
 * screen, and the panel it was supposed to be navigating was pushed off the
 * bottom entirely. A settings screen with no settings visible on it.
 */
export function UserSettingsModal({
  open,
  // No default. `undefined` here means "the caller did not name a tab", which
  // is what puts a phone on the menu rather than one level into it — defaulting
  // to `profile` would make every open look like a request for the profile tab.
  initialTab,
  onClose,
}: UserSettingsModalProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const storeTab = useAppStore((s) => s.userSettingsTab)
  const requested = initialTab ?? storeTab

  const [activeTab, setActiveTab] = useState<SettingsTab>(requested ?? 'profile')

  // Which half of the drill-down is showing. Meaningless above the breakpoint,
  // where both halves are on screen at once — the stylesheet simply ignores it
  // there, so there is no second layout rule in JavaScript to disagree with.
  const [showPanel, setShowPanel] = useState(requested != null)

  // Opening the modal returns to the tab the caller asked for; while it stays
  // open, the user's own navigation wins.
  useEffect(() => {
    if (!open) return
    setActiveTab(requested ?? 'profile')
    // Land on the menu when nobody named a destination, and go straight to the
    // panel when somebody did.
    setShowPanel(requested != null)
  }, [open, requested])

  if (!open || !user) return null

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.modal}>
          {/* Above both columns, so it is present whichever one is showing.
              Phone only — the desktop close button lives over the panel. */}
          <div className={styles.mobileBar}>
            {showPanel ? (
              <button
                type="button"
                className={styles.mobileBarButton}
                onClick={() => setShowPanel(false)}
                aria-label={t('settings.back')}
              >
                <ArrowLeftIcon size={18} />
              </button>
            ) : (
              // Holds the title centred whether or not there is a back button,
              // so it does not shift as you move between the two views.
              <span className={styles.mobileBarSpacer} aria-hidden />
            )}

            <BaseDialog.Title className={styles.mobileBarTitle}>
              {showPanel ? labelOf(activeTab) : t('settings.title')}
            </BaseDialog.Title>

            <button
              type="button"
              className={styles.mobileBarButton}
              onClick={onClose}
              aria-label={t('settings.close')}
            >
              <XIcon size={18} />
            </button>
          </div>

          <Tabs.Root
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as SettingsTab)
              // Only consulted under the breakpoint; harmless above it.
              setShowPanel(true)
            }}
            orientation="vertical"
            className={styles.tabsRoot}
            data-view={showPanel ? 'panel' : 'list'}
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
                  {t('auth.signOut')}
                </button>
              </div>
            </aside>

            <div className={styles.contentWrapper}>
              <div className={styles.closeButtonContainer}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={onClose}
                  aria-label={t('settings.close')}
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
              <Tabs.Panel value="language" className={styles.scrollArea}>
                <LanguageTab />
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
