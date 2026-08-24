import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Flame,
  Gamepad2,
  Plus,
  RotateCcw,
  Send,
  Shuffle,
  Timer,
  Trophy,
} from 'lucide-react-native';
import { can, type RoomWithPermissions } from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Collapsible } from '../../components/Collapsible';
import { Input } from '../../components/Input';
import { Progress } from '../../components/Progress';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { useExp, postToChat } from './shared';

type GameMode = 'trivia' | 'would_you_rather' | 'truth_or_dare' | 'word_chain';

export interface TriviaQuestion {
  category: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface WouldYouRatherItem {
  optionA: string;
  optionB: string;
  votesA: number;
  votesB: number;
}

export interface TruthOrDareItem {
  type: 'truth' | 'dare';
  text: string;
}

const TRIVIA_SECONDS = 15;

const DEFAULT_TRIVIA_DECK: TriviaQuestion[] = [
  {
    category: '💻 Tech & internet',
    question: 'What was JavaScript originally called when Brendan Eich created it in ten days?',
    options: ['Mocha', 'LiveScript', 'ECMAScript', 'Oak'],
    answer: 0,
    explanation: 'It was Mocha in May 1995, then LiveScript, and finally JavaScript.',
  },
  {
    category: '🎮 Gaming',
    question: 'Which game coined the phrase “the cake is a lie”?',
    options: ['Half-Life 2', 'Portal', 'BioShock', 'Fallout 3'],
    answer: 1,
    explanation: 'Portal (2007) hid it as graffiti in the dens behind the test chambers.',
  },
  {
    category: '🪐 Science',
    question: 'How long does sunlight take to reach Earth on average?',
    options: ['8 minutes 20 seconds', '12 minutes 4 seconds', '1 minute 30 seconds', 'Instantly'],
    answer: 0,
    explanation: '300,000 km/s across ~150 million km is roughly eight minutes and twenty seconds.',
  },
  {
    category: '🎵 Pop culture',
    question: 'Which video was the first on YouTube to pass a billion views?',
    options: ['Despacito', 'Baby', 'Gangnam Style', 'See You Again'],
    answer: 2,
    explanation: 'Gangnam Style broke YouTube’s view counter in December 2012.',
  },
];

const DEFAULT_WYR_DECK: WouldYouRatherItem[] = [
  {
    optionA: 'Have infinite free flights anywhere in the world',
    optionB: 'Never need to sleep again, at full energy',
    votesA: 28,
    votesB: 35,
  },
  {
    optionA: 'Speak and understand every human language',
    optionB: 'Talk to animals and understand their thoughts',
    votesA: 42,
    votesB: 31,
  },
  {
    optionA: 'Live a century into the future with no memories',
    optionB: 'Live a century in the past with everything you know now',
    votesA: 19,
    votesB: 38,
  },
];

const DEFAULT_TOD_DECK: TruthOrDareItem[] = [
  { type: 'truth', text: 'What is the most unhinged search in your history this week?' },
  { type: 'dare', text: 'Send a voice message saying “beep boop beep” in a serious robot accent.' },
  { type: 'truth', text: 'What is a hot take you hold that would get you cancelled in five minutes?' },
  { type: 'dare', text: 'Type a whole sentence using only autocomplete predictions, and post it.' },
];

/**
 * Party mini-games.
 *
 * Four modes, all client-side: the API has no game resource, so the room shares
 * a *result* rather than the state. Host-authored decks persist per room in
 * `AsyncStorage`, which is the mobile stand-in for the web's `localStorage`.
 */
export function GameExperience({ room }: { room: RoomWithPermissions }) {
  const styles = useThemedStyles(makeStyles);
  const exp = useExp();
  const c = useColors();
  const { user, getToken } = useAuth();
  const toast = useToast();

  const isHost = room.owner_id === user?.id || can(room.your_permissions, 'manage_room');

  const [mode, setMode] = useState<GameMode>('trivia');

  const [triviaDeck, setTriviaDeck] = useState<TriviaQuestion[]>(DEFAULT_TRIVIA_DECK);
  const [wyrDeck, setWyrDeck] = useState<WouldYouRatherItem[]>(DEFAULT_WYR_DECK);
  const [todDeck, setTodDeck] = useState<TruthOrDareItem[]>(DEFAULT_TOD_DECK);

  // Decks are read once per room. `AsyncStorage` has no synchronous read, so
  // unlike the web the defaults render first and the saved deck replaces them.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [trivia, wyr, tod] = await AsyncStorage.multiGet([
          `genzh_custom_trivia_${room.id}`,
          `genzh_custom_wyr_${room.id}`,
          `genzh_custom_tod_${room.id}`,
        ]);
        if (cancelled) return;
        if (trivia[1]) setTriviaDeck(JSON.parse(trivia[1]) as TriviaQuestion[]);
        if (wyr[1]) setWyrDeck(JSON.parse(wyr[1]) as WouldYouRatherItem[]);
        if (tod[1]) setTodDeck(JSON.parse(tod[1]) as TruthOrDareItem[]);
      } catch {
        // A corrupt deck falls back to the built-in one rather than an empty game.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room.id]);

  // ── trivia ──────────────────────────────────────────────────────────────
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TRIVIA_SECONDS);
  const [triviaDone, setTriviaDone] = useState(false);

  useEffect(() => {
    if (mode !== 'trivia' || triviaDone || selected !== null) return;

    if (timeLeft <= 0) {
      // -1 stands for "ran out": the answer is revealed, nothing scored.
      setSelected(-1);
      return;
    }

    const timer = setTimeout(() => setTimeLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [mode, timeLeft, triviaDone, selected]);

  const trivia = triviaDeck[triviaIndex] ?? triviaDeck[0];

  function answer(index: number) {
    if (selected !== null || !trivia) return;
    setSelected(index);

    if (index === trivia.answer) {
      // Answering fast is worth more, which is what keeps the clock meaningful.
      setScore((current) => current + 100 + timeLeft * 10);
      setStreak((current) => current + 1);
    } else {
      setStreak(0);
    }
  }

  function nextTrivia() {
    if (triviaIndex + 1 < triviaDeck.length) {
      setTriviaIndex((index) => index + 1);
      setSelected(null);
      setTimeLeft(TRIVIA_SECONDS);
    } else {
      setTriviaDone(true);
    }
  }

  function resetTrivia() {
    setTriviaIndex(0);
    setSelected(null);
    setScore(0);
    setStreak(0);
    setTimeLeft(TRIVIA_SECONDS);
    setTriviaDone(false);
  }

  async function shareTrivia() {
    const player = user?.profile.display_name ?? 'Anonymous gamer';
    const verdict = score >= 300 ? '🔥 Godlike' : score >= 150 ? '⚡ Great job' : '👍 Good try';

    try {
      await postToChat(
        room,
        await getToken(),
        `🏆 TRIVIA RUSH RESULTS\n👤 ${player}\n⭐ Score: ${score} (${verdict})\n🔥 Best streak: ${streak}x\n📚 Questions: ${triviaDeck.length}/${triviaDeck.length}`,
      );
      toast.success('Results posted to chat');
    } catch {
      toast.error('Could not post results');
    }
  }

  // ── would you rather ────────────────────────────────────────────────────
  const [wyrIndex, setWyrIndex] = useState(0);
  const [wyrVoted, setWyrVoted] = useState<'A' | 'B' | null>(null);
  const wyr = wyrDeck[wyrIndex] ?? wyrDeck[0];

  function voteWyr(side: 'A' | 'B') {
    if (wyrVoted || !wyr) return;
    setWyrVoted(side);
    setWyrDeck((deck) =>
      deck.map((item, index) =>
        index === wyrIndex
          ? {
              ...item,
              votesA: item.votesA + (side === 'A' ? 1 : 0),
              votesB: item.votesB + (side === 'B' ? 1 : 0),
            }
          : item,
      ),
    );
  }

  async function shareWyr() {
    if (!wyr) return;
    const total = wyr.votesA + wyr.votesB || 1;
    const a = Math.round((wyr.votesA / total) * 100);

    try {
      await postToChat(
        room,
        await getToken(),
        `🤔 WOULD YOU RATHER\n🅰️ ${wyr.optionA} — ${a}%\n🅱️ ${wyr.optionB} — ${100 - a}%`,
      );
      toast.success('Dilemma shared to chat');
    } catch {
      toast.error('Could not share to chat');
    }
  }

  // ── truth or dare ───────────────────────────────────────────────────────
  const [todIndex, setTodIndex] = useState(0);
  const tod = todDeck[todIndex] ?? todDeck[0];

  async function shareTod() {
    if (!tod) return;
    try {
      await postToChat(
        room,
        await getToken(),
        `🎯 ${tod.type.toUpperCase()} DROP\n🎲 “${tod.text}”\n\nAnswer or complete it in chat.`,
      );
      toast.success('Prompt dropped into chat');
    } catch {
      toast.error('Could not share prompt');
    }
  }

  // ── word chain ──────────────────────────────────────────────────────────
  const [chain, setChain] = useState<string[]>(['GENZH', 'HYPER', 'REACT', 'TURBO']);
  const [wordInput, setWordInput] = useState('');
  const lastWord = chain[chain.length - 1] ?? 'GENZH';
  const requiredLetter = lastWord[lastWord.length - 1] ?? 'H';

  async function addWord() {
    const word = wordInput.trim().toUpperCase();
    if (!word) return;

    if (word[0] !== requiredLetter) {
      toast.error(`Word must start with “${requiredLetter}”`);
      return;
    }

    const next = [...chain, word];
    setChain(next);
    setWordInput('');

    // Every fifth word is worth telling the room about; every word would be
    // a transcript full of one-word messages.
    if (next.length % 5 === 0) {
      try {
        await postToChat(
          room,
          await getToken(),
          `⚡ WORD CHAIN MILESTONE — ${next.length} words! Last: ${word} (next starts with ${word.slice(-1)})`,
        );
      } catch {
        // A milestone that fails to post is not worth interrupting the game for.
      }
    }
  }

  // ── host builders ───────────────────────────────────────────────────────
  const [newQuestion, setNewQuestion] = useState('');
  const [newCategory, setNewCategory] = useState('🎲 Random trivia');
  const [newOptions, setNewOptions] = useState(['', '', '', '']);
  const [newAnswer, setNewAnswer] = useState(0);
  const [newExplanation, setNewExplanation] = useState('');

  const [newWyrA, setNewWyrA] = useState('');
  const [newWyrB, setNewWyrB] = useState('');

  const [newTodType, setNewTodType] = useState<'truth' | 'dare'>('truth');
  const [newTodText, setNewTodText] = useState('');

  async function persist(key: string, value: unknown) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The deck still works for this session if storage is unavailable.
    }
  }

  async function saveTrivia() {
    const options = newOptions.map((option) => option.trim());
    if (!newQuestion.trim() || options.some((option) => !option)) return;

    const updated = [
      {
        category: newCategory.trim() || 'Custom trivia',
        question: newQuestion.trim(),
        options,
        answer: newAnswer,
        explanation: newExplanation.trim() || 'Created by the room host.',
      },
      ...triviaDeck,
    ];
    setTriviaDeck(updated);
    await persist(`genzh_custom_trivia_${room.id}`, updated);

    setNewQuestion('');
    setNewOptions(['', '', '', '']);
    setNewExplanation('');
    toast.success('Question added to the deck');
  }

  async function saveWyr() {
    if (!newWyrA.trim() || !newWyrB.trim()) return;

    const updated = [
      { optionA: newWyrA.trim(), optionB: newWyrB.trim(), votesA: 1, votesB: 1 },
      ...wyrDeck,
    ];
    setWyrDeck(updated);
    await persist(`genzh_custom_wyr_${room.id}`, updated);

    setNewWyrA('');
    setNewWyrB('');
    toast.success('Dilemma added to the deck');
  }

  async function saveTod() {
    if (!newTodText.trim()) return;

    const updated = [{ type: newTodType, text: newTodText.trim() }, ...todDeck];
    setTodDeck(updated);
    await persist(`genzh_custom_tod_${room.id}`, updated);

    setNewTodText('');
    toast.success(`${newTodType === 'truth' ? 'Truth' : 'Dare'} added`);
  }

  return (
    <ScrollView contentContainerStyle={exp.content} keyboardShouldPersistTaps="handled">
      <View style={exp.cardHeader}>
        <View style={exp.tag}>
          <Gamepad2 size={13} color={c.accent} />
          <Text style={exp.tagText}>Party mini-games</Text>
        </View>
        {isHost ? <Badge text="Host controls" tone="accent" /> : null}
      </View>

      <Tabs
        value={mode}
        onValueChange={setMode}
        scrollable
        items={[
          { value: 'trivia', label: 'Trivia' },
          { value: 'would_you_rather', label: 'Would you rather' },
          { value: 'truth_or_dare', label: 'Truth or dare' },
          { value: 'word_chain', label: 'Word chain' },
        ]}
      />

      {mode === 'trivia' && trivia ? (
        <View style={exp.card}>
          <View style={exp.cardHeader}>
            <Badge text={trivia.category} />
            <View style={exp.row}>
              <Trophy size={13} color={c.accent} />
              <Text style={styles.score}>{score}</Text>
              {streak > 1 ? (
                <>
                  <Flame size={13} color={c.warning} />
                  <Text style={styles.streak}>{streak}x</Text>
                </>
              ) : null}
            </View>
          </View>

          {triviaDone ? (
            <>
              <Text style={exp.title}>Run complete</Text>
              <Text style={exp.subtitle}>
                {score} points across {triviaDeck.length} questions, best streak {streak}x.
              </Text>
              <View style={exp.row}>
                <Button
                  title="Play again"
                  style={exp.grow}
                  onPress={resetTrivia}
                  icon={<RotateCcw size={14} color={c.accentContrast} />}
                />
                <Button
                  title="Share"
                  variant="secondary"
                  onPress={() => void shareTrivia()}
                  icon={<Send size={13} color={c.text} />}
                />
              </View>
            </>
          ) : (
            <>
              <View style={exp.row}>
                <Timer size={13} color={timeLeft <= 5 ? c.danger : c.textMuted} />
                <Text style={[styles.clock, timeLeft <= 5 && styles.clockLow]}>
                  {timeLeft}s
                </Text>
                <View style={exp.grow}>
                  <Progress
                    value={(timeLeft / TRIVIA_SECONDS) * 100}
                    size="sm"
                    color={timeLeft <= 5 ? c.danger : c.accent}
                  />
                </View>
              </View>

              <Text style={exp.title}>{trivia.question}</Text>

              {trivia.options.map((option, index) => {
                const revealed = selected !== null;
                const correct = index === trivia.answer;
                const chosen = index === selected;

                return (
                  <Pressable
                    key={option}
                    disabled={revealed}
                    onPress={() => answer(index)}
                    style={[
                      styles.answer,
                      revealed && correct && styles.answerCorrect,
                      revealed && chosen && !correct && styles.answerWrong,
                    ]}
                  >
                    <Text style={styles.answerText}>{option}</Text>
                  </Pressable>
                );
              })}

              {selected !== null ? (
                <>
                  <Text style={exp.subtitle}>{trivia.explanation}</Text>
                  <Button title="Next question" onPress={nextTrivia} />
                </>
              ) : null}
            </>
          )}

          <Text style={styles.progressLabel}>
            Question {triviaIndex + 1} of {triviaDeck.length}
          </Text>
        </View>
      ) : null}

      {mode === 'would_you_rather' && wyr ? (
        <View style={exp.card}>
          <Text style={exp.title}>Would you rather…</Text>

          {(['A', 'B'] as const).map((side) => {
            const text = side === 'A' ? wyr.optionA : wyr.optionB;
            const votes = side === 'A' ? wyr.votesA : wyr.votesB;
            const total = wyr.votesA + wyr.votesB || 1;
            const pct = (votes / total) * 100;

            return (
              <Pressable
                key={side}
                disabled={wyrVoted !== null}
                onPress={() => voteWyr(side)}
                style={[styles.answer, wyrVoted === side && styles.answerCorrect]}
              >
                <Text style={styles.answerText}>
                  {side === 'A' ? '🅰️' : '🅱️'} {text}
                </Text>
                {wyrVoted ? <Progress value={pct} showValue size="sm" /> : null}
              </Pressable>
            );
          })}

          <View style={exp.row}>
            <Button
              title="Next dilemma"
              style={exp.grow}
              variant="secondary"
              onPress={() => {
                setWyrIndex((index) => (index + 1) % wyrDeck.length);
                setWyrVoted(null);
              }}
              icon={<Shuffle size={14} color={c.text} />}
            />
            <Button
              title="Share"
              variant="ghost"
              onPress={() => void shareWyr()}
              icon={<Send size={13} color={c.textMuted} />}
            />
          </View>
        </View>
      ) : null}

      {mode === 'truth_or_dare' && tod ? (
        <View style={exp.card}>
          <Badge
            text={tod.type === 'truth' ? 'Truth' : 'Dare'}
            tone={tod.type === 'truth' ? 'mint' : 'danger'}
          />
          <Text style={exp.title}>{tod.text}</Text>

          <View style={exp.row}>
            <Button
              title="Draw another"
              style={exp.grow}
              onPress={() => setTodIndex(Math.floor(Math.random() * todDeck.length))}
              icon={<Shuffle size={14} color={c.accentContrast} />}
            />
            <Button
              title="Share"
              variant="secondary"
              onPress={() => void shareTod()}
              icon={<Send size={13} color={c.text} />}
            />
          </View>
        </View>
      ) : null}

      {mode === 'word_chain' ? (
        <View style={exp.card}>
          <Text style={exp.title}>Word chain</Text>
          <Text style={exp.subtitle}>
            Next word must start with <Text style={styles.letter}>{requiredLetter}</Text>.
          </Text>

          <View style={exp.chipRow}>
            {chain.map((word, index) => (
              <View key={`${word}-${index}`} style={exp.chip}>
                <Text style={exp.chipText}>{word}</Text>
              </View>
            ))}
          </View>

          <Input
            value={wordInput}
            onChangeText={setWordInput}
            placeholder={`A word starting with ${requiredLetter}`}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button title="Add word" onPress={() => void addWord()} disabled={!wordInput.trim()} />
        </View>
      ) : null}

      {isHost ? (
        <Collapsible title="Host: add your own content" defaultOpen={false}>
          <View style={exp.card}>
            <Text style={styles.builderTitle}>Trivia question</Text>
            <Input label="Category" value={newCategory} onChangeText={setNewCategory} />
            <Input
              label="Question"
              value={newQuestion}
              onChangeText={setNewQuestion}
              multiline
            />
            {newOptions.map((option, index) => (
              <View key={index} style={exp.row}>
                <Input
                  containerStyle={exp.grow}
                  label={`Option ${index + 1}`}
                  value={option}
                  onChangeText={(text) =>
                    setNewOptions((current) =>
                      current.map((entry, position) => (position === index ? text : entry)),
                    )
                  }
                />
                <Pressable
                  onPress={() => setNewAnswer(index)}
                  style={[styles.answerPick, newAnswer === index && styles.answerPickActive]}
                >
                  <Text
                    style={[
                      exp.chipText,
                      newAnswer === index && { color: c.accentContrast },
                    ]}
                  >
                    ✓
                  </Text>
                </Pressable>
              </View>
            ))}
            <Input
              label="Explanation"
              value={newExplanation}
              onChangeText={setNewExplanation}
              multiline
            />
            <Button
              title="Add to trivia deck"
              onPress={() => void saveTrivia()}
              icon={<Plus size={14} color={c.accentContrast} />}
            />
          </View>

          <View style={exp.card}>
            <Text style={styles.builderTitle}>Would you rather</Text>
            <Input label="Option A" value={newWyrA} onChangeText={setNewWyrA} multiline />
            <Input label="Option B" value={newWyrB} onChangeText={setNewWyrB} multiline />
            <Button
              title="Add dilemma"
              onPress={() => void saveWyr()}
              icon={<Plus size={14} color={c.accentContrast} />}
            />
          </View>

          <View style={exp.card}>
            <Text style={styles.builderTitle}>Truth or dare</Text>
            <View style={exp.row}>
              {(['truth', 'dare'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setNewTodType(option)}
                  style={[exp.chip, exp.grow, newTodType === option && exp.chipActive]}
                >
                  <Text style={[exp.chipText, newTodType === option && exp.chipTextActive]}>
                    {option === 'truth' ? 'Truth' : 'Dare'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input label="Prompt" value={newTodText} onChangeText={setNewTodText} multiline />
            <Button
              title="Add prompt"
              onPress={() => void saveTod()}
              icon={<Plus size={14} color={c.accentContrast} />}
            />
          </View>
        </Collapsible>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  score: {
    color: c.accentText,
    fontSize: 13,
    fontWeight: '800',
  },
  streak: {
    color: c.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  clock: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    minWidth: 30,
  },
  clockLow: {
    color: c.danger,
  },
  answer: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  answerCorrect: {
    borderColor: c.success,
    backgroundColor: c.successSubtle,
  },
  answerWrong: {
    borderColor: c.danger,
    backgroundColor: c.dangerSubtle,
  },
  answerText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
  },
  answerPick: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  answerPickActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  progressLabel: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  letter: {
    color: c.accentText,
    fontWeight: '800',
  },
  builderTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
