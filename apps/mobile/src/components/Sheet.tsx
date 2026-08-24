import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which edge it comes from.
   *
   * `bottom` for something you glance at and dismiss — it lands next to the
   * thumb rather than across the whole screen. `start` for navigation, which is
   * where a back-and-forth between places belongs.
   */
  side?: 'bottom' | 'start';
  /** Cap the panel's height, as a fraction of the screen. Bottom sheets only. */
  maxHeightRatio?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

const SCREEN = Dimensions.get('window');

/**
 * A panel that slides in from an edge.
 *
 * The web app builds this on its Dialog primitive because it *is* a modal —
 * same focus trap, same scrim, same Escape. Here `Modal` supplies the equivalent
 * (it captures the Android back button), so what is left is the entrance, which
 * is a transform.
 */
export function Sheet({
  open,
  onOpenChange,
  side = 'bottom',
  maxHeightRatio = 0.9,
  children,
  style,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: side === 'bottom' ? [SCREEN.height * 0.5, 0] : [-SCREEN.width * 0.85, 0],
  });

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <View style={styles.root}>
        {/* The scrim closes on tap, which is the gesture people reach for
            before they look for a close button. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} />

        <Animated.View
          style={[
            side === 'bottom' ? styles.bottom : styles.start,
            side === 'bottom'
              ? {
                  maxHeight: SCREEN.height * maxHeightRatio,
                  paddingBottom: Math.max(insets.bottom, Spacing.lg),
                }
              : { paddingTop: insets.top, paddingBottom: insets.bottom },
            { transform: [{ translateX: side === 'start' ? translate : 0 }, { translateY: side === 'bottom' ? translate : 0 }] },
            style,
          ]}
        >
          {side === 'bottom' && <View style={styles.grabber} />}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    justifyContent: 'flex-end',
  },
  bottom: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  start: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '85%',
    maxWidth: 340,
    backgroundColor: Colors.sunken,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.borderStrong,
    marginBottom: Spacing.sm,
  },
});
