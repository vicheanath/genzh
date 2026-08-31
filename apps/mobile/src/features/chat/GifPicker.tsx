import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Search } from 'lucide-react-native';
import { useGifSearchInfinite, type GifResult } from '@genzh/shared';

import { Sheet } from '../../components/Sheet';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * How long to wait after the last keystroke before searching.
 *
 * Every search is a round-trip through our API to GIPHY, and somebody typing
 * "excited" would otherwise fire seven of them to see the results of the
 * seventh. Longer than the web's, because a phone keyboard is slower and a
 * mobile connection is dearer.
 */
const DEBOUNCE_MS = 450;

/** Two columns of thumbnails. */
const COLUMNS = 2;

export interface GifPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the GIF's URL, which is what gets posted as the message. */
  onPick: (url: string) => void;
}

/**
 * Search GIPHY and pick a GIF.
 *
 * The searching half is only mounted while the sheet is open: the grid holds a
 * few dozen animating images, and leaving them decoding behind a closed sheet
 * costs real memory on a phone for something nobody is looking at.
 */
export function GifPicker({ open, onOpenChange, onPick }: GifPickerProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} maxHeightRatio={0.8}>
      <Text style={styles.title}>Pick a GIF</Text>
      {open ? (
        <GifPanel
          onPick={(url) => {
            onPick(url);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}

function GifPanel({ onPick }: { onPick: (url: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGifSearchInfinite(debounced);

  const results = data?.results ?? [];

  return (
    <View style={styles.panel}>
      <View style={styles.searchRow}>
        <Search size={16} color={c.textSubtle} />
        <TextInput
          style={styles.search}
          value={term}
          onChangeText={setTerm}
          placeholder="Search GIPHY"
          placeholderTextColor={c.textSubtle}
          accessibilityLabel="Search for a GIF"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {isPending ? (
        <View style={styles.state}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : isError ? (
        <Text style={styles.stateText}>
          {/* The one failure worth naming: a deployment with no GIPHY key. */}
          {isUnavailable(error) ? 'GIF search is not available here.' : 'Could not load GIFs.'}
        </Text>
      ) : results.length === 0 ? (
        <Text style={styles.stateText}>No GIFs for “{debounced}”.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(gif) => gif.id}
          numColumns={COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={c.accent} />
            ) : null
          }
          renderItem={({ item }) => <GifCell gif={item} onPick={onPick} />}
        />
      )}

      {/* GIPHY's terms require this attribution wherever results are shown. */}
      <Text style={styles.attribution}>Powered by GIPHY</Text>
    </View>
  );
}

function GifCell({ gif, onPick }: { gif: GifResult; onPick: (url: string) => void }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      onPress={() => onPick(gif.url)}
      accessibilityLabel={gif.description || 'GIF'}
      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
    >
      <Image
        source={{ uri: gif.preview_url }}
        // The intrinsic ratio, so the grid does not crop the subject out of
        // half the results — the subject is the entire reason somebody picked
        // that GIF.
        style={[
          styles.image,
          { aspectRatio: gif.width && gif.height ? gif.width / gif.height : 1 },
        ]}
        resizeMode="cover"
      />
    </Pressable>
  );
}

/** Whether this failure is "the server has no GIF search" rather than a fault. */
function isUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'FEATURE_UNAVAILABLE'
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    title: {
      color: c.textSubtle,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.sm,
    },
    panel: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
      gap: Spacing.sm,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceMuted,
    },
    search: {
      flex: 1,
      paddingVertical: Spacing.sm,
      color: c.text,
      fontSize: 15,
    },
    grid: {
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    row: {
      gap: Spacing.sm,
    },
    cell: {
      flex: 1,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: c.surfaceMuted,
    },
    cellPressed: {
      opacity: 0.7,
    },
    image: {
      width: '100%',
    },
    state: {
      minHeight: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      minHeight: 120,
      color: c.textSubtle,
      fontSize: 14,
      textAlign: 'center',
      textAlignVertical: 'center',
      paddingVertical: Spacing.xl,
    },
    footer: {
      paddingVertical: Spacing.md,
    },
    attribution: {
      color: c.textSubtle,
      fontSize: 11,
      textAlign: 'right',
    },
  });
