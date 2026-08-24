import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** A count beside the label — pending requests, unread rows. */
  badge?: number;
}

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<TabItem<T>>;
  /**
   * `line` — an underline beneath a horizontal strip, for tabs within a panel.
   * `pill` — a filled lozenge behind the active tab, for segmented controls.
   * `rail` — a vertical column of destinations, marker on the leading edge.
   */
  variant?: 'line' | 'pill' | 'rail';
  /** Let a long strip scroll sideways rather than squeezing every label. */
  scrollable?: boolean;
  style?: ViewStyle;
}

/**
 * Tabs, in the three shapes this app actually has.
 *
 * Generic over the value so `onValueChange` hands back the union type rather
 * than a bare string — the compiler then catches a stale tab id at the call
 * site instead of at runtime.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  variant = 'line',
  scrollable,
  style,
}: TabsProps<T>) {
  const list = (
    <View style={[variant === 'rail' ? styles.rail : styles.row, variant === 'pill' && styles.pillRow, style]}>
      {items.map((item) => {
        const active = item.value === value;

        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onValueChange(item.value)}
            style={[
              styles.tab,
              variant === 'line' && styles.lineTab,
              variant === 'line' && active && styles.lineTabActive,
              variant === 'pill' && styles.pillTab,
              variant === 'pill' && active && styles.pillTabActive,
              variant === 'rail' && styles.railTab,
              variant === 'rail' && active && styles.railTabActive,
            ]}
          >
            {item.icon}
            <Text
              style={[
                styles.label,
                active && styles.labelActive,
                variant === 'pill' && active && styles.pillLabelActive,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {item.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (scrollable && variant !== 'rail') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {list}
      </ScrollView>
    );
  }

  return list;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pillRow: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.full,
    padding: 4,
    gap: 4,
  },
  rail: {
    gap: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lineTab: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  lineTabActive: {
    borderBottomColor: Colors.accent,
  },
  pillTab: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  pillTabActive: {
    backgroundColor: Colors.accent,
  },
  railTab: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  railTabActive: {
    backgroundColor: Colors.surfaceHover,
    borderLeftColor: Colors.accent,
  },
  label: {
    color: Colors.textSubtle,
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: {
    color: Colors.text,
  },
  pillLabelActive: {
    color: Colors.accentContrast,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
