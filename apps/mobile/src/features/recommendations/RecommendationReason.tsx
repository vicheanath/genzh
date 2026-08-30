import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { explain, type Reason } from '@genzh/shared';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * The "why you're seeing this" line under a recommended card.
 *
 * Renders nothing when the server sent no reasons, rather than a placeholder.
 * An unexplained recommendation is better shown as an ordinary card than as one
 * with an empty justification under it — the gap invites the reader to wonder
 * what is missing.
 *
 * The sentence itself comes from the server through `explain`, which lives in
 * `@genzh/shared` for the reason this component exists at all: phrasing seven
 * kinds of reason is the logic that drifts the moment two clients each own a
 * copy, and this is the second client.
 */
export function RecommendationReason({ reasons }: { reasons: Reason[] }) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();

  const text = explain(reasons);
  if (!text) return null;

  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        <Sparkles size={10} color={c.accentText} />
      </View>
      {/* One line, ellipsised. A reason is a footnote: letting a long one wrap
          to three lines makes it the loudest thing on a card whose subject is
          the room. */}
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    mark: {
      width: 16,
      height: 16,
      borderRadius: Radius.full,
      backgroundColor: c.accentSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      color: c.textSubtle,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
  });
