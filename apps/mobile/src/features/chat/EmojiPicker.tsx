import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { EMOJI, type CustomEmoji } from '@genzh/shared';

import { Sheet } from '../../components/Sheet';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

export interface EmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Receives a unicode emoji, or a `:shortcode:` for a custom one.
   *
   * One callback for both: the composer inserts the string into the draft and
   * the reaction path sends it as a key, and the server takes either in the
   * same field — so nothing downstream needs to know which was picked.
   */
  onPick: (emoji: string) => void;
  /** This room's custom emoji. Empty for a room outside any community. */
  custom?: readonly CustomEmoji[];
  title?: string;
}

/**
 * The emoji set, as a grid.
 *
 * The same list backs the composer and the reaction picker — they are the same
 * set by intent, and the shared `EMOJI` constant is what keeps them from
 * drifting the moment one of them gains a face.
 */
export function EmojiPicker({
  open,
  onOpenChange,
  onPick,
  custom,
  title,
}: EmojiPickerProps) {
  const styles = useThemedStyles(makeStyles);

  const pick = (value: string) => {
    onPick(value);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      {/* A community's own glyphs go above the unicode set: they are what
          people opened this for, and the standard grid is the same everywhere
          and can be scrolled to. */}
      {custom && custom.length > 0 ? (
        <>
          <Text style={styles.title}>This community</Text>
          <View style={styles.grid}>
            {custom.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityLabel={`:${entry.name}:`}
                onPress={() => pick(`:${entry.name}:`)}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              >
                <Image
                  source={{ uri: entry.image_url }}
                  style={styles.customImage}
                  resizeMode="contain"
                />
              </Pressable>
            ))}
          </View>
          <Text style={styles.title}>Standard</Text>
        </>
      ) : null}

      <View style={styles.grid}>
        {EMOJI.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityLabel={emoji}
            onPress={() => pick(emoji)}
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
  /* Contained rather than stretched: custom emoji come at whatever aspect
     ratio their author had, and a squashed blob is worse than a small one. */
  customImage: {
    width: '72%',
    height: '72%',
  },
});
