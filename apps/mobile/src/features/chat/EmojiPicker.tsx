import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EMOJI } from '@genzh/shared';

import { Sheet } from '../../components/Sheet';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

export interface EmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (emoji: string) => void;
  title?: string;
}

/**
 * The emoji set, as a grid.
 *
 * The same list backs the composer and the reaction picker — they are the same
 * set by intent, and the shared `EMOJI` constant is what keeps them from
 * drifting the moment one of them gains a face.
 */
export function EmojiPicker({ open, onOpenChange, onPick, title }: EmojiPickerProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={styles.grid}>
        {EMOJI.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityLabel={emoji}
            onPress={() => {
              onPick(emoji);
              onOpenChange(false);
            }}
            style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  title: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  cell: {
    width: '16.66%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  cellPressed: {
    backgroundColor: c.hover,
  },
  emoji: {
    fontSize: 26,
  },
});
