import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { StoreItem } from '@genzh/shared';

import { Radius, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { itemGlyph, itemTint, rarityTone } from './cosmetics';

/**
 * What one cosmetic looks like, at whatever size the caller has room for.
 *
 * Three surfaces draw an item — the catalog tile, the owned grid, the studio
 * row — and each of them used to draw a hardcoded ✨ in a grey square, which
 * made a page of legendary frames indistinguishable from a page of common
 * badges.
 *
 * There are three things to draw, in order of how much the server has actually
 * said: the artwork if the item has any, the colour it names in `style_config`
 * if it does not, and its slot's glyph if it names nothing. The rarity tint
 * sits behind all three, so a tile reads as rare before any of its text does.
 */
export function ItemPreview({
  item,
  size = 96,
  style,
}: {
  item: StoreItem;
  size?: number;
  style?: ViewStyle;
}) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();

  const rarity = rarityTone(item.rarity, c);
  const tint = itemTint(item);

  return (
    <View
      style={[
        styles.frame,
        {
          height: size,
          borderRadius: size >= 72 ? Radius.lg : Radius.md,
          backgroundColor: rarity.tint,
          borderColor: rarity.edge,
        },
        style,
      ]}
    >
      {item.asset_url ? (
        <Image
          source={{ uri: item.asset_url }}
          style={styles.art}
          resizeMode="contain"
          accessibilityLabel={item.name}
        />
      ) : tint ? (
        // A name colour or a chat bubble is a colour and nothing else, so the
        // swatch *is* the preview rather than an icon standing in for one.
        <View
          style={[
            styles.swatch,
            { backgroundColor: tint, width: size * 0.44, height: size * 0.44 },
          ]}
        />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.42) }}>{itemGlyph(item)}</Text>
      )}
    </View>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    frame: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      overflow: 'hidden',
    },
    art: {
      width: '78%',
      height: '78%',
    },
    swatch: {
      borderRadius: Radius.full,
    },
  });
