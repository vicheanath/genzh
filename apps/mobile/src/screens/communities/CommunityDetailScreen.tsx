import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Hash,
  Volume2,
  Video,
  BarChart2,
  Scale,
  Gamepad2,
  Lock,
  Flame,
  MessageSquare,
} from 'lucide-react-native';
import { rooms, communities, type Room, type CommunityWithPermissions } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Colors, Radius } from '../../theme/tokens';

export function CommunityDetailScreen({ route, navigation }: any) {
  const { communityId, name } = route.params;
  const { token } = useAuth();
  const { joinRoom } = useVoice();
  const [community, setCommunity] = useState<CommunityWithPermissions | null>(null);
  const [roomList, setRoomList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [commData, roomsData] = await Promise.all([
        communities.get(token, communityId),
        rooms.list(token, communityId),
      ]);
      setCommunity(commData);
      setRoomList(roomsData);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getChannelConfig = (type: string): { icon: React.ReactNode; tone: BadgeTone } => {
    switch (type) {
      case 'voice':
        return { icon: <Volume2 size={16} color={Colors.live} />, tone: 'mint' };
      case 'video':
        return { icon: <Video size={16} color={Colors.live} />, tone: 'mint' };
      case 'poll':
        return { icon: <BarChart2 size={16} color="#f4c423" />, tone: 'accent' };
      case 'debate':
        return { icon: <Scale size={16} color="#ff5f5b" />, tone: 'danger' };
      case 'game':
        return { icon: <Gamepad2 size={16} color="#a361fb" />, tone: 'accent' };
      case 'confession':
        return { icon: <Lock size={16} color="#ff8e29" />, tone: 'neutral' };
      case 'activity':
        return { icon: <Flame size={16} color="#f24bba" />, tone: 'accent' };
      default:
        return { icon: <Hash size={16} color={Colors.textMuted} />, tone: 'neutral' };
    }
  };

  const handleRoomPress = (room: Room) => {
    if (room.room_type === 'voice' || room.room_type === 'video') {
      joinRoom(room.id, room.name);
      navigation.navigate('RoomChat', { roomId: room.id, roomName: room.name, roomType: room.room_type });
    } else if (['poll', 'debate', 'game', 'confession', 'activity'].includes(room.room_type)) {
      navigation.navigate('ExperienceRoom', { roomId: room.id, roomName: room.name, roomType: room.room_type });
    } else {
      navigation.navigate('RoomChat', { roomId: room.id, roomName: room.name, roomType: room.room_type });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {name || community?.name || 'Community'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
        >
          {community && (
            <View style={styles.banner}>
              <Avatar name={community.name} url={community.icon_url} size={54} />
              <View style={styles.bannerInfo}>
                <Text style={styles.bannerName}>{community.name}</Text>
                {community.description && (
                  <Text style={styles.bannerDesc}>{community.description}</Text>
                )}
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>CHANNELS & ROOMS</Text>

          {roomList.length === 0 ? (
            <View style={styles.emptyRooms}>
              <MessageSquare size={32} color={Colors.textDim} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyRoomsText}>No channels created yet</Text>
            </View>
          ) : (
            roomList.map((room) => {
              const { icon, tone } = getChannelConfig(room.room_type);
              return (
                <TouchableOpacity
                  key={room.id}
                  style={styles.roomItem}
                  activeOpacity={0.8}
                  onPress={() => handleRoomPress(room)}
                >
                  <View style={styles.roomIconWrapper}>{icon}</View>
                  <View style={styles.roomDetails}>
                    <Text style={styles.roomName}>{room.name}</Text>
                    {room.topic && <Text style={styles.roomTopic} numberOfLines={1}>{room.topic}</Text>}
                  </View>
                  {room.room_type !== 'text' && (
                    <Badge
                      text={room.room_type}
                      tone={tone}
                      dot={room.room_type === 'voice' || room.room_type === 'video'}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  bannerName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textDim,
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roomIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  roomDetails: {
    flex: 1,
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  roomTopic: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyRooms: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyRoomsText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
