import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Colors, Radius } from '../theme/tokens';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB = 20;

/** An on/off toggle. Controlled via `checked` / `onCheckedChange`. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  style,
  accessibilityLabel,
}: SwitchProps) {
  const progress = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: checked ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [checked, progress]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={8}
      style={[disabled && styles.disabled, style]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [Colors.surfaceActive, Colors.accent],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: checked ? Colors.accentContrast : Colors.textMuted,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, TRACK_WIDTH - THUMB - 6],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: Radius.full,
    padding: 3,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.full,
  },
  disabled: {
    opacity: 0.5,
  },
});
