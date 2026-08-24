import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  BarChart2,
  Scale,
  Lock,
  Gamepad2,
  Send,
} from 'lucide-react-native';
import { Colors, Radius } from '../../theme/tokens';
import { Button } from '../../components/Button';

export function ExperienceRoomScreen({ route, navigation }: any) {
  const { roomId, roomName, roomType } = route.params;

  // Poll state
  const [selectedPollOption, setSelectedPollOption] = useState<number | null>(null);
  const [pollOptions, setPollOptions] = useState([
    { id: 1, text: 'Rust Backend + React Native', votes: 14 },
    { id: 2, text: 'Go Backend + Flutter', votes: 6 },
    { id: 3, text: 'Node.js + Swift/Kotlin', votes: 3 },
  ]);

  // Debate state
  const [debateSide, setDebateSide] = useState<'A' | 'B' | null>('A');
  const [argumentText, setArgumentText] = useState('');
  const [argumentsList, setArgumentsList] = useState([
    { id: 1, side: 'A', text: 'WebRTC SFU zero-copy provides maximum throughput.', author: 'Alex' },
    { id: 2, side: 'B', text: 'P2P mesh is cheaper for 2-person calls.', author: 'Jordan' },
  ]);

  // Confession state
  const [confessionText, setConfessionText] = useState('');
  const [confessionsList, setConfessionsList] = useState([
    { id: 1, text: 'I secretly test code in production on Fridays 🤫', time: '10m ago' },
    { id: 2, text: 'I love writing raw SQL queries more than using ORMs.', time: '1h ago' },
  ]);

  const handleVote = (id: number) => {
    setSelectedPollOption(id);
    setPollOptions((prev) =>
      prev.map((opt) => (opt.id === id ? { ...opt, votes: opt.votes + 1 } : opt))
    );
  };

  const handleSendArgument = () => {
    if (!argumentText.trim()) return;
    setArgumentsList((prev) => [
      ...prev,
      { id: Date.now(), side: debateSide || 'A', text: argumentText.trim(), author: 'You' },
    ]);
    setArgumentText('');
  };

  const handleSendConfession = () => {
    if (!confessionText.trim()) return;
    setConfessionsList((prev) => [
      { id: Date.now(), text: confessionText.trim(), time: 'Just now' },
      ...prev,
    ]);
    setConfessionText('');
    Alert.alert('Confession Sent', 'Your confession was posted anonymously.');
  };

  const totalVotes = pollOptions.reduce((sum, opt) => sum + opt.votes, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title} numberOfLines={1}>{roomName}</Text>
          <Text style={styles.typeText}>{roomType.toUpperCase()} EXPERIENCE</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* POLL EXPERIENCE */}
        {roomType === 'poll' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <BarChart2 size={22} color="#f4c423" />
              <Text style={styles.cardTitle}>Live Community Poll</Text>
            </View>
            <Text style={styles.pollQuestion}>Which tech stack do you prefer for real-time apps?</Text>

            {pollOptions.map((opt) => {
              const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
              const isSelected = selectedPollOption === opt.id;

              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.pollOption, isSelected && styles.pollOptionSelected]}
                  activeOpacity={0.8}
                  onPress={() => handleVote(opt.id)}
                >
                  <View style={[styles.pollProgress, { width: `${pct}%` }]} />
                  <View style={styles.pollOptionRow}>
                    <Text style={styles.pollOptionText}>{opt.text}</Text>
                    <Text style={styles.pollPercentText}>{pct}% ({opt.votes})</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* DEBATE EXPERIENCE */}
        {roomType === 'debate' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Scale size={22} color="#ff5f5b" />
                <Text style={styles.cardTitle}>Live Stage Debate</Text>
              </View>
              <Text style={styles.topicText}>Topic: Monolith vs Microservices in 2026</Text>

              <View style={styles.debateTabs}>
                <TouchableOpacity
                  style={[styles.sideBtn, debateSide === 'A' && styles.sideBtnActiveA]}
                  onPress={() => setDebateSide('A')}
                >
                  <Text style={styles.sideBtnText}>Side A (Monolith)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sideBtn, debateSide === 'B' && styles.sideBtnActiveB]}
                  onPress={() => setDebateSide('B')}
                >
                  <Text style={styles.sideBtnText}>Side B (Microservices)</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.argumentInput}
                  placeholder={`Add argument for Side ${debateSide}...`}
                  placeholderTextColor={Colors.textDim}
                  value={argumentText}
                  onChangeText={setArgumentText}
                  selectionColor={Colors.accent}
                />
                <TouchableOpacity style={styles.sendArgBtn} onPress={handleSendArgument}>
                  <Send size={16} color={Colors.accentContrast} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.argumentsHeader}>ARGUMENTS STREAM</Text>
            {argumentsList.map((arg) => (
              <View
                key={arg.id}
                style={[
                  styles.argumentCard,
                  arg.side === 'A' ? styles.argBorderA : styles.argBorderB,
                ]}
              >
                <View style={styles.argHeader}>
                  <Text style={[styles.argSide, { color: arg.side === 'A' ? Colors.accent : '#ff5f5b' }]}>
                    SIDE {arg.side} • {arg.author}
                  </Text>
                </View>
                <Text style={styles.argText}>{arg.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* CONFESSION EXPERIENCE */}
        {roomType === 'confession' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Lock size={22} color="#ff8e29" />
                <Text style={styles.cardTitle}>Anonymous Confessions</Text>
              </View>
              <Text style={styles.topicText}>
                Drop an anonymous thought. No names, handles, or identities are recorded.
              </Text>

              <TextInput
                style={styles.confessionInput}
                placeholder="Write your anonymous confession..."
                placeholderTextColor={Colors.textDim}
                value={confessionText}
                onChangeText={setConfessionText}
                multiline
                numberOfLines={3}
                selectionColor={Colors.accent}
              />
              <Button title="Post Anonymously" onPress={handleSendConfession} style={{ marginTop: 12 }} />
            </View>

            <Text style={styles.argumentsHeader}>COMMUNITY CONFESSIONS</Text>
            {confessionsList.map((c) => (
              <View key={c.id} style={styles.confessionCard}>
                <Text style={styles.confessionCardText}>"{c.text}"</Text>
                <Text style={styles.confessionTime}>Anonymous • {c.time}</Text>
              </View>
            ))}
          </View>
        )}

        {/* GAME & ACTIVITY FALLBACK */}
        {['game', 'activity', 'quick_chat'].includes(roomType) && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Gamepad2 size={22} color="#a361fb" />
              <Text style={styles.cardTitle}>{roomName}</Text>
            </View>
            <Text style={styles.topicText}>
              Interactive activity room. Join the voice lobby to participate in live games.
            </Text>
            <Button
              title="Join Voice & Activity Lobby"
              onPress={() => navigation.navigate('RoomChat', { roomId, roomName, roomType })}
              style={{ marginTop: 16 }}
            />
          </View>
        )}
      </ScrollView>
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
  typeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 0.8,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  pollQuestion: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
    marginBottom: 16,
  },
  pollOption: {
    position: 'relative',
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pollOptionSelected: {
    borderColor: Colors.accent,
  },
  pollProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.accentSubtle,
  },
  pollOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pollOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  pollPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.accent,
  },
  topicText: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  debateTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  sideBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sideBtnActiveA: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  sideBtnActiveB: {
    borderColor: '#ff5f5b',
    backgroundColor: 'rgba(255, 95, 91, 0.14)',
  },
  sideBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  argumentInput: {
    flex: 1,
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendArgBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  argumentsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textDim,
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  argumentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  argBorderA: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  argBorderB: {
    borderLeftWidth: 4,
    borderLeftColor: '#ff5f5b',
  },
  argHeader: {
    marginBottom: 4,
  },
  argSide: {
    fontSize: 11,
    fontWeight: '800',
  },
  argText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 19,
  },
  confessionInput: {
    backgroundColor: Colors.sunken,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 80,
    textAlignVertical: 'top',
  },
  confessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confessionCardText: {
    fontSize: 15,
    color: Colors.text,
    fontStyle: 'italic',
    lineHeight: 21,
    marginBottom: 8,
  },
  confessionTime: {
    fontSize: 12,
    color: Colors.textDim,
  },
});
