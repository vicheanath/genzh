import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { TAB_BAR_HEIGHT, useBottomInset } from '../theme/layout';
import { SPRING_CONTROL, TIMING_FAST } from '../theme/motion';
import { Radius, type Palette, type ElevationSet } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

/**
 * The bottom tab bar.
 *
 * Written by hand rather than configured through `screenOptions`, because the
 * two things that make it feel like the rest of the app are both out of reach
 * from there: the accent wash that slides in behind the active icon, and a
 * colour that *crossfades* between states instead of cutting. React Navigation
 * hands its icon a plain colour string, so the active and inactive glyphs are
 * stacked and their opacity animated — the same effect CSS gives the web for
 * free in `MobileChrome.module.css`.
 *
 * Everything else still comes from each screen's `options`, so adding a tab is
 * a `tabBarIcon` and a `tabBarLabel` exactly as before.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useThemedStyles(makeStyles);
  const bottomInset = useBottomInset();

  return (
    <View
      style={[
        styles.bar,
        { height: TAB_BAR_HEIGHT + bottomInset, paddingBottom: bottomInset },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;

        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);

        function onPress() {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }

        return (
          <TabBarItem
            key={route.key}
            label={label}
            focused={focused}
            badge={options.tabBarBadge}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            renderIcon={(color) =>
              options.tabBarIcon?.({ focused, color, size: 22 }) ?? null
            }
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({ type: 'tabLongPress', target: route.key })
            }
          />
        );
      })}
    </View>
  );
}

/**
 * One tab.
 *
 * Its own component so it owns its own shared values — driving five tabs from
 * the bar would mean re-rendering all of them on every press.
 */
function TabBarItem({
  label,
  focused,
  badge,
  accessibilityLabel,
  renderIcon,
  onPress,
  onLongPress,
}: {
  label: string;
  focused: boolean;
  badge?: number | string;
  accessibilityLabel?: string;
  renderIcon: (color: string) => React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const active = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, TIMING_FAST);
  }, [focused, active]);

  // The wash behind the icon: rule 4 again — a pill, on a slab.
  const washStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: interpolate(active.value, [0, 1], [0.72, 1]) }],
  }));

  const slotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.12 }],
  }));

  const activeIconStyle = useAnimatedStyle(() => ({ opacity: active.value }));
  const idleIconStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(active.value, [0, 1], [c.textDim, c.accentText]),
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_CONTROL);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_CONTROL);
      }}
      style={styles.tab}
    >
      <Animated.View style={[styles.slot, slotStyle]}>
        <Animated.View style={[styles.wash, washStyle]} pointerEvents="none" />

        {/* Two copies of the glyph, crossfaded: an icon's colour is a prop, so
            this is the only way it can travel rather than switch. */}
        <Animated.View style={idleIconStyle}>{renderIcon(c.textDim)}</Animated.View>
        <Animated.View style={[styles.iconOverlay, activeIconStyle]}>
          {renderIcon(c.accent)}
        </Animated.View>

        {/* Anchored to the icon rather than the whole tab, so the count sits on
            the bell instead of floating over the label. */}
        {badge ? (
          <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {typeof badge === 'number' && badge > 9 ? '9+' : badge}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette, e: ElevationSet) =>
  StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
    ...e.bar,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingTop: 2,
  },
  slot: {
    width: 52,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wash: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.full,
    backgroundColor: c.accentSubtle,
  },
  // Stacked on the idle glyph, which is the one that sets the slot's size.
  iconOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    // A ring in the bar's own colour, so the badge reads as sitting on top of
    // the icon rather than merging with it.
    borderWidth: 2,
    borderColor: c.surface,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
