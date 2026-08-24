import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Flame, Play, RotateCcw, Send, Timer, Users, Vote, Zap } from 'lucide-react-native';
import type { RoomWithPermissions } from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { useExp, postToChat } from './shared';

interface DebatePoint {
  id: string;
  side: 'pro' | 'con';
  authorName: string;
  text: string;
  votes: number;
}


const TURN_SECONDS = 60;

/** A two-sided debate: a vote meter, a speaker clock, and a claims board. */
export function DebateExperience({ room }: { room: RoomWithPermissions }) {
  const styles = useThemedStyles(makeStyles);
  const exp = useExp();
  const c = useColors();
  const { user, getToken } = useAuth();
  const toast = useToast();

  const [proVotes, setProVotes] = useState(14);
  const [conVotes, setConVotes] = useState(9);
  const [userVote, setUserVote] = useState<'pro' | 'con' | null>(null);

  const [timerSeconds, setTimerSeconds] = useState(TURN_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [activeSide, setActiveSide] = useState<'pro' | 'con'>('pro');

  const [points, setPoints] = useState<DebatePoint[]>([]);
  const [newPoint, setNewPoint] = useState('');
  const [pointSide, setPointSide] = useState<'pro' | 'con'>('pro');

  // The interval is held in a ref so a re-render caused by the tick cannot
  // schedule a second one alongside it.
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!timerActive) return;

    tick.current = setInterval(() => {
      setTimerSeconds((seconds) => {
        if (seconds <= 1) {
          setTimerActive(false);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    };
  }, [timerActive]);

  const total = proVotes + conVotes || 1;
  const proPercent = Math.round((proVotes / total) * 100);
  const conPercent = 100 - proPercent;
  const topic = room.topic || room.name;

  async function shareStandings() {
    try {
      await postToChat(
        room,
        await getToken(),
        `🔥 LIVE DEBATE STANDINGS\n📌 Motion: “${topic}”\n\n🟢 PRO: ${proPercent}% (${proVotes})\n🔴 CON: ${conPercent}% (${conVotes})`,
      );
      toast.success('Debate standings posted to chat');
    } catch {
      toast.error('Could not post to chat');
    }
  }

  function vote(side: 'pro' | 'con') {
    if (userVote === side) return;

    if (userVote === 'pro') setProVotes((votes) => Math.max(0, votes - 1));
    if (userVote === 'con') setConVotes((votes) => Math.max(0, votes - 1));
    if (side === 'pro') setProVotes((votes) => votes + 1);
    else setConVotes((votes) => votes + 1);

    setUserVote(side);
  }

  function addPoint() {
    if (!newPoint.trim()) return;

    setPoints((current) => [
      {
        id: String(Date.now()),
        side: pointSide,
        authorName: user?.profile.display_name ?? 'Anonymous',
        text: newPoint.trim(),
        votes: 1,
      },
      ...current,
    ]);
    setNewPoint('');
  }

  return (
    <ScrollView contentContainerStyle={exp.content} keyboardShouldPersistTaps="handled">
      <View style={exp.card}>
        <View style={exp.cardHeader}>
          <View style={exp.tag}>
            <Flame size={13} color={c.accent} />
            <Text style={exp.tagText}>Live two-sided debate</Text>
          </View>
          <View style={exp.row}>
            <Users size={12} color={c.textDim} />
            <Text style={styles.meta}>{total} votes</Text>
          </View>
        </View>

        <Text style={exp.title}>{topic}</Text>

        <View style={styles.labels}>
          <Text style={styles.proLabel}>
            PRO · {proPercent}% ({proVotes})
          </Text>
          <Text style={styles.conLabel}>
            CON · {conPercent}% ({conVotes})
          </Text>
        </View>

        {/* A tug-of-war rather than two bars: the whole point is that one side
            gains exactly what the other loses. */}
        <View style={styles.tug}>
          <View style={[styles.proFill, { flex: Math.max(proPercent, 1) }]} />
          <View style={[styles.conFill, { flex: Math.max(conPercent, 1) }]} />
        </View>

        <View style={exp.row}>
          <Button
            title={`Vote PRO (${proVotes})`}
            size="sm"
            variant={userVote === 'pro' ? 'primary' : 'secondary'}
            style={exp.grow}
            onPress={() => vote('pro')}
            // No colour: the button tints its own icon, so the glyph follows
            // whichever variant the vote put it in.
            icon={<Vote size={14} />}
          />
          <Button
            title={`Vote CON (${conVotes})`}
            size="sm"
            variant={userVote === 'con' ? 'danger' : 'secondary'}
            style={exp.grow}
            onPress={() => vote('con')}
            icon={<Vote size={14} />}
          />
        </View>

        <Button
          title="Share standings to chat"
          size="sm"
          variant="ghost"
          onPress={() => void shareStandings()}
          icon={<Send size={13} color={c.textMuted} />}
        />
      </View>

      <View style={exp.card}>
        <View style={exp.cardHeader}>
          <View style={exp.row}>
            <Timer size={15} color={c.textMuted} />
            <Text style={styles.cardLabel}>Speaker turn clock</Text>
          </View>
          <Badge
            text={`Side ${activeSide.toUpperCase()}`}
            tone={activeSide === 'pro' ? 'mint' : 'danger'}
          />
        </View>

        <Text style={exp.timer}>
          {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
        </Text>

        <View style={exp.row}>
          <Button
            title={timerActive ? 'Pause' : 'Start'}
            size="sm"
            variant={timerActive ? 'secondary' : 'primary'}
            style={exp.grow}
            onPress={() => setTimerActive((active) => !active)}
            icon={
              <Play size={13} color={timerActive ? c.text : c.accentContrast} />
            }
          />
          <Button
            title="Reset"
            size="sm"
            variant="ghost"
            onPress={() => {
              setTimerActive(false);
              setTimerSeconds(TURN_SECONDS);
            }}
            icon={<RotateCcw size={13} color={c.textMuted} />}
          />
          <Button
            title="Switch"
            size="sm"
            variant="ghost"
            onPress={() => {
              setActiveSide((side) => (side === 'pro' ? 'con' : 'pro'));
              setTimerSeconds(TURN_SECONDS);
            }}
            icon={<Zap size={13} color={c.textMuted} />}
          />
        </View>
      </View>

      <Text style={exp.sectionTitle}>Key claims — {points.length}</Text>

      <View style={exp.card}>
        <View style={exp.row}>
          <Pressable
            onPress={() => setPointSide('pro')}
            style={[exp.chip, exp.grow, pointSide === 'pro' && styles.proChipActive]}
          >
            <Text style={[exp.chipText, pointSide === 'pro' && styles.proChipText]}>
              Side PRO
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPointSide('con')}
            style={[exp.chip, exp.grow, pointSide === 'con' && styles.conChipActive]}
          >
            <Text style={[exp.chipText, pointSide === 'con' && styles.conChipText]}>
              Side CON
            </Text>
          </Pressable>
        </View>

        <Input
          value={newPoint}
          onChangeText={setNewPoint}
          placeholder={`A concise argument for ${pointSide.toUpperCase()}…`}
          maxLength={200}
          multiline
        />
        <Button title="Post claim" onPress={addPoint} disabled={!newPoint.trim()} />
      </View>

      {points.length === 0 ? (
        <EmptyState
          icon={<Zap size={28} color={c.textSubtle} />}
          title="No claims yet"
          description="Post the first claim for either side to open the debate."
        />
      ) : null}

      {points.map((point) => (
        <View
          key={point.id}
          style={[
            styles.point,
            point.side === 'pro' ? styles.proPoint : styles.conPoint,
          ]}
        >
          <View style={exp.cardHeader}>
            <View style={exp.row}>
              <Avatar name={point.authorName} size={22} />
              <Text style={styles.author}>{point.authorName}</Text>
            </View>
            <Badge
              text={point.side.toUpperCase()}
              tone={point.side === 'pro' ? 'mint' : 'danger'}
            />
          </View>

          <Text style={styles.pointText}>{point.text}</Text>

          <Pressable
            onPress={() =>
              setPoints((current) =>
                current.map((entry) =>
                  entry.id === point.id ? { ...entry, votes: entry.votes + 1 } : entry,
                ),
              )
            }
            style={styles.upvote}
          >
            <Flame size={13} color={c.accent} />
            <Text style={styles.upvoteText}>{point.votes} agree</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  meta: {
    color: c.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  cardLabel: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  proLabel: {
    color: c.live,
    fontSize: 12,
    fontWeight: '800',
  },
  conLabel: {
    color: c.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  tug: {
    flexDirection: 'row',
    height: 12,
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: c.surfaceActive,
  },
  proFill: {
    backgroundColor: c.live,
  },
  conFill: {
    backgroundColor: c.danger,
  },
  proChipActive: {
    borderColor: c.live,
    backgroundColor: c.liveSubtle,
  },
  proChipText: {
    color: c.live,
  },
  conChipActive: {
    borderColor: c.danger,
    backgroundColor: c.dangerSubtle,
  },
  conChipText: {
    color: c.danger,
  },
  point: {
    backgroundColor: c.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: c.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  proPoint: {
    borderLeftColor: c.live,
  },
  conPoint: {
    borderLeftColor: c.danger,
  },
  author: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pointText: {
    color: c.text,
    fontSize: 14,
    lineHeight: 20,
  },
  upvote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    backgroundColor: c.accentSubtle,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  upvoteText: {
    color: c.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
});
