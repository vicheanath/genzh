import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Megaphone, TriangleAlert, X } from 'lucide-react-native';
import { useActiveBroadcastsQuery, type SystemBroadcast } from '@genzh/shared';

import { Radius, Spacing, type ElevationSet, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

/**
 * How loud each level is, as colour rather than as an adjective.
 *
 * `info` borrows the accent, which is what the rest of the app uses to mean
 * "the system is telling you something". The other two are the status colours —
 * a warning and a failure look the same here as they do in a `Callout`, because
 * a reader should not have to learn a second vocabulary for the banner.
 */
function toneFor(level: string, c: Palette) {
  switch (level) {
    case 'danger':
      return { fill: c.dangerSubtle, ink: c.danger, edge: c.danger, Icon: TriangleAlert };
    case 'warning':
      return {
        fill: 'rgba(250, 173, 20, 0.16)',
        ink: c.warning,
        edge: c.warning,
        Icon: TriangleAlert,
      };
    default:
      return { fill: c.accentSubtle, ink: c.accentText, edge: c.accent, Icon: Megaphone };
  }
}

/**
 * Platform announcements, above everything.
 *
 * The web app has carried this in its shell since the console could send one;
 * the phone could not, so planned downtime and incident notices reached every
 * client except the one people actually hold.
 *
 * Where the web puts a full-width band in the layout, this floats as a card
 * over it. That is not decoration — a band above the navigator would push every
 * screen down and leave each of them paying the status-bar inset twice, and a
 * broadcast is a transient thing that should not reflow the app it interrupts.
 * Floating also lets it come and go without anything underneath moving.
 *
 * One at a time, newest first. Two stacked banners is the point at which people
 * stop reading either, and the console's list is already ordered, so the first
 * one is the one that matters.
 */
export function GlobalBroadcastBanner() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const broadcasts = useActiveBroadcastsQuery();

  /*
   * Dismissal is per-session and in memory on purpose.
   *
   * Persisting it would mean a banner somebody swiped away during a five-minute
   * outage stays gone through the next one, and ids never repeat — so the store
   * would only ever grow. Being told again after a relaunch that the platform
   * is degraded is the correct behaviour, not a bug.
   */
  const [dismissed, setDismissed] = useState<Record<string, true>>({});

  const item: SystemBroadcast | undefined = (broadcasts.data ?? []).find(
    (broadcast) => !dismissed[broadcast.id],
  );

  if (!item) return null;

  const { fill, ink, edge, Icon } = toneFor(item.level, c);

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(160)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { backgroundColor: fill, borderColor: edge, top: insets.top + Spacing.sm },
      ]}
    >
      <Icon size={16} color={ink} />

      <View style={styles.text}>
        <Text style={[styles.title, { color: ink }]} numberOfLines={1}>
          {item.title}
        </Text>
        {/* Two lines, not one: a broadcast is usually a sentence about what is
            happening and a second about what to do, and one line reliably cuts
            the half that tells the reader what to do. */}
        <Text style={[styles.message, { color: ink }]} numberOfLines={2}>
          {item.message}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss announcement"
        hitSlop={12}
        onPress={() => setDismissed((prev) => ({ ...prev, [item.id]: true }))}
        style={styles.dismiss}
      >
        <X size={15} color={ink} />
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (_c: Palette, elevation: ElevationSet) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      left: Spacing.md,
      right: Spacing.md,
      // Above every screen, and above the floating call bubble too: an outage
      // notice outranks a shortcut back into a call.
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      ...elevation.md,
    },
    text: {
      flex: 1,
      gap: 1,
    },
    title: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    message: {
      fontSize: 12,
      lineHeight: 17,
      opacity: 0.9,
    },
    dismiss: {
      width: 24,
      height: 24,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -2,
    },
  });
