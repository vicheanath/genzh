import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';

import { SPRING_PANEL } from '../theme/motion';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

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

interface Rect {
  offset: number;
  size: number;
}

/**
 * Tabs, in the three shapes this app actually has.
 *
 * The marker *slides* between tabs rather than cutting, which is the whole
 * reason each tab reports its own layout: the indicator is one view positioned
 * from measurements, springing to wherever the selection moved. Cutting leaves
 * the reader to work out which label changed; sliding shows them.
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
  const styles = useThemedStyles(makeStyles);
  const vertical = variant === 'rail';
  const [rects, setRects] = useState<Record<string, Rect>>({});

  const offset = useSharedValue(0);
  const size = useSharedValue(0);
  // The very first placement should not fly in from zero — it has no previous
  // position to travel from, so it is snapped instead of sprung.
  const placed = useRef(false);

  const measure = useCallback((key: string, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setRects((current) => {
      const next = vertical
        ? { offset: y, size: height }
        : { offset: x, size: width };
      const previous = current[key];
      if (previous && previous.offset === next.offset && previous.size === next.size) {
        return current;
      }
      return { ...current, [key]: next };
    });
    // `vertical` is stable for the lifetime of a given Tabs instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = rects[value];
  useEffect(() => {
    if (!active) return;

    if (!placed.current) {
      offset.value = active.offset;
      size.value = active.size;
      placed.current = true;
      return;
    }

    offset.value = withSpring(active.offset, SPRING_PANEL);
    size.value = withSpring(active.size, SPRING_PANEL);
  }, [active, offset, size]);

  const indicatorStyle = useAnimatedStyle(() =>
    vertical
      ? { transform: [{ translateY: offset.value }], height: size.value }
      : { transform: [{ translateX: offset.value }], width: size.value },
  );

  const list = (
    <View
      style={[
        vertical ? styles.rail : styles.row,
        variant === 'pill' && styles.pillRow,
        style,
      ]}
    >
      {/* Painted under the labels, so no tab needs a z-index of its own. */}
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            variant === 'line' && styles.lineIndicator,
            variant === 'pill' && styles.pillIndicator,
            vertical && styles.railIndicator,
            indicatorStyle,
          ]}
        />
      ) : null}

      {items.map((item) => {
        const selected = item.value === value;

        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onLayout={(event) => measure(item.value, event)}
            onPress={() => onValueChange(item.value)}
            style={[
              styles.tab,
              variant === 'line' && styles.lineTab,
              variant === 'pill' && styles.pillTab,
              vertical && styles.railTab,
            ]}
          >
            {item.icon}
            <Text
              style={[
                styles.label,
                selected && styles.labelActive,
                variant === 'pill' && selected && styles.pillLabelActive,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {item.badge ? (
              <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.badge > 99 ? '99+' : item.badge}
                </Text>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (scrollable && !vertical) {
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pillRow: {
    backgroundColor: c.surfaceMuted,
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
  indicator: {
    position: 'absolute',
  },
  lineIndicator: {
    bottom: 0,
    height: 2,
    borderRadius: Radius.full,
    backgroundColor: c.accent,
  },
  pillIndicator: {
    top: 4,
    bottom: 4,
    borderRadius: Radius.full,
    backgroundColor: c.accent,
  },
  railIndicator: {
    left: 0,
    width: 3,
    borderRadius: Radius.full,
    backgroundColor: c.accent,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lineTab: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  pillTab: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  railTab: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  label: {
    color: c.textSubtle,
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: {
    color: c.text,
  },
  pillLabelActive: {
    color: c.accentContrast,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
