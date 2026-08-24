import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from './Sheet';
import { Separator } from './Separator';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** `danger` for anything destructive. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
  /** Draws a rule above this item, grouping what follows. */
  separated?: boolean;
}

export interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A heading above the items — usually what the menu acts on. */
  title?: string;
  items: MenuItem[];
}

/**
 * A list of actions, as a bottom sheet.
 *
 * The web app anchors a dropdown to its trigger. On a phone a sheet is the
 * right shape for the same thing: the items land under the thumb instead of
 * wherever the trigger happened to be, and the press target can be full-width.
 *
 * Selecting an item closes the menu before running the action, so a handler
 * that opens a dialog of its own does not fight this one for the screen.
 */
export function Menu({ open, onOpenChange, title, items }: MenuProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      <View style={styles.list}>
        {items.map((item) => (
          <React.Fragment key={item.key}>
            {item.separated ? <Separator style={styles.rule} /> : null}
            <Pressable
              accessibilityRole="menuitem"
              disabled={item.disabled}
              onPress={() => {
                onOpenChange(false);
                item.onPress();
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
                item.disabled && styles.disabled,
              ]}
            >
              {item.icon ? <View style={styles.icon}>{item.icon}</View> : null}
              <Text style={[styles.label, item.tone === 'danger' && styles.labelDanger]}>
                {item.label}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  itemPressed: {
    backgroundColor: Colors.hover,
  },
  icon: {
    width: 22,
    alignItems: 'center',
  },
  label: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  labelDanger: {
    color: Colors.danger,
  },
  rule: {
    marginVertical: Spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
});
