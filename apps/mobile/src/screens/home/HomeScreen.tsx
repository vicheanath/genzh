import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass, Lock, MessageSquare, Plus, Sparkles, Users } from 'lucide-react-native';
import {
  rooms as roomsApi,
  useCommunitiesVM,
  useRoomsVM,
  type Room,
  type RoomType,
  type UserRoom,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { ToggleGroup } from '../../components/ToggleGroup';
import { useToast } from '../../components/Toast';
import { UserRow } from '../../components/UserRow';
import { useAuth } from '../../context/AuthContext';
import { isExperienceRoom, roomTypeIcon, roomTypeLabel } from '../../lib/roomTypes';
import { usePresence } from '../../lib/usePresence';
import { useProfiles } from '../../lib/useProfiles';
import { Colors, Radius, Spacing } from '../../theme/tokens';

import { CreateRoomSheet } from './CreateRoomSheet';

/** Stands in for "no filter" — a toggle group needs a value for every option. */
const ALL_CATEGORIES = 'all';

const CATEGORIES = [
  { key: null, label: '✨ All' },
  { key: 'gaming', label: '🎮 Gaming' },
  { key: 'debate', label: '🔥 Debates' },
  { key: 'confession', label: '🤫 Confessions' },
  { key: 'tech', label: '💻 Tech' },
  { key: 'music', label: '🎵 Music' },
  { key: 'memes', label: '😂 Memes' },
  { key: 'random', label: '🎲 Random' },
];

/**
 * The playground: live moments, your communities, and your conversations.
 *
 * The web app's home screen, as a phone destination. Everything on it is a real
 * endpoint — discovery, the community list, and `rooms.mine` for the direct
 * messages the mobile app previously had no way to reach at all.
 */
export function HomeScreen({ navigation }: any) {
  const { token, getToken } = useAuth();
  const toast = useToast();
  const { isOnline } = usePresence();

  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [matching, setMatching] = useState(false);

  // One view model per concern, both from `@genzh/shared`. They are backed by
  // react-query, so coming back to this screen paints from cache and refreshes
  // behind the paint — the hand-rolled fetch hook this replaced refetched
  // everything from scratch on every mount and showed skeletons each time.
  const communitiesVM = useCommunitiesVM(token);
  const roomsVM = useRoomsVM(token, {
    discovery: { enabled: true, category: category || undefined },
    includeMine: true,
  });

  const directRooms = roomsVM.myRooms.filter((room) => room.category === 'dm');
  const peerIds = directRooms.flatMap((room) => (room.dm_peer_id ? [room.dm_peer_id] : []));
  const lookup = useProfiles(peerIds);

  function openRoom(roomId: string, name: string, roomType: RoomType) {
    navigation.navigate(isExperienceRoom(roomType) ? 'ExperienceRoom' : 'RoomChat', {
      roomId,
      roomName: name,
      roomType,
    });
  }

  async function handleFindRandomRoom() {
    setMatching(true);
    try {
      const room = await roomsApi.random(await getToken(), category || undefined);
      if (room) {
        toast.success(`Entering ${room.name}`);
        openRoom(room.id, room.name, room.room_type);
      } else {
        toast.success('No active rooms in this topic', 'Start one now.');
        setCreateOpen(true);
      }
    } catch {
      toast.error('Could not find a random room right now');
    } finally {
      setMatching(false);
    }
  }

  const refreshing = roomsVM.isLoadingDiscovery && communitiesVM.isLoading;

  function refreshAll() {
    void roomsVM.refreshDiscovery();
    void roomsVM.refreshMine();
    void communitiesVM.refresh();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="genzh"
        subtitle="Don’t join communities. Join moments."
        actions={
          <Button
            title=""
            size="sm"
            variant="secondary"
            onPress={() => setCreateOpen(true)}
            icon={<Plus size={17} color={Colors.text} />}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={Colors.accent}
            onRefresh={() => {
              refreshAll();
            }}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroTag}>
            <Sparkles size={13} color={Colors.accent} />
            <Text style={styles.heroTagText}>Anonymous social playground</Text>
          </View>
          <Text style={styles.heroTitle}>Find a moment worth joining.</Text>
          <Text style={styles.heroLede}>
            Discover live conversations, poll strangers, drop confessions, or debate
            unpopular opinions anonymously.
          </Text>

          <View style={styles.heroActions}>
            <Button
              title="🎲 Find something fun"
              onPress={() => void handleFindRandomRoom()}
              loading={matching}
              style={styles.grow}
            />
            <Button
              title="Start a moment"
              variant="secondary"
              onPress={() => setCreateOpen(true)}
              icon={<Plus size={15} color={Colors.text} />}
            />
          </View>
        </View>

        <ToggleGroup
          mode="single"
          value={[category ?? ALL_CATEGORIES]}
          onValueChange={(next) => {
            const picked = next[0];
            setCategory(picked && picked !== ALL_CATEGORIES ? String(picked) : null);
          }}
          items={CATEGORIES.map(({ key, label }) => ({
            value: key ?? ALL_CATEGORIES,
            label,
          }))}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔥 Trending moments</Text>
          {roomsVM.discovery.length > 0 ? <Badge text={roomsVM.discovery.length} /> : null}
        </View>

        {roomsVM.isLoadingDiscovery ? <SkeletonRows rows={3} /> : null}

        {!roomsVM.isLoadingDiscovery && roomsVM.discovery.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={26} color={Colors.textDim} />}
            title="No active moments"
            description="Nothing live in this category right now."
            actionLabel="Start the first room"
            onAction={() => setCreateOpen(true)}
          />
        ) : null}

        {roomsVM.discovery.map((room: Room, index: number) => {
          const Icon = roomTypeIcon(room.room_type);
          return (
            // Cards land one after another rather than all at once — the feed
            // reads as filling in, which is what it is doing.
            //
            // The animation sits on a wrapper rather than on the Pressable
            // itself: `Pressable` takes its style as a callback of the press
            // state, and an animated component has no way to evaluate that.
            <Animated.View
              key={room.id}
              entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(280)}
            >
            <Pressable
              onPress={() => openRoom(room.id, room.name, room.room_type)}
              style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}
            >
              <View style={styles.roomHead}>
                <View style={styles.roomTypeTag}>
                  <Icon size={13} color={Colors.accent} />
                  <Text style={styles.roomTypeText}>{roomTypeLabel(room.room_type)}</Text>
                </View>
                <View style={styles.participants}>
                  <Users size={12} color={Colors.textDim} />
                  <Text style={styles.participantsText}>{room.current_participants || 1}</Text>
                </View>
              </View>

              <Text style={styles.roomName} numberOfLines={1}>
                {room.name}
              </Text>
              <Text style={styles.roomTopic} numberOfLines={2}>
                {room.topic || `Join this ${room.category} session and chat anonymously.`}
              </Text>

              <View style={styles.roomFooter}>
                {room.is_anonymous ? (
                  <View style={styles.anonPill}>
                    <Lock size={11} color={Colors.textMuted} />
                    <Text style={styles.anonText}>Anonymous</Text>
                  </View>
                ) : (
                  <View style={styles.anonPill}>
                    <Text style={styles.anonText}>Public</Text>
                  </View>
                )}
                <Text style={styles.enter}>Enter →</Text>
              </View>
            </Pressable>
            </Animated.View>
          );
        })}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Direct messages</Text>
        </View>

        {roomsVM.isLoadingMine ? <SkeletonRows rows={2} /> : null}

        {!roomsVM.isLoadingMine && directRooms.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={26} color={Colors.textDim} />}
            title="No conversations yet"
            description="Open a profile and send a direct message to start one."
          />
        ) : null}

        {directRooms.map((room: UserRoom) => {
          // A DM's stored name is fixed to whoever opened it, so it names the
          // wrong person for the other half of every conversation. The server
          // resolves the peer per caller as `dm_peer_id`.
          const peer = room.dm_peer_id ? lookup(room.dm_peer_id) : null;
          const label = peer?.display_name ?? room.name.replace(/^DM:\s*/, '');

          return (
            <UserRow
              key={room.id}
              name={label}
              avatarUrl={peer?.avatar_url}
              accentColor={peer?.accent_color}
              presence={
                room.dm_peer_id && isOnline(room.dm_peer_id) ? 'online' : 'offline'
              }
              secondary={peer ? `@${peer.handle}` : 'Direct message'}
              onSelect={() =>
                navigation.navigate('RoomChat', { roomId: room.id, roomName: label })
              }
            />
          );
        })}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your communities</Text>
          <Button
            title="Explore"
            size="sm"
            variant="ghost"
            onPress={() => navigation.navigate('Explore')}
            icon={<Compass size={14} color={Colors.textMuted} />}
          />
        </View>

        {communitiesVM.isLoading ? <SkeletonRows rows={2} /> : null}

        {!communitiesVM.isLoading && communitiesVM.communities.length === 0 ? (
          <EmptyState
            icon={<Compass size={26} color={Colors.textDim} />}
            title="No communities yet"
            description="Browse what is public and join one."
            actionLabel="Browse communities"
            onAction={() => navigation.navigate('Explore')}
          />
        ) : null}

        {communitiesVM.communities.map((community, index) => (
          <Animated.View
            key={community.id}
            entering={FadeInDown.delay(Math.min(index, 6) * 45).duration(260)}
          >
          <Pressable
            onPress={() =>
              navigation.navigate('CommunityDetail', {
                communityId: community.id,
                communityName: community.name,
              })
            }
            style={({ pressed }) => [styles.communityCard, pressed && styles.pressed]}
          >
            <Avatar name={community.name} url={community.icon_url} size={40} />
            <View style={styles.communityText}>
              <Text style={styles.communityName} numberOfLines={1}>
                {community.name}
              </Text>
              <Text style={styles.communityDescription} numberOfLines={1}>
                {community.description ?? 'Server'}
              </Text>
            </View>
          </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      <CreateRoomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          refreshAll();
        }}
        onOpenRoom={openRoom}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSubtle,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  heroTagText: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroLede: {
    color: Colors.textSubtle,
    fontSize: 13,
    lineHeight: 19,
  },
  heroActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  grow: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  roomCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  pressed: {
    backgroundColor: Colors.surfaceHover,
  },
  roomHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  roomTypeText: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  participantsText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  roomName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  roomTopic: {
    color: Colors.textSubtle,
    fontSize: 13,
    lineHeight: 18,
  },
  roomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  anonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  anonText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  enter: {
    color: Colors.accentText,
    fontSize: 12,
    fontWeight: '800',
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  communityText: {
    flex: 1,
  },
  communityName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  communityDescription: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 1,
  },
});
