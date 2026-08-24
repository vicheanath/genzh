import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AtSign } from 'lucide-react-native';
import type { MentionCandidate } from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Colors, Radius, Spacing } from '../../theme/tokens';

export interface MentionSuggestionsProps {
  candidates: MentionCandidate[];
  onPick: (candidate: MentionCandidate) => void;
}

/**
 * The `@` autocomplete.
 *
 * A phone has no arrow keys, so unlike the web list there is no highlighted row
 * and no roving selection — every row is a tap target, which is the whole
 * interaction. The ranking still comes from the shared `rankCandidates`, so the
 * order matches what a desktop would show.
 */
export function MentionSuggestions({ candidates, onPick }: MentionSuggestionsProps) {
  if (candidates.length === 0) return null;

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal={false}
        keyboardShouldPersistTaps="always"
        style={styles.scroll}
      >
        {candidates.map((candidate) => (
          <Pressable
            key={candidate.key}
            onPress={() => onPick(candidate)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            {candidate.everyone ? (
              <View style={styles.everyoneMark}>
                <AtSign size={16} color={Colors.accent} />
              </View>
            ) : (
              <Avatar
                name={candidate.name}
                url={candidate.avatarUrl}
                accent={candidate.accent}
                size={28}
                presence={candidate.online ? 'online' : 'offline'}
                ringColor={Colors.surfaceRaised}
              />
            )}

            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {candidate.name}
              </Text>
              <Text style={styles.detail} numberOfLines={1}>
                {candidate.detail ?? `@${candidate.handle}`}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.surfaceRaised,
    borderTopWidth: 1,
    borderColor: Colors.border,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: 210,
  },
  scroll: {
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  rowPressed: {
    backgroundColor: Colors.hover,
  },
  everyoneMark: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  detail: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
});
