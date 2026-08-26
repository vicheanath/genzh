import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useFeedQuery, type FeedRoom, type RoomType } from '@genzh/shared';

import { Button } from '../../components/Button';
import { ModeSwitch } from '../../components/ModeSwitch';
import { useAuth } from '../../context/AuthContext';
import { useAppMode } from '../../context/AppModeContext';
import { isExperienceRoom } from '../../lib/roomTypes';
import { useTabBarHeight } from '../../theme/layout';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { CreateRoomSheet } from '../home/CreateRoomSheet';
import { MomentCard } from './MomentCard';

const CATEGORIES: ReadonlyArray<{ key: string | null; label: string }> = [
  { key: null, label: '✨ Everything' },
  { key: 'random', label: '🎲 Random' },
  { key: 'gaming', label: '🎮 Gaming' },
  { key: 'debate', label: '🔥 Debates' },
  { key: 'confession', label: '🤫 Confessions' },
  { key: 'music', label: '🎵 Music' },
  { key: 'memes', label: '😂 Memes' },
  { key: 'tech', label: '💻 Tech' },
];

/**
 * A card counts as "on screen" once most of it is.
 *
 * Below this and a half-scrolled card would start its countdown and take over
 * the header while the previous one is still mostly visible.
 */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** How close to the end the reader gets before the next page is asked for. */
const PREFETCH_THRESHOLD = 0.5;

/**
 * The playground: throwaway rooms, one full screen at a time.
 *
 * This is the whole of one half of the product. There is no list here and no
 * browsing — a room is a page you either walk into or swipe past, and the next
 * one is already loaded by the time you reach it.
 *
 * A `FlatList` snapped to the page height rather than a pager library: the feed
 * is exactly a vertical list whose rows happen to be screen-sized, and paging
 * it natively means windowing, pull-to-refresh and infinite loading all come
 * for free instead of being rebuilt on top of a pager.
 */
export function PlaygroundFeedScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const { setMode } = useAppMode();

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();

  const [category, setCategory] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const feed = useFeedQuery(token, category ?? undefined);

  /*
   * One page is one swipe, so a page has to be exactly the list's own viewport.
   * Getting it wrong by a pixel is what makes a snapping feed drift further off
   * with every swipe.
   *
   * Measured rather than computed. The window height less the tab bar is the
   * right answer on iOS and the wrong one on some Android hardware, where the
   * status bar and the navigation bar are counted inconsistently — so that is
   * only the opening guess, and the first layout replaces it with the truth.
   */
  const [pageHeight, setPageHeight] = useState(windowHeight - tabBarHeight);

  const items: FeedRoom[] = useMemo(
    () => feed.data?.pages.flatMap((page) => page.rooms) ?? [],
    [feed.data],
  );

  const listRef = useRef<FlatList<FeedRoom>>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (typeof first?.index === 'number') setActiveIndex(first.index);
    },
  ).current;

  const openRoom = useCallback(
    (roomId: string, name: string, roomType: RoomType) => {
      navigation.navigate(isExperienceRoom(roomType) ? 'ExperienceRoom' : 'RoomChat', {
        roomId,
        roomName: name,
        roomType,
      });
    },
    [navigation],
  );

  const scrollToNext = useCallback(() => {
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  }, [activeIndex]);

  function pickCategory(next: string | null) {
    setCategory(next);
    // A new filter is a new feed, not a scrolled one — leaving the reader on
    // page nine of a list that just changed underneath them is disorienting.
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  const filterRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
      style={[styles.filterBar, { top: insets.top + 56 }]}
    >
      {CATEGORIES.map((entry) => {
        const selected = entry.key === category;
        return (
          <Pressable
            key={entry.key ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => pickCategory(entry.key)}
            style={[styles.filter, selected && styles.filterSelected]}
          >
            <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (feed.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
        <Text style={styles.centreText}>Finding what is happening</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.centre, { paddingTop: insets.top }]}>
        <View style={styles.emptyTop}>
          <ModeSwitch overlay />
        </View>
        <Text style={styles.emptyTitle}>Nothing is on right now</Text>
        <Text style={styles.emptyBody}>
          {category
            ? 'No rooms in this topic yet. Start one, or look at everything.'
            : 'The playground is quiet. Start the first room and people will find it.'}
        </Text>
        <View style={styles.emptyActions}>
          <Button title="Start a room" onPress={() => setCreateOpen(true)} />
          {category ? (
            <Button
              title="See everything"
              variant="secondary"
              onPress={() => pickCategory(null)}
            />
          ) : (
            <Button
              title="Go to your servers"
              variant="secondary"
              onPress={() => setMode('servers')}
            />
          )}
        </View>

        <CreateRoomSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void feed.refetch();
          }}
          onOpenRoom={openRoom}
        />
      </View>
    );
  }

  return (
    <View
      style={styles.screen}
      onLayout={(event) => {
        const measured = Math.round(event.nativeEvent.layout.height);
        if (measured > 0 && measured !== pageHeight) setPageHeight(measured);
      }}
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(room) => room.id}
        renderItem={({ item, index }) => (
          <MomentCard
            room={item}
            height={pageHeight}
            topInset={insets.top + 96}
            bottomInset={Spacing.lg}
            active={index === activeIndex}
            hasNext={index < items.length - 1 || feed.hasNextPage}
            onJoin={() => openRoom(item.id, item.name, item.room_type)}
            onNext={scrollToNext}
          />
        )}
        // Snapping is what makes this a feed rather than a scroll: a swipe
        // either lands on the next room or springs back to this one.
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        // Every row is exactly one page tall, so the list never has to measure
        // one — which is also what makes `scrollToIndex` safe for a room the
        // reader has not scrolled to yet.
        getItemLayout={(_, index) => ({
          length: pageHeight,
          offset: pageHeight * index,
          index,
        })}
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReachedThreshold={PREFETCH_THRESHOLD}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            tintColor="#fff"
            onRefresh={() => {
              void feed.refetch();
            }}
          />
        }
      />

      {/* Floating over the feed rather than sitting in a header: the card
          behind is the whole screen, and a bar across the top would cost every
          room its first line. These two belong to the screen, so they stay put
          while the rooms move under them. */}
      <View style={[styles.chrome, { top: insets.top + Spacing.md }]} pointerEvents="box-none">
        <ModeSwitch overlay />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a room"
          onPress={() => setCreateOpen(true)}
          style={styles.create}
        >
          <Plus size={20} color="#fff" />
        </Pressable>
      </View>

      {filterRow}

      <CreateRoomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void feed.refetch();
        }}
        onOpenRoom={openRoom}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#0d0d0b',
    },
    centre: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
      padding: Spacing.xl,
      backgroundColor: '#0d0d0b',
    },
    centreText: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 14,
      fontWeight: '600',
    },
    emptyTop: {
      position: 'absolute',
      top: Spacing.md,
      left: Spacing.lg,
    },
    emptyTitle: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyBody: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
    },
    emptyActions: {
      gap: Spacing.sm,
      alignSelf: 'stretch',
      marginTop: Spacing.sm,
    },
    filterBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      maxHeight: 40,
    },
    filters: {
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
      alignItems: 'center',
    },
    filter: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(12, 12, 10, 0.5)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    filterSelected: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    filterText: {
      color: 'rgba(255,255,255,0.86)',
      fontSize: 13,
      fontWeight: '700',
    },
    filterTextSelected: {
      color: c.accentText,
    },
    chrome: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    create: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12, 12, 10, 0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
    },
  });
