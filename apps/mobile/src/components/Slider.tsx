import React, { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Fired once at the end of a drag — for settings that hit the network. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  /** Renders the current value beside the label. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  style?: ViewStyle;
}

const THUMB = 20;

/** A single-value slider with an optional label and live value readout. */
export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  disabled,
  style,
}: SliderProps) {
  const [width, setWidth] = useState(0);

  // The drag handlers are installed once, so they close over the first render's
  // props. These refs are what keeps them reading current values.
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  const changeRef = useRef(onValueChange);
  const commitRef = useRef(onValueCommit);
  valueRef.current = value;
  changeRef.current = onValueChange;
  commitRef.current = onValueCommit;

  const quantize = (raw: number) => {
    const clamped = Math.min(max, Math.max(min, raw));
    const stepped = Math.round((clamped - min) / step) * step + min;
    // Steps like 0.1 accumulate float error; rounding to the step's own
    // precision keeps 0.30000000000000004 out of the readout.
    const decimals = (String(step).split('.')[1] ?? '').length;
    return Number(stepped.toFixed(decimals));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const track = widthRef.current;
        if (track <= 0) return;
        changeRef.current(quantizeAt(event.nativeEvent.locationX, track));
      },
      onPanResponderMove: (event) => {
        const track = widthRef.current;
        if (track <= 0) return;
        changeRef.current(quantizeAt(event.nativeEvent.locationX, track));
      },
      onPanResponderRelease: () => {
        commitRef.current?.(valueRef.current);
      },
    }),
  ).current;

  function quantizeAt(x: number, track: number) {
    return quantize(min + (Math.min(track, Math.max(0, x)) / track) * (max - min));
  }

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const fill = Math.min(1, Math.max(0, ratio));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  };

  return (
    <View style={[styles.root, disabled && styles.disabled, style]}>
      {label !== undefined && (
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{formatValue ? formatValue(value) : String(value)}</Text>
        </View>
      )}

      <View
        style={styles.control}
        onLayout={onLayout}
        {...(disabled ? {} : responder.panHandlers)}
      >
        <View style={styles.track}>
          <View style={[styles.indicator, { width: `${fill * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            { left: Math.max(0, fill * width - THUMB / 2) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  control: {
    height: THUMB + 12,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceActive,
    overflow: 'hidden',
  },
  indicator: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  disabled: {
    opacity: 0.5,
  },
});
