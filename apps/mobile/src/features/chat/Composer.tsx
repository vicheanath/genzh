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
  type MentionCandidate,
  type RoomWithPermissions,
} from '@genzh/shared';

import { Colors, Radius, Spacing } from '../../theme/tokens';

import { EmojiPicker } from './EmojiPicker';
import { MentionSuggestions } from './MentionSuggestions';
import { useMentionCandidates } from './useMentionCandidates';

/** The counter is noise until the ceiling is actually in sight. */
const COUNTER_FROM = 200;

export interface ComposerProps {
  room: RoomWithPermissions;
  onSend: (content: string) => Promise<void>;
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
  const [draft, setDraft] = useState('');
  // Tracked separately from the value: which mention is being completed is
  // decided by where the caret is, and moving the caret changes the answer
  // without changing the text.
  const [caret, setCaret] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
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
            <X size={15} color={Colors.textMuted} />
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
          placeholderTextColor={Colors.textDim}
          multiline
          maxLength={MAX_LENGTH}
          selectionColor={Colors.accent}
        />

        <View style={styles.bar}>
          <View style={styles.tools}>
            <Pressable
              accessibilityLabel="Add an emoji"
              onPress={() => setEmojiOpen(true)}
              hitSlop={8}
              style={styles.tool}
            >
              <Smile size={18} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              accessibilityLabel="Mention someone"
              onPress={startMention}
              hitSlop={8}
              style={styles.tool}
            >
              <AtSign size={18} color={Colors.textMuted} />
            </Pressable>

            {onTogglePersona ? (
              <View style={styles.persona}>
                <Pressable
                  accessibilityState={{ selected: Boolean(isAnonymous) }}
                  onPress={() => onTogglePersona(true)}
                  style={[styles.chip, isAnonymous && styles.chipActive]}
                >
                  <Lock size={11} color={isAnonymous ? Colors.accentContrast : Colors.textMuted} />
                  <Text style={[styles.chipText, isAnonymous && styles.chipTextActive]} numberOfLines={1}>
                    {anonAlias ?? 'Anonymous'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityState={{ selected: !isAnonymous }}
                  onPress={() => onTogglePersona(false)}
                  style={[styles.chip, !isAnonymous && styles.chipActive]}
                >
                  <User size={11} color={!isAnonymous ? Colors.accentContrast : Colors.textMuted} />
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
              <Send size={17} color={Colors.accentContrast} />
            </Pressable>
          </View>
        </View>
      </View>

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      <EmojiPicker
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        onPick={insert}
        title="Add an emoji"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    margin: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  fieldAnonymous: {
    borderColor: Colors.accent,
  },
  fieldProblem: {
    borderColor: Colors.danger,
  },
  input: {
    color: Colors.text,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: Colors.accentContrast,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  counter: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  counterFull: {
    color: Colors.danger,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  problem: {
    color: Colors.danger,
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
    color: Colors.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  disabledText: {
    color: Colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
});
