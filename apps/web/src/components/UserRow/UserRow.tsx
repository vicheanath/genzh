import type { ReactNode } from 'react'

import { CosmeticBadge, CosmeticName, DecoratedAvatar } from '@/components/Cosmetics'
import type { EquippedCosmetics } from '@/features/rewards/api'
import type { Presence } from '@/components/PresenceDot'
import { cx } from '@/lib/cx'

import styles from './UserRow.module.css'

export interface UserRowProps {
  name: string
  avatarUrl?: string | null
  /** The user's chosen accent, for the avatar fallback and the tinted name. */
  accentColor?: string | null
  presence?: Presence
  /** The second line: a handle, a timestamp, a status. */
  secondary?: ReactNode
  /** Paint the name in the user's accent, as the member list does. */
  tintName?: boolean
  /**
   * What this person is wearing, if anything.
   *
   * Resolved rather than a user id, so this component stays presentational and
   * a caller decides where it came from — usually one batched `useCosmeticsFor`
   * for the whole list, not one request per row.
   */
  cosmetics?: EquippedCosmetics | null
  size?: 'sm' | 'md'
  /**
   * Makes the identity activate — usually opening a profile.
   *
   * Only the avatar and the text become a button, never the whole row: rows
   * carry their own buttons in `actions`, and nesting those inside a larger
   * button is invalid and swallows their clicks.
   */
  onSelect?: () => void
  /** Buttons on the trailing edge. */
  actions?: ReactNode
  className?: string
}

/**
 * A person, as a row: avatar, name, a second line, and optional actions.
 *
 * The most repeated shape in the app — the member list, all three friends
 * lists, and the blocked list each had their own copy, with their own class
 * names and their own idea of which parts were clickable. They had already
 * drifted: one made the whole row a click target, one only the text, and one
 * used a `<div>` with an `onClick` and no keyboard access at all.
 *
 * Presentational on purpose. It takes a name and a URL rather than a user id,
 * so a caller decides where the data comes from — a profile cache, a search
 * result, a notification — and this stays the same component.
 */
export function UserRow({
  name,
  avatarUrl,
  accentColor,
  presence,
  secondary,
  tintName,
  cosmetics,
  size = 'md',
  onSelect,
  actions,
  className,
}: UserRowProps) {
  const identity = (
    <>
      <DecoratedAvatar
        name={name}
        src={avatarUrl}
        color={accentColor}
        size={size}
        presence={presence}
        cosmetics={cosmetics}
      />
      <span className={styles.text}>
        <span className={styles.name}>
          {/* An equipped name colour outranks the accent: it is the thing the
              person spent points on, and the accent is what they get for free. */}
          <CosmeticName
            item={cosmetics?.name_color}
            fallbackColor={tintName ? accentColor : null}
          >
            {name}
          </CosmeticName>
          <CosmeticBadge item={cosmetics?.badge} />
        </span>
        {secondary !== undefined && <span className={styles.secondary}>{secondary}</span>}
      </span>
    </>
  )

  return (
    <div className={cx(styles.row, className)}>
      {onSelect ? (
        <button type="button" className={styles.identityButton} onClick={onSelect}>
          {identity}
        </button>
      ) : (
        <div className={styles.identity}>{identity}</div>
      )}

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
