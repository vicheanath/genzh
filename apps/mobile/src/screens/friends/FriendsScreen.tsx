import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, Check, X, Users, UserCheck } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Colors, Radius } from '../../theme/tokens';

export function FriendsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | 'pending' | 'add'>('all');
  const [friendHandle, setFriendHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const [friendsList, setFriendsList] = useState<Array<{ id: string; handle: string; name: string; online: boolean; avatar?: string }>>([
    { id: '1', handle: 'sophia', name: 'Sophia Chen', online: true },
    { id: '2', handle: 'marcus_dev', name: 'Marcus Dev', online: false },
  ]);

  const [pendingRequests, setPendingRequests] = useState<Array<{ id: string; handle: string; name: string }>>([
    { id: '3', handle: 'elena_w', name: 'Elena Wilson' },
  ]);

  const handleSendFriendRequest = () => {
    if (!friendHandle.trim()) {
      Alert.alert('Validation Error', 'Please enter a user handle.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Request Sent', `Friend request sent to @${friendHandle.trim()}`);
      setFriendHandle('');
      setTab('all');
    }, 400);
  };

  const handleAccept = (id: string) => {
    const req = pendingRequests.find((p) => p.id === id);
    if (req) {
      setPendingRequests((prev) => prev.filter((p) => p.id !== id));
      setFriendsList((prev) => [...prev, { ...req, online: true }]);
    }
  };

  const handleDecline = (id: string) => {
    setPendingRequests((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Direct Messages</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'all' && styles.tabBtnActive]}
          onPress={() => setTab('all')}
        >
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>
            Friends ({friendsList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
            Pending ({pendingRequests.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === 'add' && styles.tabBtnActive]}
          onPress={() => setTab('add')}
        >
          <Text style={[styles.tabText, tab === 'add' && styles.tabTextActive]}>
            Add Friend
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'all' && (
        <FlatList
          data={friendsList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.friendCard}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('RoomChat', {
                  roomId: item.id,
                  roomName: item.handle,
                  roomType: 'text',
                })
              }
            >
              <Avatar name={item.name} url={item.avatar} size={46} online={item.online} />
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{item.name}</Text>
                <Text style={styles.friendHandle}>@{item.handle}</Text>
              </View>
              <TouchableOpacity
                style={styles.msgBtn}
                onPress={() =>
                  navigation.navigate('RoomChat', {
                    roomId: item.id,
                    roomName: item.handle,
                    roomType: 'text',
                  })
                }
              >
                <MessageCircle size={18} color={Colors.text} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Users size={44} color={Colors.textDim} style={{ marginBottom: 10 }} />
              <Text style={styles.emptyTitle}>No friends added yet</Text>
              <Text style={styles.emptySubtitle}>Use the Add Friend tab to connect with other users.</Text>
            </View>
          }
        />
      )}

      {tab === 'pending' && (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.friendCard}>
              <Avatar name={item.name} size={46} />
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{item.name}</Text>
                <Text style={styles.friendHandle}>@{item.handle}</Text>
              </View>
              <View style={styles.reqActions}>
                <TouchableOpacity
                  style={[styles.reqBtn, styles.acceptBtn]}
                  onPress={() => handleAccept(item.id)}
                >
                  <Check size={16} color={Colors.accentContrast} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reqBtn, styles.declineBtn]}
                  onPress={() => handleDecline(item.id)}
                >
                  <X size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <UserCheck size={44} color={Colors.textDim} style={{ marginBottom: 10 }} />
              <Text style={styles.emptyTitle}>No pending requests</Text>
            </View>
          }
        />
      )}

      {tab === 'add' && (
        <View style={styles.addSection}>
          <Text style={styles.addTitle}>Add Friend by Handle</Text>
          <Text style={styles.addSubtitle}>
            Enter the exact user handle to send a friend request.
          </Text>

          <TextInput
            style={styles.addInput}
            placeholder="e.g. alex_smith"
            placeholderTextColor={Colors.textDim}
            autoCapitalize="none"
            value={friendHandle}
            onChangeText={setFriendHandle}
            selectionColor={Colors.accent}
          />

          <Button
            title="Send Friend Request"
            onPress={handleSendFriendRequest}
            loading={loading}
            style={{ marginTop: 14 }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  tabBtnActive: {
    backgroundColor: Colors.surfaceRaised,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.text,
  },
  listContent: {
    padding: 16,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  friendHandle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  msgBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reqActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reqBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: Colors.accent,
  },
  declineBtn: {
    backgroundColor: Colors.sunken,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addSection: {
    padding: 24,
  },
  addTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  addSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
  addInput: {
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
