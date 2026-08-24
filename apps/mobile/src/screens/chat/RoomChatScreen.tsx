import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Smile, Trash2 } from 'lucide-react-native';
import {
  messages,
  formatClock,
  QUICK_REACTIONS,
  EMOJI,
  contentProblem,
  findMentionQuery,
  rankCandidates,
  type Message,
  type ReactionSummary,
  type MentionCandidate,
} from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { Avatar } from '../../components/Avatar';
import { Colors, Radius } from '../../theme/tokens';

export function RoomChatScreen({ route, navigation }: any) {
  const { roomId, roomName, roomType } = route.params;
  const { token, user } = useAuth();
  const { socket, subscribeRoom, unsubscribeRoom, sendTyping } = useChat();

  const [messageList, setMessageList] = useState<Message[]>([]);
  const [reactionsMap, setReactionsMap] = useState<Record<string, ReactionSummary[]>>({});
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);

  const flatListRef = useRef<FlatList>(null);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    try {
      const page = await messages.history(token, roomId);
      setMessageList(page.messages.slice().reverse());
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [token, roomId]);

  useEffect(() => {
    fetchHistory();
    subscribeRoom(roomId);

    const unsubMsg = socket.on('message_created', (data: any) => {
      if (data.room_id === roomId) {
        setMessageList((prev) => [...prev, data.message]);
        if (data.reactions) {
          setReactionsMap((prev) => ({ ...prev, [data.message.id]: data.reactions }));
        }
      }
    });

    const unsubReactions = socket.on('reactions_updated', (data: any) => {
      if (data.room_id === roomId) {
        setReactionsMap((prev) => ({ ...prev, [data.message_id]: data.reactions }));
      }
    });

    const unsubDelete = socket.on('message_deleted', (data: any) => {
      if (data.room_id === roomId) {
        setMessageList((prev) => prev.filter((m) => m.id !== data.message_id));
      }
    });

    const unsubTyping = socket.on('typing', (data: any) => {
      if (data.room_id === roomId && data.user_id !== user?.id) {
        setTypingUsers((prev) => {
          if (data.is_typing) {
            return prev.includes(data.display_name) ? prev : [...prev, data.display_name];
          } else {
            return prev.filter((n) => n !== data.display_name);
          }
        });
      }
    });

    return () => {
      unsubscribeRoom(roomId);
      unsubMsg();
      unsubReactions();
      unsubDelete();
      unsubTyping();
    };
  }, [roomId, token, user?.id]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    sendTyping(roomId, text.length > 0);

    const query = findMentionQuery(text, text.length);
    if (query) {
      const sampleMembers: MentionCandidate[] = [
        { key: 'everyone', handle: 'everyone', name: 'everyone', everyone: true },
      ];
      setMentionCandidates(rankCandidates(sampleMembers, query.text));
    } else {
      setMentionCandidates([]);
    }
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !token) return;

    const problem = contentProblem(trimmed);
    if (problem) {
      Alert.alert('Message Limit', problem);
      return;
    }

    try {
      setInputText('');
      setMentionCandidates([]);
      sendTyping(roomId, false);
      await messages.post(token, roomId, trimmed);
    } catch (err: any) {
      Alert.alert('Send Failed', err?.message || 'Could not deliver message');
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!token) return;
    try {
      await messages.react(token, msgId, emoji);
      setSelectedMessage(null);
    } catch {
      // Ignore
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!token) return;
    try {
      await messages.remove(token, msgId);
      setSelectedMessage(null);
    } catch {
      // Ignore
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const authorName =
      item.anonymous_author?.alias_name ||
      (item.author_id === user?.id
        ? user?.profile?.display_name || user?.handle
        : `User ${item.author_id.slice(0, 4)}`);
    const itemReactions = reactionsMap[item.id] || item.reactions || [];

    return (
      <TouchableOpacity
        style={styles.messageRow}
        activeOpacity={0.85}
        onLongPress={() => setSelectedMessage(item)}
      >
        <Avatar name={authorName || 'User'} size={38} />
        <View style={styles.messageBody}>
          <View style={styles.messageHeader}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.timestamp}>{formatClock(item.created_at)}</Text>
          </View>
          <Text style={styles.messageText}>{item.content}</Text>

          {itemReactions.length > 0 && (
            <View style={styles.reactionList}>
              {itemReactions.map((r, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.reactionPill, r.me && styles.reactionPillActive]}
                  onPress={() => handleReaction(item.id, r.reaction)}
                >
                  <Text style={styles.reactionEmoji}>{r.reaction}</Text>
                  <Text style={[styles.reactionCount, r.me && { color: Colors.accent }]}>
                    {r.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title} numberOfLines={1}>
            #{roomName}
          </Text>
          {typingUsers.length > 0 && (
            <Text style={styles.typingText} numberOfLines={1}>
              {typingUsers.join(', ')} typing...
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messageList}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>This is the start of #{roomName}</Text>
            </View>
          }
        />
      )}

      {/* Mention Auto-complete Bar */}
      {mentionCandidates.length > 0 && (
        <View style={styles.mentionBar}>
          {mentionCandidates.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.mentionItem}
              onPress={() => {
                setInputText((prev) => prev.replace(/@\w*$/, `@${c.handle} `));
                setMentionCandidates([]);
              }}
            >
              <Text style={styles.mentionHandle}>@{c.handle}</Text>
              <Text style={styles.mentionName}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Composer Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.emojiBtn}
            onPress={() => setShowEmojiPicker((prev) => !prev)}
          >
            <Smile size={22} color={Colors.textMuted} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={`Message #${roomName}`}
            placeholderTextColor={Colors.textDim}
            value={inputText}
            onChangeText={handleInputChange}
            multiline
            maxLength={4000}
            selectionColor={Colors.accent}
          />

          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            disabled={!inputText.trim()}
            onPress={handleSend}
          >
            <Send size={16} color={Colors.accentContrast} />
          </TouchableOpacity>
        </View>

        {/* Emoji Quick Bar */}
        {showEmojiPicker && (
          <View style={styles.emojiGrid}>
            {EMOJI.slice(0, 16).map((e, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.gridEmoji}
                onPress={() => {
                  setInputText((prev) => prev + e);
                  setShowEmojiPicker(false);
                }}
              >
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Action Modal on Message Long-Press */}
      <Modal
        visible={!!selectedMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMessage(null)}
        >
          <View style={styles.actionMenu}>
            <View style={styles.quickReactionsRow}>
              {QUICK_REACTIONS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={styles.quickReactionBtn}
                  onPress={() => selectedMessage && handleReaction(selectedMessage.id, e)}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedMessage?.author_id === user?.id && (
              <TouchableOpacity
                style={styles.deleteAction}
                onPress={() => selectedMessage && handleDeleteMessage(selectedMessage.id)}
              >
                <Trash2 size={18} color={Colors.danger} style={{ marginRight: 8 }} />
                <Text style={styles.deleteText}>Delete Message</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  typingText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageListContent: {
    padding: 16,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  messageBody: {
    flex: 1,
    marginLeft: 12,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textDim,
  },
  messageText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  reactionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionPillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  reactionEmoji: {
    fontSize: 13,
    marginRight: 4,
  },
  reactionCount: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  mentionBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
    padding: 8,
    maxHeight: 120,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  mentionHandle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
    marginRight: 8,
  },
  mentionName: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  emojiBtn: {
    padding: 6,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill, // Rule 4: Pill controls
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 14,
    maxHeight: 100,
    marginHorizontal: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent, // Rule 1: Ink on Lime
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.surface,
    padding: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'space-between',
  },
  gridEmoji: {
    width: '12%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyMessagesText: {
    color: Colors.textDim,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionMenu: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  quickReactionBtn: {
    padding: 8,
  },
  deleteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  deleteText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
});
