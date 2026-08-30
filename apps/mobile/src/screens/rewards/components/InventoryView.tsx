import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Check, ShoppingBag } from 'lucide-react-native';
import { useInventoryQuery, type ItemType } from '@genzh/shared';

import { EmptyState } from '../../../components/EmptyState';
import { SkeletonRows } from '../../../components/Skeleton';
import { Tabs } from '../../../components/Tabs';
import { useAuth } from '../../../context/AuthContext';
import { ItemPreview } from '../../../features/rewards/ItemPreview';
import { SLOTS, rarityTone, slotLabel } from '../../../features/rewards/cosmetics';
import { Radius, Spacing, type Palette } from '../../../theme/tokens';
import { useThemedStyles, useColors } from '../../../theme/ThemeContext';

type Filter = ItemType | 'all';

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  ...SLOTS.map((slot) => ({ value: slot.id as Filter, label: slot.short })),
];

/**
 * Everything this account owns.
 *
 * An `InventoryItem` is a *receipt* rather than an item — it wraps the item it
 * was bought from and adds what was paid, where it came from and whether it is
 * currently worn. So the name and the slot come from `entry.item`, and the
 * worn flag comes from the entry itself: the server has already resolved it,
 * and asking a second endpoint what is equipped only creates two answers that
 * can disagree.
 */
export function InventoryView() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();

  const [filter, setFilter] = useState<Filter>('all');

  const inventoryQuery = useInventoryQuery(token);

  const entries = useMemo(() => {
    const all = inventoryQuery.data ?? [];
    const scoped = filter === 'all' ? all : all.filter((e) => e.item.item_type === filter);
    // Worn things first, then newest. What you are wearing is what you came
    // here to look at; the rest is a shelf.
    return [...scoped].sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      return b.acquired_at.localeCompare(a.acquired_at);
    });
  }, [inventoryQuery.data, filter]);

  if (inventoryQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <SkeletonRows rows={4} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Tabs value={filter} onValueChange={setFilter} scrollable items={FILTERS} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={inventoryQuery.isFetching && !inventoryQuery.isLoading}
            onRefresh={() => void inventoryQuery.refetch()}
            tintColor={c.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<ShoppingBag size={26} color={c.textSubtle} />}
            title={filter === 'all' ? 'Nothing owned yet' : 'Nothing in this slot'}
            description={
              filter === 'all'
                ? 'Points earned from daily check-ins and activity buy cosmetics in the Store tab.'
                : 'You own nothing for this slot yet.'
            }
          />
        }
        renderItem={({ item: entry }) => {
          const rarity = rarityTone(entry.item.rarity, c);

          return (
            <View style={styles.cell}>
              <View style={[styles.card, entry.equipped && { borderColor: c.accent }]}>
                <ItemPreview item={entry.item} size={104} />

                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {entry.item.name}
                  </Text>
                  <Text style={[styles.rarity, { color: rarity.ink }]}>
                    {entry.item.rarity} · {slotLabel(entry.item.item_type)}
                  </Text>
                </View>

                {entry.equipped ? (
                  <View style={styles.worn}>
                    <Check size={12} color={c.accentText} />
                    <Text style={styles.wornText}>Worn</Text>
                  </View>
                ) : (
                  // How it was got, which is the only thing separating two
                  // copies of the same item: one bought, one given.
                  <Text style={styles.source} numberOfLines={1}>
                    {entry.source === 'purchase'
                      ? `Bought for ${entry.paid_points}`
                      : entry.source === 'grant'
                        ? 'Granted by staff'
                        : 'Earned'}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    filters: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    loading: {
      padding: Spacing.lg,
    },
    list: {
      padding: Spacing.md,
      paddingBottom: Spacing.xxl * 2,
      gap: Spacing.md,
    },
    row: {
      gap: Spacing.md,
    },
    cell: {
      flex: 1 / 2,
    },
    card: {
      flex: 1,
      borderRadius: Radius.xl,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    meta: {
      gap: 1,
    },
    name: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    rarity: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    worn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: c.accentSubtle,
      marginTop: 'auto',
    },
    wornText: {
      color: c.accentText,
      fontSize: 11,
      fontWeight: '800',
    },
    source: {
      color: c.textDim,
      fontSize: 11,
      marginTop: 'auto',
    },
  });
