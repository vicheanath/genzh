import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';

import { SPRING_PANEL, TIMING_BASE } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface CollapsibleProps {
  title: string;
  /** Sits at the trailing edge of the trigger — a count, an add button. */
  adornment?: React.ReactNode;
  /** Small caps heading, for a channel-list section. */
  section?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * A disclosure.
 *
 * The panel animates to its *measured* height rather than to a guess. These
 * panels hold lists whose length is not knowable ahead of time — a server's
 * channels, a role's permissions — so a hardcoded max-height either clips them
 * or leaves a gap, and `LayoutAnimation` (what this used before) cannot be
 * interrupted halfway or driven from the UI thread.
 *
 * One chevron rotates instead of two icons swapping, which is the difference
 * between a control that turns and one that flickers.
 */
export function Collapsible({
  title,
  adornment,
  section,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  style,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const contentHeight = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);

  const toggle = () => {
    const next = !open;
    progress.value = withSpring(next ? 1 : 0, SPRING_PANEL);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // Derived rather than set in an effect: the height follows the measurement
  // the moment it lands, so a panel whose content grows while open — a channel
  // list that just loaded — expands with it instead of clipping.
  const height = useDerivedValue(() => progress.value * contentHeight.value);

  const panelStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90 - 90}deg` }],
  }));

  return (
    <View style={style}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={styles.trigger}
        >
          <Animated.View style={chevronStyle}>
            <ChevronDown size={section ? 12 : 16} color={Colors.textSubtle} />
          </Animated.View>
          <Text style={[styles.title, section && styles.sectionTitle]} numberOfLines={1}>
            {title}
          </Text>
        </Pressable>
        {adornment}
      </View>

      <Animated.View style={[styles.panel, panelStyle]}>
        {/* Measured off-flow inside the clipping panel: the wrapper always has
            its natural height, and the panel above animates to it. */}
        <View
          style={styles.measure}
          onLayout={(event: LayoutChangeEvent) => {
            contentHeight.value = withTiming(event.nativeEvent.layout.height, TIMING_BASE);
          }}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  trigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  panel: {
    overflow: 'hidden',
  },
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: Spacing.xs,
  },
});
