import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Sparkles } from 'lucide-react-native';
import {
  rooms as roomsApi,
  useRecommendedRoomsQuery,
  useRoomsVM,
  type Room,
  type RoomRecommendation,
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
import { isExperienceRoom } from '../../lib/roomTypes';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { CreateRoomSheet } from './CreateRoomSheet';
import { RoomCard } from './RoomCard';

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

  /*
   * The ranked list, alongside the popular one.
   *
   * Two lists rather than one sorted differently: discovery answers "what is
   * busy", recommendations answer "what is busy *and* looks like you". The
   * server ranks the second and says why, and the reason is the whole reason it
   * is worth a separate section — a card you cannot explain is just a card.
   */
  const suggested = useRecommendedRoomsQuery(token, {
    category: category || undefined,
    limit: 6,
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
    void suggested.refetch();
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

        {/* Ranked first, popular second. Somebody who has been here before is
            better served by six rooms picked for them than by the same wall of
            trending cards they scrolled past yesterday. */}
        <ForYouSection
          rooms={suggested.data?.items ?? []}
          personalized={suggested.data?.personalized ?? false}
          loading={suggested.isLoading}
          onOpen={openRoom}
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

        {roomsVM.discovery.map((room: Room, index: number) => (
          // Cards land one after another rather than all at once — the list
          // reads as filling in, which is what it is doing.
          //
          // The animation sits on a wrapper rather than on the card itself:
          // `Pressable` takes its style as a callback of the press state, and
          // an animated component has no way to evaluate that.
          <Animated.View
            key={room.id}
            entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(280)}
          >
            <RoomCard room={room} onPress={openRoom} />
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

/**
 * The ranked rail.
 *
 * Draws nothing while it is loading and nothing when it comes back empty,
 * rather than a skeleton. A placeholder here would push Trending down the page
 * on every visit only to collapse again a moment later, which is the layout
 * shift readers notice most — and this section is a bonus, not the content.
 *
 * The heading is honest about which list this is. Calling a popularity ranking
 * "for you" is the single thing that makes a recommender feel broken: the
 * reader can tell, and then stops believing the label on the day it is earned.
 */
function ForYouSection({
  rooms,
  personalized,
  loading,
  onOpen,
}: {
  rooms: RoomRecommendation[];
  personalized: boolean;
  loading: boolean;
  onOpen: (id: string, name: string, roomType: RoomType) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  if (loading || rooms.length === 0) return null;

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {personalized ? '✨ For you' : '✨ Popular right now'}
        </Text>
        <Badge text={rooms.length} tone="accent" />
      </View>

      {!personalized ? (
        <Text style={styles.sectionNote}>
          Join a moment or two and this starts matching what you actually like.
        </Text>
      ) : null}

      {rooms.map((room, index) => (
        <Animated.View
          key={room.id}
          entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(280)}
        >
          <RoomCard room={room} onPress={onOpen} reasons={room.reasons} highlighted />
        </Animated.View>
      ))}
    </>
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
  sectionNote: {
    color: c.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.xs,
  },
});
