import { useNavigate } from 'react-router-dom'

import { CosmeticBadge, CosmeticName, DecoratedAvatar } from '@/components/Cosmetics'
import { ChevronDownIcon, GemIcon, SignOutIcon } from '@/components/Icons'
import { useBalanceQuery, useEquippedQuery } from '@/features/api'
import { useAuth } from '@/lib/auth'
import { useAppStore } from '@/lib/store'
import { SETTINGS_TABS } from '@/features/settings'

import styles from './MobilePages.module.css'

/**
 * You, as a screen.
 *
 * The desktop user bar is a strip at the foot of the sidebar, which on a phone
 * is inside a drawer nobody opens to check their own name. This is the same
 * information given the room a tap deserves, and it is where the bottom bar's
 * profile tab lands.
 *
 * The settings themselves stay in the existing modal rather than being
 * duplicated as mobile screens: one implementation, opened at the right tab.
 *
 * The menu is rendered from `SETTINGS_TABS` for the same reason. It used to be
 * a second hand-written list here, and it had already drifted: "My Account" was
 * missing from it entirely, so on a phone there was no way to reach your own
 * e-mail and password from the screen named after your account.
 */
export function AccountRoute() {
  const { user, logout } = useAuth()
  const openUserSettings = useAppStore((s) => s.openUserSettings)
  const navigate = useNavigate()
  const worn = useEquippedQuery().data
  const balance = useBalanceQuery().data

  if (!user) return null

  return (
    <div className={styles.page}>
      <div className={styles.identityCard}>
        <DecoratedAvatar
          name={user.profile.display_name}
          src={user.profile.avatar_url}
          color={user.profile.accent_color}
          size="xl"
          presence="online"
          cosmetics={worn}
        />
        <div className={styles.identityText}>
          <h1 className={styles.identityName}>
            <CosmeticName item={worn?.name_color} fallbackColor={user.profile.accent_color}>
              {user.profile.display_name}
            </CosmeticName>
            <CosmeticBadge item={worn?.badge} />
          </h1>
          <p className={styles.identityHandle}>@{user.handle}</p>
          {user.profile.bio && <p className={styles.identityBio}>{user.profile.bio}</p>}
        </div>
      </div>

      <div className={styles.pageBody}>
        <nav className={styles.menu} aria-label="Rewards">
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => void navigate('/rewards')}
          >
            <span className={styles.menuIcon}>
              <GemIcon size={17} />
            </span>
            <span className={styles.menuText}>
              <span className={styles.menuLabel}>Rewards &amp; Store</span>
              <span className={styles.menuHint}>
                {balance
                  ? `${balance.balance.toLocaleString()} points${
                      balance.can_claim_daily ? ' · daily reward ready' : ''
                    }`
                  : 'Points, cosmetics and invites'}
              </span>
            </span>
            <ChevronDownIcon size={16} className={styles.menuChevron} />
          </button>
        </nav>

        <nav className={styles.menu} aria-label="Settings">
          {SETTINGS_TABS.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={styles.menuItem}
              onClick={() => openUserSettings(id)}
            >
              <span className={styles.menuIcon}>
                <Icon size={17} />
              </span>
              <span className={styles.menuText}>
                <span className={styles.menuLabel}>{label}</span>
                <span className={styles.menuHint}>{hint}</span>
              </span>
              <ChevronDownIcon size={16} className={styles.menuChevron} />
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={styles.signOut}
          onClick={() => {
            void logout()
            void navigate('/')
          }}
        >
          <SignOutIcon size={17} />
          Sign out
        </button>
      </div>
    </div>
  )
}
