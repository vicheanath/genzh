import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RotateCcw, Send, Shuffle, Sparkles, Timer, Zap } from 'lucide-react-native';
import type { RoomWithPermissions } from '@genzh/shared';

import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Colors, Radius, Spacing } from '../../theme/tokens';

import { exp, postToChat } from './shared';

const SESSION_SECONDS = 300;

const ICEBREAKERS = [
  'What is a skill you have that is completely useless in real life but you are proud of?',
  'If you could delete one social platform from existence forever, which one goes?',
  'What is the weirdest habit you formed during late-night coding or gaming sessions?',
  'If humans came with a warning label, what would yours say?',
  'What is your all-time favourite midnight snack on an all-nighter?',
  'Which film or game has a 10/10 soundtrack you still listen to?',
  'If you could become a world master at one skill overnight, what would it be?',
  'What is an unpopular opinion you hold about modern tech or AI?',
];

const BURST_EMOJI = ['⚡', '🔥', '❤️', '🚀', '💀', '🎉'];

/** Speed chat: a countdown, a rotating icebreaker, and reaction bursts. */
export function QuickChatExperience({ room }: { room: RoomWithPermissions }) {
  const { getToken } = useAuth();
  const toast = useToast();

  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [promptIndex, setPromptIndex] = useState(0);
  const [bursts, setBursts] = useState<Array<{ id: number; emoji: string; left: number }>>([]);

  useEffect(() => {
    // The session loops rather than ending: the point is a room that keeps
    // refreshing its prompt, not one that closes.
    const timer = setInterval(
      () => setSecondsLeft((seconds) => (seconds > 0 ? seconds - 1 : SESSION_SECONDS)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  function burst(emoji: string) {
    const item = { id: Date.now() + Math.random(), emoji, left: 10 + Math.random() * 70 };
    setBursts((current) => [...current, item]);
    setTimeout(
      () => setBursts((current) => current.filter((entry) => entry.id !== item.id)),
      1500,
    );
  }

  async function sharePrompt() {
    try {
      await postToChat(
        room,
        await getToken(),
        `💬 ICEBREAKER\n“${ICEBREAKERS[promptIndex]}”`,
      );
      toast.success('Prompt shared to chat');
    } catch {
      toast.error('Could not share prompt');
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <ScrollView contentContainerStyle={exp.content}>
      <View style={exp.cardHeader}>
        <View style={exp.tag}>
          <Zap size={13} color={Colors.accent} />
          <Text style={exp.tagText}>Ephemeral speed chat</Text>
        </View>

        <View style={exp.row}>
          <Timer size={13} color={secondsLeft < 60 ? Colors.danger : Colors.textMuted} />
          <Text style={[styles.clock, secondsLeft < 60 && styles.clockLow]}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </Text>
          <Button
            title=""
            size="sm"
            variant="ghost"
            onPress={() => setSecondsLeft(SESSION_SECONDS)}
            icon={<RotateCcw size={14} color={Colors.textMuted} />}
          />
        </View>
      </View>

      <View style={exp.card}>
        <View style={exp.cardHeader}>
          <View style={exp.row}>
            <Sparkles size={14} color={Colors.accent} />
            <Text style={styles.label}>Icebreaker prompt</Text>
          </View>
          <Button
            title="Spin"
            size="sm"
            variant="secondary"
            onPress={() => setPromptIndex((index) => (index + 1) % ICEBREAKERS.length)}
            icon={<Shuffle size={13} color={Colors.text} />}
          />
        </View>

        <Text style={styles.prompt}>“{ICEBREAKERS[promptIndex]}”</Text>

        <Button
          title="Share to chat"
          size="sm"
          variant="ghost"
          onPress={() => void sharePrompt()}
          icon={<Send size={13} color={Colors.textMuted} />}
        />
      </View>

      <Text style={exp.sectionTitle}>Drop live room energy</Text>

      <View style={exp.chipRow}>
        {BURST_EMOJI.map((emoji) => (
          <Pressable key={emoji} onPress={() => burst(emoji)} style={styles.burstButton}>
            <Text style={styles.burstEmoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      {/* The float layer sits over the card and ignores touches, so a burst in
          flight never blocks the button that launched it. */}
      <View pointerEvents="none" style={styles.burstLayer}>
        {bursts.map((item) => (
          <FloatingEmoji key={item.id} emoji={item.emoji} left={item.left} />
        ))}
      </View>
    </ScrollView>
  );
}

function FloatingEmoji({ emoji, left }: { emoji: string; left: number }) {
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 1400,
      useNativeDriver: true,
    }).start();
  }, [rise]);

  return (
    <Animated.Text
      style={[
        styles.floating,
        {
          left: `${left}%`,
          opacity: rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) },
            { scale: rise.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.3, 1] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  clock: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  clockLow: {
    color: Colors.danger,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  prompt: {
    color: Colors.text,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  burstButton: {
    width: 54,
    height: 54,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstEmoji: {
    fontSize: 24,
  },
  burstLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  floating: {
    position: 'absolute',
    bottom: 90,
    fontSize: 30,
  },
});
