import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, PhoneOff, Users, Video } from 'lucide-react-native';
import {
  ApiError,
  can,
  useRoomQuery,
  useSendMessageMutation,
  useAddReactionMutation,
  useRemoveReactionMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  formatClock,
  formatDayDivider,
  MENTION,
  QUICK_REACTIONS,
  type ChatServerEvent,
  type Message,
  type ReactionSummary,
  type RoomWithPermissions,
  type Uuid,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Menu } from '../../components/Menu';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingPanel, Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { Composer } from '../../features/chat/Composer';
import { EmojiPicker } from '../../features/chat/EmojiPicker';
import { mergeMessages, useMessageHistory } from '../../features/chat/useMessageHistory';
import { chatSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { useProfiles } from '../../lib/useProfiles';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * Shortest gap between two "typing" frames for one room.
 *
 * Matches `TYPING_INTERVAL` in `apps/api/src/routes/ws.rs`, which drops
 * anything faster: sending frames the server is going to throw away is traffic
 * for nothing, and on a phone it is traffic on a metered radio.
 */
const TYPING_INTERVAL_MS = 1000;

/** Room types that carry a call as well as a transcript. */
const VOICE_ROOM_TYPES: readonly string[] = ['voice', 'video', 'stage'];

export function RoomChatScreen({ route, navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { roomId, roomName } = route.params ?? {};
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const openProfile = useAppStore((s) => s.openProfile);
  const voice = useVoice();

  const anonAlias = useAppStore((s) => s.anonymousAlias);
  const anonByDefault = useAppStore((s) => s.isAnonymousByDefault);

  const roomQuery = useRoomQuery(token, roomId);
  const sendMutation = useSendMessageMutation(token);
  const addReactionMutation = useAddReactionMutation(token);
  const removeReactionMutation = useRemoveReactionMutation(token);
  const editMutation = useEditMessageMutation(token);
  const deleteMutation = useDeleteMessageMutation(token);

  const history = useMessageHistory(roomId);
  const { setItems } = history;

  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(anonByDefault);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [reactFor, setReactFor] = useState<Message | null>(null);

  const lastTypingAt = useRef(0);

  const authorIds = useMemo(
    () => [...new Set(history.items.map((message) => message.author_id))],
    [history.items],
  );
  const lookup = useProfiles(authorIds);

  // ── realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    chatSocket.subscribe(roomId);

    const offCreated = chatSocket.on<ChatServerEvent>('message_created', (event) => {
      if (event.type !== 'message_created' || event.room_id !== roomId) return;
      setItems((current) =>
        mergeMessages(current, [
          {
            ...event.message,
            reactions: event.reactions ?? [],
            anonymous_author: event.anonymous_author ?? event.message.anonymous_author,
          },
        ]),
      );
    });

    const offUpdated = chatSocket.on<ChatServerEvent>('message_updated', (event) => {
      if (event.type !== 'message_updated' || event.room_id !== roomId) return;
      setItems((current) =>
        mergeMessages(current, [{ ...event.message, reactions: event.reactions ?? [] }]),
      );
    });

    const offDeleted = chatSocket.on<ChatServerEvent>('message_deleted', (event) => {
      if (event.type !== 'message_deleted' || event.room_id !== roomId) return;
      setItems((current) => current.filter((message) => message.id !== event.message_id));
    });

    const offReactions = chatSocket.on<ChatServerEvent>('reactions_updated', (event) => {
      if (event.type !== 'reactions_updated' || event.room_id !== roomId) return;
      setItems((current) =>
        current.map((message) => {
          if (message.id !== event.message_id) return message;
          // The broadcast is written for everyone, so its `me` flags belong to
          // nobody in particular. Ours are re-applied from what we already hold,
          // or every reaction in the room would light up as mine.
          const mine = new Set(
            message.reactions.filter((reaction) => reaction.me).map((r) => r.reaction),
          );
          return {
            ...message,
            reactions: (event.reactions ?? []).map((reaction) => ({
              ...reaction,
              me: mine.has(reaction.reaction),
            })),
          };
        }),
      );
    });

    const offTyping = chatSocket.on<ChatServerEvent>('typing', (event) => {
      if (event.type !== 'typing' || event.room_id !== roomId) return;
      if (event.user_id === user?.id) return;

      setTypingNames((current) => {
        if (event.is_typing) {
          return current.includes(event.display_name)
            ? current
            : [...current, event.display_name];
        }
        return current.filter((name) => name !== event.display_name);
      });
    });

    return () => {
      chatSocket.unsubscribe(roomId);
      offCreated();
      offUpdated();
      offDeleted();
      offReactions();
      offTyping();
    };
  }, [roomId, setItems, user?.id]);

  // ── actions ─────────────────────────────────────────────────────────────
  const send = useCallback(
    async (content: string) => {
      try {
        await sendMutation.mutateAsync({ roomId, content, isAnonymous });
        // The socket echoes the stored message back, so nothing is appended
        // here — doing both would show it twice until the merge deduplicated.
      } catch (cause) {
        toast.error(
          'Could not send',
          cause instanceof ApiError ? cause.message : undefined,
        );
      }
    },
    [sendMutation, roomId, isAnonymous, toast],
  );

  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingAt.current < TYPING_INTERVAL_MS) return;
    lastTypingAt.current = now;
    chatSocket.sendTyping(roomId, true);
  }, [roomId]);

  const toggleReaction = useCallback(
    async (messageId: Uuid, emoji: string, active: boolean) => {
      // Optimistic: a reaction that waits for a round trip feels broken, and
      // the request is idempotent either way.
      setItems((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, reactions: applyLocally(message.reactions, emoji, !active) }
            : message,
        ),
      );

      try {
        const reactions = active
          ? await removeReactionMutation.mutateAsync({ roomId, messageId, reaction: emoji })
          : await addReactionMutation.mutateAsync({ roomId, messageId, reaction: emoji });
        setItems((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, reactions } : message,
          ),
        );
      } catch (cause) {
        setItems((current) =>
          current.map((message) =>
            message.id === messageId
              ? { ...message, reactions: applyLocally(message.reactions, emoji, active) }
              : message,
          ),
        );
        toast.error('Could not react', cause instanceof ApiError ? cause.message : undefined);
      }
    },
    [roomId, addReactionMutation, removeReactionMutation, setItems, toast],
  );

  const submitEdit = useCallback(
    async (content: string) => {
      if (!editing) return;
      try {
        const updated = await editMutation.mutateAsync({
          roomId,
          messageId: editing.id,
          content,
        });
        setItems((current) =>
          current.map((message) =>
            message.id === updated.id
              ? // The edit response carries no reactions of its own, so the
                // ones already held are kept rather than blanked.
                { ...updated, reactions: message.reactions }
              : message,
          ),
        );
        setEditing(null);
      } catch (cause) {
        toast.error('Could not edit', cause instanceof ApiError ? cause.message : undefined);
      }
    },
    [editing, editMutation, roomId, setItems, toast],
  );

  const removeMessage = useCallback(
    async (messageId: Uuid) => {
      const ok = await confirm({
        title: 'Delete this message?',
        description: 'It disappears for everyone in the room.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;

      try {
        await deleteMutation.mutateAsync({ roomId, messageId });
        setItems((current) => current.filter((message) => message.id !== messageId));
        toast.success('Message deleted');
      } catch (cause) {
        toast.error('Could not delete', cause instanceof ApiError ? cause.message : undefined);
      }
    },
    [confirm, deleteMutation, roomId, setItems, toast],
  );


  if (roomQuery.isLoading) return <LoadingPanel label="Opening room" />;

  if (roomQuery.error || !roomQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title={roomName ?? 'Room'} onBack={() => navigation.goBack()} />
        <View style={styles.centre}>
          <Callout tone="danger" text="This room could not be opened." />
        </View>
      </SafeAreaView>
    );
  }

  const current: RoomWithPermissions = roomQuery.data;
  const canPost = can(current.your_permissions, 'send_message');
  const canReact = can(current.your_permissions, 'add_reaction');
  const canModerate = can(current.your_permissions, 'manage_room');
  const inCall = voice.activeRoomId === current.id;

  // Newest first, because the list is inverted — which is what keeps the newest
  // message pinned to the composer as the keyboard opens.
  const ordered = [...history.items].reverse();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={current.name}
        subtitle={current.topic ?? undefined}
        onBack={() => navigation.goBack()}
        actions={
          <>
            {/* A voice-capable channel is joinable from its own transcript —
                the call bar then follows you wherever you navigate next. */}
            {VOICE_ROOM_TYPES.includes(current.room_type) ? (
              inCall ? (
                <>
                  <Button
                    title="Active Call"
                    size="sm"
                    variant="primary"
                    onPress={() => navigation.navigate('Call')}
                    icon={<Phone size={14} color={c.accentContrast} />}
                  />
                  <Button
                    title=""
                    size="sm"
                    variant="danger"
                    onPress={() => void voice.leave()}
                    icon={<PhoneOff size={16} />}
                  />
                </>
              ) : (
                <>
                  <Button
                    title=""
                    size="sm"
                    variant="ghost"
                    onPress={() => void voice.join(current.id, current.name)}
                    icon={<Phone size={17} color={c.live} />}
                  />
                  <Button
                    title=""
                    size="sm"
                    variant="ghost"
                    onPress={async () => {
                      await voice.join(current.id, current.name);
                      await voice.toggleCamera();
                    }}
                    icon={<Video size={17} color={c.accent} />}
                  />
                </>
              )
            ) : null}

            <Button
              title=""
              size="sm"
              variant="ghost"
              onPress={() =>
                navigation.navigate('MemberList', {
                  communityId: current.community_id,
                  roomId: current.id,
                  title: current.name,
                })
              }
              icon={<Users size={18} color={c.textMuted} />}
            />
          </>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {history.loading ? (
          <LoadingPanel />
        ) : (
          <FlatList
            inverted
            data={ordered}
            keyExtractor={(message) => message.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            // Inverted, so "the end" is the top of the transcript: this is what
            // pages backwards as the reader scrolls into the past.
            onEndReached={() => void history.loadOlder()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              history.loadingOlder ? (
                <View style={styles.olderSpinner}>
                  <Spinner />
                </View>
              ) : !history.hasMore && ordered.length > 0 ? (
                <Text style={styles.start}>This is the start of #{current.name}.</Text>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No messages yet. Say something.</Text>
            }
            renderItem={({ item, index }) => {
              // The list runs newest-first, so the message *before* this one in
              // time is the next index.
              const previous = ordered[index + 1];
              const grouped = isGrouped(previous, item);
              const divider =
                !previous || !sameDay(previous.created_at, item.created_at)
                  ? formatDayDivider(item.created_at)
                  : null;

              return (
                // The list is inverted, but a cell's own children still lay out
                // top to bottom — so the day's label goes first to land above
                // the first message of that day.
                <View>
                  {divider ? (
                    <View style={styles.divider}>
                      <View style={styles.dividerRule} />
                      <Text style={styles.dividerLabel}>{divider}</Text>
                      <View style={styles.dividerRule} />
                    </View>
                  ) : null}
                  <MessageRow
                    message={item}
                    author={lookup(item.author_id)}
                    grouped={grouped}
                    isOwn={item.author_id === user?.id}
                    myHandle={user?.handle}
                    canReact={canReact}
                    onOpenProfile={openProfile}
                    onToggleReaction={toggleReaction}
                    onLongPress={() => setMenuFor(item)}
                    onAddReaction={() => setReactFor(item)}
                  />
                </View>
              );
            }}
          />
        )}

        {typingNames.length > 0 ? (
          <Animated.Text
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(140)}
            style={styles.typing}
          >
            {typingNames.slice(0, 3).join(', ')}
            {typingNames.length === 1 ? ' is' : ' are'} typing…
          </Animated.Text>
        ) : null}

        <Composer
          room={current}
          onSend={send}
          onTyping={onTyping}
          disabled={!canPost}
          disabledReason="You do not have permission to post in this channel."
          isAnonymous={current.is_anonymous ? isAnonymous : undefined}
          onTogglePersona={current.is_anonymous ? setIsAnonymous : undefined}
          anonAlias={anonAlias}
          publicName={user?.profile.display_name ?? user?.handle ?? 'You'}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSubmitEdit={submitEdit}
        />
      </KeyboardAvoidingView>

      <Menu
        open={menuFor !== null}
        onOpenChange={(open) => !open && setMenuFor(null)}
        title="Message"
        items={[
          ...(canReact
            ? [
                {
                  key: 'react',
                  label: 'Add reaction',
                  onPress: () => setReactFor(menuFor),
                },
              ]
            : []),
          ...(menuFor?.author_id === user?.id
            ? [
                {
                  key: 'edit',
                  label: 'Edit message',
                  onPress: () =>
                    menuFor && setEditing({ id: menuFor.id, content: menuFor.content }),
                },
              ]
            : []),
          ...(menuFor?.author_id === user?.id || canModerate
            ? [
                {
                  key: 'delete',
                  label: 'Delete message',
                  tone: 'danger' as const,
                  separated: true,
                  onPress: () => menuFor && void removeMessage(menuFor.id),
                },
              ]
            : []),
        ]}
      />

      <EmojiPicker
        open={reactFor !== null}
        onOpenChange={(open) => !open && setReactFor(null)}
        title="React"
        onPick={(emoji) => {
          if (!reactFor) return;
          const active = reactFor.reactions.some(
            (reaction) => reaction.reaction === emoji && reaction.me,
          );
          void toggleReaction(reactFor.id, emoji, active);
          setReactFor(null);
        }}
      />
    </SafeAreaView>
  );
}

// ── one message ────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: Message;
  author: { display_name: string; avatar_url: string | null; accent_color: string | null } | null;
  grouped: boolean;
  isOwn: boolean;
  myHandle?: string;
  canReact: boolean;
  onOpenProfile: (userId: Uuid) => void;
  onToggleReaction: (messageId: Uuid, emoji: string, active: boolean) => void;
  onLongPress: () => void;
  onAddReaction: () => void;
}

function MessageRow({
  message,
  author,
  grouped,
  isOwn,
  myHandle,
  canReact,
  onOpenProfile,
  onToggleReaction,
  onLongPress,
  onAddReaction,
}: MessageRowProps) {
  const styles = useThemedStyles(makeStyles);
  const isAnonymous = Boolean(message.anonymous_author);
  const name = message.anonymous_author
    ? message.anonymous_author.alias_name
    : (author?.display_name ?? 'Unknown');
  const accent = message.anonymous_author
    ? message.anonymous_author.accent_color
    : author?.accent_color;
  const avatarUrl = message.anonymous_author ? undefined : author?.avatar_url;

  return (
    // Long-press is the touchscreen equivalent of the web's hover bar and
    // right-click menu — it is the gesture people already try.
    <Pressable onLongPress={onLongPress} delayLongPress={280} style={styles.message}>
      {grouped ? (
        <View style={styles.gutter} />
      ) : (
        <Pressable
          disabled={isAnonymous}
          onPress={() => onOpenProfile(message.author_id)}
        >
          <Avatar name={name} url={avatarUrl} accent={accent} size={36} />
        </Pressable>
      )}

      <View style={styles.body}>
        {!grouped ? (
          <View style={styles.header}>
            <Pressable
              disabled={isAnonymous}
              onPress={() => onOpenProfile(message.author_id)}
            >
              <Text style={[styles.author, accent ? { color: accent } : null]}>{name}</Text>
            </Pressable>
            {isOwn ? <Text style={styles.youTag}>you</Text> : null}
            <Text style={styles.time}>{formatClock(message.created_at)}</Text>
          </View>
        ) : null}

        <Text style={styles.content}>
          <MessageText text={message.content} myHandle={myHandle} />
          {message.edited_at ? <Text style={styles.edited}> (edited)</Text> : null}
        </Text>

        <View style={styles.reactions}>
          {message.reactions.map((reaction) => (
            // A reaction arriving is the most common live change in a room, and
            // the one most likely to be missed: it pops in, and the chips after
            // it slide along rather than jumping.
            <Animated.View
              key={reaction.reaction}
              entering={ZoomIn.springify().damping(14).stiffness(300)}
              exiting={FadeOut.duration(120)}
              layout={LinearTransition.springify().damping(20).stiffness(240)}
            >
              <Pressable
                disabled={!canReact && !reaction.me}
                onPress={() => onToggleReaction(message.id, reaction.reaction, reaction.me)}
                style={[styles.reaction, reaction.me && styles.reactionMine]}
              >
                <Text style={styles.reactionEmoji}>{reaction.reaction}</Text>
                <Text style={[styles.reactionCount, reaction.me && styles.reactionCountMine]}>
                  {reaction.count}
                </Text>
              </Pressable>
            </Animated.View>
          ))}

          {canReact
            ? QUICK_REACTIONS.filter(
                (emoji) => !message.reactions.some((r) => r.reaction === emoji),
              ).map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => onToggleReaction(message.id, emoji, false)}
                  style={styles.quickReaction}
                >
                  <Text style={styles.quickEmoji}>{emoji}</Text>
                </Pressable>
              ))
            : null}

          {canReact ? (
            <Pressable onPress={onAddReaction} style={styles.quickReaction}>
              <Text style={styles.addReaction}>+</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Message text with its mentions picked out.
 *
 * Uses the same `MENTION` pattern the composer completes against and the server
 * parses with, so what is highlighted is exactly what notified somebody.
 */
function MessageText({ text, myHandle }: { text: string; myHandle?: string }) {
  const styles = useThemedStyles(makeStyles);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MENTION)) {
    const [whole, prefix = '', mentioned] = match;
    if (!mentioned) continue;
    const start = match.index ?? 0;

    nodes.push(text.slice(cursor, start + prefix.length));

    const isEveryone = mentioned.toLowerCase() === 'everyone';
    const isMe = myHandle !== undefined && mentioned.toLowerCase() === myHandle.toLowerCase();

    nodes.push(
      <Text
        key={`${start}-${mentioned}`}
        style={[styles.mention, (isMe || isEveryone) && styles.mentionSelf]}
      >
        @{mentioned}
      </Text>,
    );
    cursor = start + whole.length;
  }

  if (cursor === 0) return <>{text}</>;
  nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Same author, within five minutes: draw it as a continuation. */
function isGrouped(previous: Message | undefined, message: Message): boolean {
  if (!previous) return false;
  if (previous.author_id !== message.author_id) return false;
  if (Boolean(previous.anonymous_author) !== Boolean(message.anonymous_author)) return false;

  const gap =
    new Date(message.created_at).getTime() - new Date(previous.created_at).getTime();
  return gap >= 0 && gap < 5 * 60 * 1000;
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Apply a reaction toggle to a local tally, so the row updates immediately. */
function applyLocally(
  reactions: ReactionSummary[],
  emoji: string,
  add: boolean,
): ReactionSummary[] {
  const existing = reactions.find((reaction) => reaction.reaction === emoji);

  if (!existing) {
    return add ? [...reactions, { reaction: emoji, count: 1, me: true }] : reactions;
  }

  const count = existing.count + (add ? 1 : -1);
  if (count <= 0) return reactions.filter((reaction) => reaction.reaction !== emoji);

  return reactions.map((reaction) =>
    reaction.reaction === emoji ? { ...reaction, count, me: add } : reaction,
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.bg,
  },
  flex: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  list: {
    paddingVertical: Spacing.md,
  },
  message: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 3,
  },
  gutter: {
    width: 36,
  },
  body: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 1,
  },
  author: {
    color: c.text,
    fontSize: 14,
    fontWeight: '800',
  },
  youTag: {
    color: c.textDim,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  time: {
    color: c.textDim,
    fontSize: 11,
  },
  content: {
    color: c.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  edited: {
    color: c.textDim,
    fontSize: 11,
  },
  mention: {
    color: c.accentText,
    fontWeight: '700',
  },
  mentionSelf: {
    color: c.accentContrast,
    backgroundColor: c.accent,
  },
  reactions: {
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
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  reactionMine: {
    borderColor: c.accent,
    backgroundColor: c.accentSubtle,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  reactionCountMine: {
    color: c.accentText,
  },
  quickReaction: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    opacity: 0.45,
  },
  quickEmoji: {
    fontSize: 13,
  },
  addReaction: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  dividerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: c.border,
  },
  dividerLabel: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  typing: {
    color: c.textSubtle,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
  },
  olderSpinner: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  start: {
    color: c.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  empty: {
    color: c.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
    transform: [{ scaleY: -1 }],
  },
});
