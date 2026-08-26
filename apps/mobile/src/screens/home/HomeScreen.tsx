import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Plus, Sparkles, Users } from 'lucide-react-native';
import {
  rooms as roomsApi,
  useRoomsVM,
  type Room,
  type RoomType,
} from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ModeSwitch } from '../../components/ModeSwitch';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { ToggleGroup } from '../../components/ToggleGroup';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { isExperienceRoom, roomTypeIcon, roomTypeLabel } from '../../lib/roomTypes';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

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
 * The playground, laid out to browse rather than to swipe.
 *
 * The same rooms the feed shows, as a scrollable wall with the category filter
 * up front — for the reader who wants to pick rather than be shown one at a
 * time. The feed is the front door of this half of the app; this is the index.
 *
 * Deliberately rooms only. Communities and direct messages used to share this
 * screen, and they are the other half of the product now: they live on the
 * servers side, which the switch in the header goes to.
 */
export function HomeScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token, getToken } = useAuth();
  const toast = useToast();

  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [matching, setMatching] = useState(false);

  // One view model per concern, both from `@genzh/shared`. They are backed by
  // react-query, so coming back to this screen paints from cache and refreshes
  // behind the paint — the hand-rolled fetch hook this replaced refetched
  // everything from scratch on every mount and showed skeletons each time.
  const roomsVM = useRoomsVM(token, {
    discovery: { enabled: true, category: category || undefined },
  });

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

  const refreshing = roomsVM.isLoadingDiscovery;

  function refreshAll() {
    void roomsVM.refreshDiscovery();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Browse"
        subtitle="Every moment happening right now"
        actions={<ModeSwitch />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={() => {
              refreshAll();
            }}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroTag}>
            <Sparkles size={13} color={c.accent} />
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
              icon={<Plus size={15} color={c.text} />}
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
            icon={<Sparkles size={26} color={c.textDim} />}
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
                  <Icon size={13} color={c.accent} />
                  <Text style={styles.roomTypeText}>{roomTypeLabel(room.room_type)}</Text>
                </View>
                <View style={styles.participants}>
                  <Users size={12} color={c.textDim} />
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
                    <Lock size={11} color={c.textMuted} />
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.bg,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  hero: {
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: c.accentSubtle,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  heroTagText: {
    color: c.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
  heroTitle: {
    color: c.text,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroLede: {
    color: c.textSubtle,
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
    color: c.text,
    fontSize: 15,
    fontWeight: '800',
  },
  roomCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  pressed: {
    backgroundColor: c.surfaceHover,
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
    color: c.accentText,
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
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  roomName: {
    color: c.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  roomTopic: {
    color: c.textSubtle,
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
    backgroundColor: c.surfaceMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  anonText: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  enter: {
    color: c.accentText,
    fontSize: 12,
    fontWeight: '800',
  },
});
