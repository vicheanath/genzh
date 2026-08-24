import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lock, Plus, Send, Shuffle, Sparkles } from 'lucide-react-native';
import type { RoomWithPermissions } from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Colors, Radius, Spacing } from '../../theme/tokens';

import { exp, postToChat } from './shared';

type Theme = 'midnight' | 'sunset' | 'cyber' | 'rose' | 'emerald';

interface Confession {
  id: string;
  alias: string;
  text: string;
  tag: string;
  theme: Theme;
  createdAt: string;
  reactions: Record<string, number>;
}

/**
 * The card backgrounds.
 *
 * The web version uses CSS gradients; React Native has no gradient without a
 * native module, so each theme is the gradient's darker stop with its lighter
 * one as the border — the same palette, drawn with what is available.
 */
const THEMES: Array<{ key: Theme; label: string; bg: string; edge: string }> = [
  { key: 'midnight', label: '🌌 Midnight', bg: '#1e1b4b', edge: '#312e81' },
  { key: 'sunset', label: '🌅 Sunset', bg: '#831843', edge: '#9a3412' },
  { key: 'cyber', label: '⚡ Cyber', bg: '#064e3b', edge: '#0f766e' },
  { key: 'rose', label: '🌸 Velvet', bg: '#4c0519', edge: '#881337' },
  { key: 'emerald', label: '✨ Neon dream', bg: '#1e293b', edge: '#0f172a' },
];

const TAGS = [
  '🤫 Secret',
  '🔥 Spicy',
  '💀 Regret',
  '☕ Spill the tea',
  '🌌 3 AM thought',
  '❤️ Secret crush',
];

const REACTIONS = ['🔥', '💀', '😱', '☕', '❤️', '🤐'];

const INITIAL_CONFESSIONS: Confession[] = [
  {
    id: 'conf-1',
    alias: 'MysticFox#4912',
    text: 'I pretend to be in deep focus when my manager calls, but I am literally just watching mechanical keyboard build ASMR.',
    tag: '💀 Regret',
    theme: 'midnight',
    createdAt: '12m ago',
    reactions: { '💀': 14, '😂': 8, '☕': 3 },
  },
  {
    id: 'conf-2',
    alias: 'NeonGhost#8102',
    text: 'I dropped a production database in my first week at a previous startup and fixed it in six minutes before anyone noticed.',
    tag: '🔥 Spicy',
    theme: 'cyber',
    createdAt: '45m ago',
    reactions: { '😱': 18, '🔥': 12, '🤐': 9 },
  },
  {
    id: 'conf-3',
    alias: 'VelvetOtter#2239',
    text: 'I still listen to the Minecraft alpha soundtrack when studying because nothing else comes close to that peace.',
    tag: '🌌 3 AM thought',
    theme: 'rose',
    createdAt: '2h ago',
    reactions: { '❤️': 22, '✨': 15 },
  },
];

/** An anonymous confession wall, with a spotlight reveal. */
export function ConfessionExperience({ room }: { room: RoomWithPermissions }) {
  const { getToken } = useAuth();
  const toast = useToast();

  const [confessions, setConfessions] = useState<Confession[]>(INITIAL_CONFESSIONS);
  const [composeOpen, setComposeOpen] = useState(false);
  const [text, setText] = useState('');
  const [tag, setTag] = useState(TAGS[0] ?? '🤫 Secret');
  const [theme, setTheme] = useState<Theme>('midnight');
  const [spotlight, setSpotlight] = useState<Confession | null>(null);

  function add() {
    if (!text.trim()) return;

    const created: Confession = {
      id: `conf-${Date.now()}`,
      alias:
        room.anonymous_identity?.alias_name ??
        `AnonUser#${Math.floor(1000 + Math.random() * 9000)}`,
      text: text.trim(),
      tag,
      theme,
      createdAt: 'Just now',
      reactions: { '🔥': 1 },
    };

    setConfessions((current) => [created, ...current]);
    setText('');
    setComposeOpen(false);
  }

  function react(id: string, emoji: string) {
    setConfessions((current) =>
      current.map((entry) =>
        entry.id === id
          ? { ...entry, reactions: { ...entry.reactions, [emoji]: (entry.reactions[emoji] ?? 0) + 1 } }
          : entry,
      ),
    );
    setSpotlight((current) =>
      current && current.id === id
        ? {
            ...current,
            reactions: { ...current.reactions, [emoji]: (current.reactions[emoji] ?? 0) + 1 },
          }
        : current,
    );
  }

  async function share(confession: Confession) {
    try {
      await postToChat(
        room,
        await getToken(),
        `🤫 CONFESSION · ${confession.tag}\n“${confession.text}”\n— ${confession.alias}`,
      );
      toast.success('Posted to chat');
    } catch {
      toast.error('Could not post to chat');
    }
  }

  return (
    <ScrollView contentContainerStyle={exp.content} keyboardShouldPersistTaps="handled">
      <View style={exp.cardHeader}>
        <View style={exp.tag}>
          <Lock size={13} color={Colors.accent} />
          <Text style={exp.tagText}>Confession wall</Text>
        </View>
        <Button
          title=""
          size="sm"
          variant="secondary"
          onPress={() => {
            if (confessions.length === 0) return;
            setSpotlight(confessions[Math.floor(Math.random() * confessions.length)] ?? null);
          }}
          icon={<Shuffle size={15} color={Colors.text} />}
        />
      </View>

      <Text style={exp.subtitle}>{room.topic || room.name}</Text>

      {composeOpen ? (
        <View style={exp.card}>
          <View style={exp.row}>
            <Sparkles size={15} color={Colors.accent} />
            <Text style={styles.composeTitle}>Drop an anonymous truth card</Text>
          </View>

          <Input
            value={text}
            onChangeText={setText}
            placeholder="Write your secret… real profiles are masked and untraceable."
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <Text style={exp.sectionTitle}>Mood tag</Text>
          <View style={exp.chipRow}>
            {TAGS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setTag(option)}
                style={[exp.chip, tag === option && exp.chipActive]}
              >
                <Text style={[exp.chipText, tag === option && exp.chipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={exp.sectionTitle}>Card theme</Text>
          <View style={exp.chipRow}>
            {THEMES.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setTheme(option.key)}
                style={[
                  exp.chip,
                  { backgroundColor: option.bg, borderColor: option.edge },
                  theme === option.key && styles.themeActive,
                ]}
              >
                <Text style={styles.themeText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={exp.row}>
            <Button
              title="Cancel"
              variant="ghost"
              style={exp.grow}
              onPress={() => setComposeOpen(false)}
            />
            <Button
              title="Post anonymously"
              style={exp.grow}
              onPress={add}
              disabled={!text.trim()}
            />
          </View>
        </View>
      ) : (
        <Button
          title="Drop a confession"
          onPress={() => setComposeOpen(true)}
          icon={<Plus size={15} color={Colors.accentContrast} />}
        />
      )}

      {confessions.map((confession) => {
        const palette = THEMES.find((entry) => entry.key === confession.theme) ?? THEMES[0]!;

        return (
          <View
            key={confession.id}
            style={[styles.card, { backgroundColor: palette.bg, borderColor: palette.edge }]}
          >
            <View style={exp.cardHeader}>
              <Badge text={confession.tag} tone="accent" />
              <Text style={styles.alias}>{confession.createdAt}</Text>
            </View>

            <Text style={styles.text}>“{confession.text}”</Text>
            <Text style={styles.alias}>{confession.alias}</Text>

            <View style={styles.reactionRow}>
              {REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => react(confession.id, emoji)}
                  style={styles.reaction}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{confession.reactions[emoji] ?? 0}</Text>
                </Pressable>
              ))}

              <Pressable onPress={() => void share(confession)} style={styles.reaction}>
                <Send size={12} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        );
      })}

      <Modal
        visible={spotlight !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSpotlight(null)}
      >
        <View style={styles.spotlightBackdrop}>
          {spotlight ? (
            <View
              style={[
                styles.spotlightCard,
                {
                  backgroundColor:
                    THEMES.find((entry) => entry.key === spotlight.theme)?.bg ?? '#1e1b4b',
                },
              ]}
            >
              <Badge text={spotlight.tag} tone="accent" />
              <Text style={styles.spotlightText}>“{spotlight.text}”</Text>
              <Text style={styles.alias}>Posted by {spotlight.alias}</Text>

              <View style={styles.reactionRow}>
                {REACTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => react(spotlight.id, emoji)}
                    style={styles.reaction}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={styles.reactionCount}>{spotlight.reactions[emoji] ?? 0}</Text>
                  </Pressable>
                ))}
              </View>

              <Button title="Close reveal" variant="secondary" onPress={() => setSpotlight(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  composeTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  themeActive: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  themeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radius.xxl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  text: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  alias: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontSize: 11,
    fontWeight: '700',
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  spotlightBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  spotlightCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  spotlightText: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
});
