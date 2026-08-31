import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { AtSign, Lock, Send, Smile, User, X } from 'lucide-react-native';
import {
  applyMention,
  contentProblem,
  findMentionQuery,
  MAX_LENGTH,
  rankCandidates,
  type CustomEmoji,
  type MentionCandidate,
  type RoomWithPermissions,
} from '@genzh/shared';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { MentionSuggestions } from './MentionSuggestions';
import { useMentionCandidates } from './useMentionCandidates';

/** The counter is noise until the ceiling is actually in sight. */
const COUNTER_FROM = 200;

export interface ComposerProps {
  room: RoomWithPermissions;
  onSend: (content: string) => Promise<void>;
  /** This room's custom emoji, offered above the standard set in the picker. */
  customEmoji?: readonly CustomEmoji[];
  /**
   * Whether this deployment has GIF search configured.
   *
   * The button is hidden rather than disabled when it is off: a control that
   * opens a sheet saying the feature does not exist is worse than no control.
   */
  gifsEnabled?: boolean;
  onTyping?: () => void;
  isAnonymous?: boolean;
  onTogglePersona?: (isAnon: boolean) => void;
  anonAlias?: string;
  publicName: string;
  /** When set, the composer is editing that message rather than writing a new one. */
  editing?: { id: string; content: string } | null;
  onCancelEdit?: () => void;
  onSubmitEdit?: (content: string) => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * The message box.
 *
 * Composing is its own concern — a draft, a caret, an autocomplete, a persona —
 * and none of it is about drawing messages. The persona chips live on the
 * action bar rather than in a banner above the field, because "who am I posting
 * as" belongs to the message being written.
 */
export function Composer({
  room,
  onSend,
  customEmoji,
  gifsEnabled,
  onTyping,
  isAnonymous,
  onTogglePersona,
  anonAlias,
  publicName,
  editing,
  onCancelEdit,
  onSubmitEdit,
  disabled,
  disabledReason,
}: ComposerProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const [draft, setDraft] = useState('');
  // Tracked separately from the value: which mention is being completed is
  // decided by where the caret is, and moving the caret changes the answer
  // without changing the text.
  const [caret, setCaret] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const candidates = useMentionCandidates(room);

  // An edit takes over the same field. Seeding on the transition rather than in
  // an effect keeps the draft the single source of truth for what is typed.
  const [editingId, setEditingId] = useState<string | null>(null);
  if (editing && editing.id !== editingId) {
    setEditingId(editing.id);
    setDraft(editing.content);
    setCaret(editing.content.length);
  }
  if (!editing && editingId !== null) {
    setEditingId(null);
    setDraft('');
    setCaret(0);
  }

  const query = findMentionQuery(draft, caret);
  const suggestions = query ? rankCandidates(candidates, query.text) : [];

  /** Replace the draft and remember where the caret belongs inside it. */
  function write(text: string, at: number) {
    setDraft(text);
    setCaret(at);
  }

  function accept(candidate: MentionCandidate) {
    if (!query) return;
    const next = applyMention(draft, query, candidate.handle);
    write(next.text, next.caret);
  }

  function insert(text: string) {
    write(draft.slice(0, caret) + text + draft.slice(caret), caret + text.length);
  }

  /** The `@` button: types the character, which opens the picker on its own. */
  function startMention() {
    const before = draft[caret - 1];
    // An `@` that does not begin a word is not a mention — the server would not
    // parse it, so the picker must not offer one either.
    insert(before === undefined || /\s/.test(before) ? '@' : ' @');
    inputRef.current?.focus();
  }

  /**
   * Post a GIF as its own message, rather than pasting the URL into the draft.
   *
   * A GIF is only drawn as a picture when the message is *nothing but* the URL
   * — the rule that stops a link inside somebody's sentence being silently
   * turned into an image. Inserting it into the draft would therefore usually
   * produce a link, which is not what the picker promised.
   *
   * The draft is left exactly as it was: a half-written sentence is not
   * something a GIF should discard.
   */
  function sendGif(url: string) {
    void onSend(url);
  }

  function submit() {
    const content = draft.trim();
    if (!content || contentProblem(content)) return;

    if (editing && onSubmitEdit) {
      void onSubmitEdit(content);
      return;
    }

    setDraft('');
    setCaret(0);
    void onSend(content);
  }

  const remaining = MAX_LENGTH - draft.length;
  const empty = draft.trim().length === 0;

  // A draft the server would refuse. Caught here so the message never leaves —
  // being told "at most ten people" while looking at the sentence beats
  // watching it disappear into an error toast.
  const problem = empty ? null : contentProblem(draft);

  if (disabled) {
    return (
      <View style={styles.disabled}>
        <Text style={styles.disabledText}>
          {disabledReason ?? 'You cannot post in this channel.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {suggestions.length > 0 ? (
        <MentionSuggestions candidates={suggestions} onPick={accept} />
      ) : null}

      {editing ? (
        <View style={styles.editingBar}>
          <Text style={styles.editingText}>Editing message</Text>
          <Pressable onPress={onCancelEdit} hitSlop={8} accessibilityLabel="Cancel edit">
            <X size={15} color={c.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.field, isAnonymous && styles.fieldAnonymous, problem && styles.fieldProblem]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            // A plain change carries no caret; assume the end, which is where a
            // keystroke lands unless the person has moved it — and the
            // selection handler below corrects that case.
            setCaret(text.length);
            onTyping?.();
          }}
          onSelectionChange={(
            event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
          ) => setCaret(event.nativeEvent.selection.end)}
          placeholder={`Message #${room.name}`}
          placeholderTextColor={c.textDim}
          multiline
          maxLength={MAX_LENGTH}
          selectionColor={c.accent}
        />

        <View style={styles.bar}>
          <View style={styles.tools}>
            <Pressable
              accessibilityLabel="Add an emoji"
              onPress={() => setEmojiOpen(true)}
              hitSlop={8}
              style={styles.tool}
            >
              <Smile size={18} color={c.textMuted} />
            </Pressable>

            {gifsEnabled ? (
              <Pressable
                accessibilityLabel="Send a GIF"
                onPress={() => setGifOpen(true)}
                hitSlop={8}
                style={styles.tool}
              >
                {/* The word rather than a glyph: every chat product labels this
                    "GIF", and no icon says it. */}
                <Text style={styles.gifLabel}>GIF</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel="Mention someone"
              onPress={startMention}
              hitSlop={8}
              style={styles.tool}
            >
              <AtSign size={18} color={c.textMuted} />
            </Pressable>

            {onTogglePersona ? (
              <View style={styles.persona}>
                <Pressable
                  accessibilityState={{ selected: Boolean(isAnonymous) }}
                  onPress={() => onTogglePersona(true)}
                  style={[styles.chip, isAnonymous && styles.chipActive]}
                >
                  <Lock size={11} color={isAnonymous ? c.accentContrast : c.textMuted} />
                  <Text style={[styles.chipText, isAnonymous && styles.chipTextActive]} numberOfLines={1}>
                    {anonAlias ?? 'Anonymous'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityState={{ selected: !isAnonymous }}
                  onPress={() => onTogglePersona(false)}
                  style={[styles.chip, !isAnonymous && styles.chipActive]}
                >
                  <User size={11} color={!isAnonymous ? c.accentContrast : c.textMuted} />
                  <Text style={[styles.chipText, !isAnonymous && styles.chipTextActive]} numberOfLines={1}>
                    {publicName}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.submit}>
            {/* Only once the ceiling is close enough to matter. */}
            {remaining <= COUNTER_FROM ? (
              <Text style={[styles.counter, remaining <= 0 && styles.counterFull]}>
                {remaining}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel={editing ? 'Save edit' : 'Send message'}
              disabled={empty || problem !== null}
              onPress={submit}
              style={[styles.send, (empty || problem !== null) && styles.sendDisabled]}
            >
              <Send size={17} color={c.accentContrast} />
            </Pressable>
          </View>
        </View>
      </View>

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      <EmojiPicker
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        onPick={insert}
        custom={customEmoji}
        title="Add an emoji"
      />

      <GifPicker open={gifOpen} onOpenChange={setGifOpen} onPick={sendGif} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  field: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.xl,
    margin: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  fieldAnonymous: {
    borderColor: c.accent,
  },
  fieldProblem: {
    borderColor: c.danger,
  },
  input: {
    color: c.text,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 130,
    paddingVertical: Spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  tools: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  gifLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tool: {
    padding: 2,
  },
  persona: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    marginLeft: Spacing.xs,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  chipActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  chipText: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: c.accentContrast,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  counter: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  counterFull: {
    color: c.danger,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  problem: {
    color: c.danger,
    fontSize: 12,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  editingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  editingText: {
    color: c.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  disabledText: {
    color: c.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
});
