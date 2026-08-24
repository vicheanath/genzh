import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View, type ViewStyle } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

// Android opts out of layout animation unless it is switched on explicitly.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
 * The open/close is a `LayoutAnimation` rather than a measured height: the
 * panels here hold lists whose length is not knowable ahead of time, and
 * animating a hardcoded max-height either clips them or jumps.
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

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (controlledOpen === undefined) setUncontrolledOpen(!open);
    onOpenChange?.(!open);
  };

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View style={style}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={styles.trigger}
        >
          <Chevron size={section ? 12 : 16} color={Colors.textSubtle} />
          <Text style={[styles.title, section && styles.sectionTitle]} numberOfLines={1}>
            {title}
          </Text>
        </Pressable>
        {adornment}
      </View>

      {open ? <View style={styles.panel}>{children}</View> : null}
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
    paddingTop: Spacing.xs,
  },
});
