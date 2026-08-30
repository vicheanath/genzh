import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Check, Sparkles, Zap } from 'lucide-react-native';
import {
  useBalanceQuery,
  usePurchaseMutation,
  useStoreItemsQuery,
  type ItemType,
  type StoreListing,
} from '@genzh/shared';

import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonRows } from '../../../components/Skeleton';
import { Tabs } from '../../../components/Tabs';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/useConfirm';
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
 * The catalog.
 *
 * Every tile answers the same three questions in the same order — what is it,
 * what does it cost, can you have it — and the third is the one the server has
 * already decided: a `StoreListing` carries `owned`, `equipped` and `in_stock`
 * alongside the item. Cross-referencing the inventory to work that out (which
 * is what this screen used to do, against a field that did not exist) is both
 * slower and capable of disagreeing with the server.
 */
export function StoreView() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [filter, setFilter] = useState<Filter>('all');

  const balanceQuery = useBalanceQuery(token);
  const storeQuery = useStoreItemsQuery(token);
  const purchase = usePurchaseMutation(token);

  const balance = balanceQuery.data?.balance ?? 0;

  /*
   * Filtered here rather than refetched per tab.
   *
   * The endpoint takes an `item_type`, but the catalog is small and staff-sized
   * — asking the server again for a subset it already sent means a spinner on
   * every chip press, for a filter that should feel like nothing at all.
   */
  const items = useMemo(() => {
    const all = storeQuery.data ?? [];
    return filter === 'all' ? all : all.filter((item) => item.item_type === filter);
  }, [storeQuery.data, filter]);

  async function buy(item: StoreListing) {
    if (item.owned) return;

    if (balance < item.price_points) {
      toast.error(
        'Not enough points',
        `${item.name} costs ${item.price_points}; you have ${balance}.`,
      );
      return;
    }

    // Points are spent for good, and a mis-tap on a grid of tiles is easy —
    // the web asks too.
    const ok = await confirm({
      title: `Buy ${item.name}?`,
      description: `This costs ${item.price_points} points. You will have ${balance - item.price_points} left.`,
      confirmLabel: 'Buy',
    });
    if (!ok) return;

    try {
      await purchase.mutateAsync(item.id);
      toast.success(`${item.name} is yours`, 'Wear it from the Studio tab.');
    } catch {
      toast.error('Could not complete the purchase');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Tabs value={filter} onValueChange={setFilter} scrollable items={FILTERS} />
      </View>

      {storeQuery.isLoading ? (
        <View style={styles.loading}>
          <SkeletonRows rows={4} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={storeQuery.isFetching && !storeQuery.isLoading}
              onRefresh={() => void storeQuery.refetch()}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Sparkles size={26} color={c.textSubtle} />}
              title={filter === 'all' ? 'The store is empty' : `No ${slotLabel(filter as ItemType).toLowerCase()} yet`}
              description={
                filter === 'all'
                  ? 'There is no seeded catalog — items appear here once staff add them in the console.'
                  : 'Try another slot, or check back later.'
              }
            />
          }
          renderItem={({ item }) => {
            const rarity = rarityTone(item.rarity, c);
            const affordable = balance >= item.price_points;

            return (
              <View style={styles.cell}>
                <View style={[styles.card, item.owned && { borderColor: c.accent }]}>
                  <ItemPreview item={item} size={104} />

                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rarity, { color: rarity.ink }]}>
                      {item.rarity} · {slotLabel(item.item_type)}
                    </Text>
                  </View>

                  <View style={styles.footer}>
                    <View style={styles.price}>
                      <Zap size={12} color={c.accentText} />
                      <Text style={styles.priceText}>{item.price_points}</Text>
                    </View>

                    {item.owned ? (
                      <View style={styles.owned}>
                        <Check size={12} color={c.accentText} />
                        <Text style={styles.ownedText}>Owned</Text>
                      </View>
                    ) : !item.in_stock ? (
                      <Badge text="Sold out" tone="danger" />
                    ) : (
                      <Button
                        title="Buy"
                        size="sm"
                        variant={affordable ? 'primary' : 'subtle'}
                        disabled={!affordable}
                        loading={purchase.isPending && purchase.variables === item.id}
                        onPress={() => void buy(item)}
                      />
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
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
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      marginTop: 'auto',
    },
    price: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: c.accentSubtle,
    },
    priceText: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '800',
    },
    owned: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: c.accentSubtle,
    },
    ownedText: {
      color: c.accentText,
      fontSize: 11,
      fontWeight: '800',
    },
  });
