import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Plus, Send, Users, Vote, X } from 'lucide-react-native';
import type { RoomWithPermissions } from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Progress } from '../../components/Progress';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Colors, Radius, Spacing } from '../../theme/tokens';

import { exp, postToChat } from './shared';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  creatorName: string;
  userVotedOptionId?: string | null;
  isClosed?: boolean;
}

const INITIAL_POLLS: Poll[] = [
  {
    id: 'poll-1',
    question: 'What is the greatest programming language for high performance?',
    creatorName: 'Rustacean42',
    totalVotes: 32,
    options: [
      { id: 'opt-1', text: '🦀 Rust (Zero-cost abstractions)', votes: 19 },
      { id: 'opt-2', text: '⚡ C++ (Classic speed & fine control)', votes: 7 },
      { id: 'opt-3', text: '🏎️ Zig (Clean simplicity)', votes: 4 },
      { id: 'opt-4', text: '🐹 Go (Fast build & goroutines)', votes: 2 },
    ],
  },
  {
    id: 'poll-2',
    question: 'Best time to code without interruptions?',
    creatorName: 'NightOwl',
    totalVotes: 18,
    options: [
      { id: 'opt-2-1', text: '🌙 1:00 AM – 4:00 AM', votes: 12 },
      { id: 'opt-2-2', text: '☀️ 6:00 AM – 9:00 AM', votes: 4 },
      { id: 'opt-2-3', text: '☕ 2:00 PM – 5:00 PM', votes: 2 },
    ],
  },
];

/**
 * Live polls.
 *
 * Poll state is local to the session, exactly as it is on the web: the API has
 * no poll resource yet, so what the room shares is the *result*, posted into
 * the transcript where everyone can see it.
 */
export function PollExperience({ room }: { room: RoomWithPermissions }) {
  const { getToken } = useAuth();
  const toast = useToast();

  const [polls, setPolls] = useState<Poll[]>(INITIAL_POLLS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const poll = polls[activeIndex] ?? polls[0];

  async function shareResults() {
    if (!poll) return;

    const summary = poll.options
      .map((option) => {
        const pct = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
        return `• ${option.text} — ${pct}% (${option.votes})`;
      })
      .join('\n');

    try {
      await postToChat(
        room,
        await getToken(),
        `🗳️ LIVE POLL RESULTS\n❓ ${poll.question}\n${summary}\n\n📊 Total votes: ${poll.totalVotes}`,
      );
      toast.success('Poll results posted to chat');
    } catch {
      toast.error('Could not post poll to chat');
    }
  }

  function vote(pollId: string, optionId: string) {
    setPolls((current) =>
      current.map((entry) => {
        if (entry.id !== pollId || entry.isClosed) return entry;

        const previous = entry.userVotedOptionId;
        if (previous === optionId) return entry;

        return {
          ...entry,
          options: entry.options.map((option) => {
            let votes = option.votes;
            if (option.id === previous) votes = Math.max(0, votes - 1);
            if (option.id === optionId) votes += 1;
            return { ...option, votes };
          }),
          // Switching a vote does not add one; only a first vote does.
          totalVotes: entry.totalVotes + (previous ? 0 : 1),
          userVotedOptionId: optionId,
        };
      }),
    );
  }

  function createPoll() {
    const cleaned = options.map((option) => option.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) return;

    const created: Poll = {
      id: `poll-${Date.now()}`,
      question: question.trim(),
      creatorName: 'You',
      totalVotes: 0,
      options: cleaned.map((text, index) => ({ id: `o-${index}-${Date.now()}`, text, votes: 0 })),
    };

    setPolls((current) => [created, ...current]);
    setActiveIndex(0);
    setQuestion('');
    setOptions(['', '']);
    setCreateOpen(false);
    toast.success('Poll created');
  }

  return (
    <ScrollView contentContainerStyle={exp.content}>
      <View style={exp.cardHeader}>
        <View style={exp.tag}>
          <Vote size={13} color={Colors.accent} />
          <Text style={exp.tagText}>Live poll</Text>
        </View>
        <Button
          title="New poll"
          size="sm"
          variant="secondary"
          onPress={() => setCreateOpen(true)}
          icon={<Plus size={14} color={Colors.text} />}
        />
      </View>

      {polls.length > 1 ? (
        <View style={exp.chipRow}>
          {polls.map((entry, index) => (
            <Pressable
              key={entry.id}
              onPress={() => setActiveIndex(index)}
              style={[exp.chip, index === activeIndex && exp.chipActive]}
            >
              <Text
                style={[exp.chipText, index === activeIndex && exp.chipTextActive]}
                numberOfLines={1}
              >
                {entry.question.slice(0, 24)}
                {entry.question.length > 24 ? '…' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {poll ? (
        <View style={exp.card}>
          <Text style={exp.title}>{poll.question}</Text>

          <View style={exp.row}>
            <Users size={13} color={Colors.textDim} />
            <Text style={exp.subtitle}>
              {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'} · by {poll.creatorName}
            </Text>
            {poll.isClosed ? <Badge text="Closed" tone="danger" /> : null}
          </View>

          {poll.options.map((option) => {
            const pct = poll.totalVotes > 0 ? (option.votes / poll.totalVotes) * 100 : 0;
            const chosen = poll.userVotedOptionId === option.id;

            return (
              <Pressable
                key={option.id}
                disabled={poll.isClosed}
                onPress={() => vote(poll.id, option.id)}
                style={[styles.option, chosen && styles.optionChosen]}
              >
                <View style={styles.optionHead}>
                  <Text style={styles.optionText}>{option.text}</Text>
                  {chosen ? <CheckCircle2 size={15} color={Colors.accent} /> : null}
                </View>
                <Progress value={pct} showValue size="sm" />
              </Pressable>
            );
          })}

          <View style={styles.footer}>
            <Button
              title={poll.isClosed ? 'Reopen poll' : 'Close poll'}
              size="sm"
              variant="ghost"
              onPress={() =>
                setPolls((current) =>
                  current.map((entry) =>
                    entry.id === poll.id ? { ...entry, isClosed: !entry.isClosed } : entry,
                  ),
                )
              }
            />
            <Button
              title="Share to chat"
              size="sm"
              variant="secondary"
              onPress={() => void shareResults()}
              icon={<Send size={13} color={Colors.text} />}
            />
          </View>
        </View>
      ) : null}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={exp.title}>New poll</Text>

          <Input
            label="Question"
            value={question}
            onChangeText={setQuestion}
            placeholder="What should the room decide?"
            maxLength={140}
          />

          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <Input
                containerStyle={exp.grow}
                label={`Option ${index + 1}`}
                value={option}
                onChangeText={(text) =>
                  setOptions((current) =>
                    current.map((entry, position) => (position === index ? text : entry)),
                  )
                }
                placeholder="An answer people can pick"
                maxLength={80}
              />
              {options.length > 2 ? (
                <Pressable
                  accessibilityLabel={`Remove option ${index + 1}`}
                  onPress={() =>
                    setOptions((current) => current.filter((_, position) => position !== index))
                  }
                  style={styles.removeOption}
                >
                  <X size={15} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}

          <Button
            title="Add option"
            variant="ghost"
            onPress={() => setOptions((current) => [...current, ''])}
            icon={<Plus size={14} color={Colors.textMuted} />}
          />

          <Button
            title="Create poll"
            onPress={createPoll}
            disabled={
              !question.trim() || options.map((o) => o.trim()).filter(Boolean).length < 2
            }
          />
        </ScrollView>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  option: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  optionChosen: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  optionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sheet: {
    padding: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  removeOption: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
});
