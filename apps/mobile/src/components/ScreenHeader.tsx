import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Controls on the trailing edge. */
  actions?: React.ReactNode;
  /** Sits under the title row — a tab strip, a search field. */
  below?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * The bar at the top of a pushed screen.
 *
 * The stack navigator's own header is switched off app-wide, so this is what
 * every screen uses instead — one place that knows the back chevron's size, the
 * title's weight, and how a tab strip attaches underneath.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  actions,
  below,
  style,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={10}
            style={styles.back}
          >
            <ChevronLeft size={22} color={Colors.text} />
          </Pressable>
        ) : null}

        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
