import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Avatar } from './Avatar';
import type { Presence } from './PresenceDot';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

export interface UserRowProps {
  name: string;
  avatarUrl?: string | null;
  /** The user's chosen accent, for the avatar fallback and the tinted name. */
  accentColor?: string | null;
  presence?: Presence;
  /** The second line: a handle, a timestamp, a status. */
  secondary?: React.ReactNode;
  /** Paint the name in the user's accent, as the member list does. */
  tintName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Makes the identity activate — usually opening a profile. */
  onSelect?: () => void;
  /** Buttons on the trailing edge. */
  actions?: React.ReactNode;
  style?: ViewStyle;
}

const AVATAR_SIZE = { sm: 30, md: 40, lg: 52 } as const;

/**
 * A person, as a row: avatar, name, a second line, and optional actions.
 *
 * The most repeated shape in the app — the member list, all three friends
 * lists, the blocked list and the DM list each grew their own copy on the web
 * before this existed, and they had already drifted on what was tappable.
 *
 * Presentational on purpose. It takes a name and a URL rather than a user id,
 * so a caller decides where the data comes from and this stays the same
 * component.
 */
export function UserRow({
  name,
  avatarUrl,
  accentColor,
  presence,
  secondary,
  tintName,
  size = 'md',
  onSelect,
  actions,
  style,
}: UserRowProps) {
  const styles = useThemedStyles(makeStyles);
  const identity = (
    <>
      <Avatar
        name={name}
        url={avatarUrl}
        accent={accentColor}
        size={AVATAR_SIZE[size]}
        presence={presence}
      />
      <View style={styles.text}>
        <Text
          style={[styles.name, tintName && accentColor ? { color: accentColor } : null]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {secondary !== undefined && secondary !== null ? (
          typeof secondary === 'string' ? (
            <Text style={styles.secondary} numberOfLines={1}>
              {secondary}
            </Text>
          ) : (
            secondary
          )
        ) : null}
      </View>
    </>
  );

  return (
    <View style={[styles.row, style]}>
      {onSelect ? (
        // Only the identity activates, never the whole row: rows carry their own
        // buttons in `actions`, and a press target wrapping those would swallow
        // them.
        <Pressable
          accessibilityRole="button"
          onPress={onSelect}
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
        >
          {identity}
        </Pressable>
      ) : (
        <View style={styles.identity}>{identity}</View>
      )}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
  },
  pressed: {
    backgroundColor: c.hover,
  },
  text: {
    flex: 1,
  },
  name: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  secondary: {
    color: c.textSubtle,
    fontSize: 12,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
