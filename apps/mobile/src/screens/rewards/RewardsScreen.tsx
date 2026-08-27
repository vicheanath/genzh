import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gift, Sparkles, Zap } from 'lucide-react-native';
import { useBalanceQuery, useDailyCheckinMutation, useStoreItemsQuery, useInventoryQuery, usePurchaseMutation } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';
import { ToggleGroup } from '../../components/ToggleGroup';

type TabType = 'store' | 'inventory';

export function RewardsScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token, getToken } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<TabType>('store');
  const [checkingIn, setCheckingIn] = useState(false);

  const balanceQuery = useBalanceQuery(token);
  const dailyCheckinMutation = useDailyCheckinMutation(token);
  const storeQuery = useStoreItemsQuery(token);
  const inventoryQuery = useInventoryQuery(token);
  const purchaseMutation = usePurchaseMutation(token);

  const balance = balanceQuery.data;
  const storeItems = storeQuery.data || [];
  const inventoryItems = inventoryQuery.data || [];
  const ownedIds = new Set(inventoryItems.map((item) => item.id));

  async function handleDailyCheckin() {
    if (checkingIn || !balance || balance.last_checkin_at) return;

    setCheckingIn(true);
    try {
      await dailyCheckinMutation.mutateAsync();
      toast.success('Check-in successful! +50 points');
      await balanceQuery.refetch();
    } catch (err) {
      toast.error('Could not check in today');
    } finally {
      setCheckingIn(false);
    }
  }

  async function handlePurchase(itemId: string, price: number) {
    if (ownedIds.has(itemId)) return;
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

  const refreshing = balanceQuery.isLoading;
  const canCheckin = balance && !balance.last_checkin_at;
  const todayCheckedIn = balance && balance.last_checkin_at;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Rewards"
        subtitle="Earn points, unlock cosmetics"
        actions={<Sparkles size={20} color={c.accent} />}
      />

      {/* Wallet Strip */}
      <View style={styles.wallet}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceContent}>
            <Text style={styles.balanceLabel}>Points Balance</Text>
            <Text style={styles.balanceValue}>{balance?.balance || 0}</Text>
          </View>
          <Zap size={24} color={c.live} />
        </View>

        {canCheckin && (
          <Button
            title="Daily Check-in"
            onPress={() => void handleDailyCheckin()}
            loading={checkingIn}
            style={styles.checkinButton}
          />
        )}
        {todayCheckedIn && (
          <Callout title="Check-in Complete" description="Come back tomorrow for more points" />
        )}
      </View>

      {/* Tab Navigation */}
      <ToggleGroup
        mode="single"
        value={[tab]}
        onValueChange={(next) => setTab((next[0] || 'store') as TabType)}
        items={[
          { value: 'store', label: 'Store' },
          { value: 'inventory', label: 'Owned' },
        ]}
      />

      {/* Content */}
      <FlatList
        data={tab === 'store' ? storeItems : inventoryItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void balanceQuery.refetch()}
            tintColor={c.accent}
          />
        }
        numColumns={2}
        columnWrapperStyle={styles.grid}
        renderItem={({ item }) => {
          const owned = ownedIds.has(item.id);
          const price = 'price' in item ? item.price : 0;

          return (
            <View style={styles.itemCard}>
              <View style={[styles.itemImage, owned && styles.owned]}>
                <Gift size={32} color={c.accent} />
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {owned ? 'Owned' : `${price} pts`}
              </Text>
              {tab === 'store' && !owned && (
                <Pressable
                  onPress={() => handlePurchase(item.id, price)}
                  style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}
                  disabled={!balance || balance.balance < price}
                >
                  <Text style={styles.buyButtonText}>Buy</Text>
                </Pressable>
              )}
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
    wallet: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      gap: Spacing.md,
    },
    balanceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.accentSubtle,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    balanceContent: {
      flex: 1,
    },
    balanceLabel: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '600',
      opacity: 0.8,
    },
    balanceValue: {
      color: c.accentText,
      fontSize: 28,
      fontWeight: '800',
      marginTop: 2,
    },
    checkinButton: {
      marginTop: Spacing.md,
    },
    list: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    grid: {
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    itemCard: {
      flex: 0.5,
      paddingHorizontal: Spacing.sm,
    },
    itemImage: {
      height: 120,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    owned: {
      backgroundColor: c.accentSubtle,
      borderColor: c.accent,
    },
    itemName: {
      color: c.text,
      fontSize: 12,
      fontWeight: '600',
    },
    itemPrice: {
      color: c.textMuted,
      fontSize: 11,
      marginTop: 2,
      marginBottom: Spacing.xs,
    },
    buyButton: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.md,
      backgroundColor: c.accent,
      alignItems: 'center',
    },
    pressed: {
      opacity: 0.8,
    },
    buyButtonText: {
      color: c.accentText,
      fontSize: 11,
      fontWeight: '600',
    },
  });
