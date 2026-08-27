import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gift, Zap } from 'lucide-react-native';
import { useBalanceQuery, useStoreItemsQuery, useInventoryQuery, usePurchaseMutation } from '@genzh/shared';

import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ToggleGroup } from '../../components/ToggleGroup';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

const COSMETIC_TYPES = [
  { value: null, label: 'All' },
  { value: 'frame', label: 'Frame' },
  { value: 'badge', label: 'Badge' },
  { value: 'banner', label: 'Banner' },
  { value: 'name_color', label: 'Name Color' },
  { value: 'name_font', label: 'Name Font' },
  { value: 'title', label: 'Title' },
  { value: 'avatar_effect', label: 'Avatar Effect' },
  { value: 'chat_bubble', label: 'Chat Bubble' },
];

export function StoreScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();

  const [selectedType, setSelectedType] = useState<string | null>(null);

  const balanceQuery = useBalanceQuery(token);
  const storeQuery = useStoreItemsQuery(token);
  const inventoryQuery = useInventoryQuery(token);
  const purchaseMutation = usePurchaseMutation(token);

  const balance = balanceQuery.data;
  const allItems = storeQuery.data || [];
  const ownedIds = new Set((inventoryQuery.data || []).map((item) => item.id));

  const filteredItems = selectedType
    ? allItems.filter((item) => item.cosmetic_type === selectedType)
    : allItems;

  async function handlePurchase(itemId: string, price: number) {
    if (ownedIds.has(itemId)) {
      toast.info('You already own this item');
      return;
    }
    if (!balance || balance.balance < price) {
      toast.error('Not enough points');
      return;
    }

    try {
      await purchaseMutation.mutateAsync(itemId);
      toast.success('Item purchased!');
      await inventoryQuery.refetch();
      await balanceQuery.refetch();
    } catch (err) {
      toast.error('Could not purchase item');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Cosmetics Store"
        subtitle={`${balance?.balance || 0} points`}
        actions={<Gift size={20} color={c.accent} />}
      />

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ToggleGroup
          mode="single"
          value={[selectedType ?? 'all']}
          onValueChange={(next) => {
            const val = next[0];
            setSelectedType(val === 'all' ? null : (val as string));
          }}
          items={COSMETIC_TYPES.map((t) => ({
            value: t.value ?? 'all',
            label: t.label,
          }))}
        />
      </View>

      {/* Store Grid */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.grid}
        refreshControl={
          <RefreshControl
            refreshing={storeQuery.isLoading}
            onRefresh={() => void storeQuery.refetch()}
            tintColor={c.accent}
          />
        }
        renderItem={({ item }) => {
          const owned = ownedIds.has(item.id);
          const canAfford = balance && balance.balance >= item.price;

          return (
            <View style={styles.itemWrapper}>
              <View
                style={[
                  styles.itemCard,
                  owned && styles.itemOwned,
                ]}
              >
                <View style={styles.itemPreview}>
                  <Gift size={40} color={owned ? c.accent : c.textMuted} />
                </View>

                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>

                <Text style={styles.itemType}>
                  {item.cosmetic_type}
                </Text>

                <View style={styles.itemFooter}>
                  <View style={styles.priceTag}>
                    <Zap size={12} color={c.live} />
                    <Text style={styles.price}>{item.price}</Text>
                  </View>

                  {!owned && (
                    <Pressable
                      onPress={() => handlePurchase(item.id, item.price)}
                      disabled={!canAfford || purchaseMutation.isPending}
                      style={({ pressed }) => [
                        styles.buyButton,
                        !canAfford && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.buyText}>
                        {purchaseMutation.isPending ? '...' : 'Buy'}
                      </Text>
                    </Pressable>
                  )}

                  {owned && (
                    <View style={styles.ownedBadge}>
                      <Text style={styles.ownedText}>Owned</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
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
    filtersContainer: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    list: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    grid: {
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    itemWrapper: {
      flex: 0.5,
    },
    itemCard: {
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      justifyContent: 'space-between',
    },
    itemOwned: {
      borderColor: c.accent,
      backgroundColor: c.accentSubtle,
    },
    itemPreview: {
      height: 100,
      borderRadius: Radius.md,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    itemName: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: Spacing.xs,
    },
    itemType: {
      color: c.textMuted,
      fontSize: 11,
      marginBottom: Spacing.md,
    },
    itemFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    priceTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.full,
      backgroundColor: c.accentSubtle,
    },
    price: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '600',
    },
    buyButton: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      backgroundColor: c.accent,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.8,
    },
    buyText: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '600',
    },
    ownedBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      backgroundColor: c.accentSubtle,
    },
    ownedText: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '600',
    },
  });
