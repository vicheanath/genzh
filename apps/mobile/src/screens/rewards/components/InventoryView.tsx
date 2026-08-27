import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shirt } from 'lucide-react-native';
import { useInventoryQuery, useEquippedQuery } from '@genzh/shared';

import { ScreenHeader } from '../../components/ScreenHeader';
import { ToggleGroup } from '../../components/ToggleGroup';
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

export function InventoryScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();

  const [selectedType, setSelectedType] = useState<string | null>(null);

  const inventoryQuery = useInventoryQuery(token);
  const equippedQuery = useEquippedQuery(token);

  const inventory = inventoryQuery.data || [];
  const equipped = equippedQuery.data || [];
  const equippedIds = new Set(equipped.map((e) => e.item_id));

  const filteredItems = selectedType
    ? inventory.filter((item) => item.cosmetic_type === selectedType)
    : inventory;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="My Cosmetics"
        subtitle={`${inventory.length} items owned`}
        actions={<Shirt size={20} color={c.accent} />}
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

      {/* Inventory Grid */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.grid}
        renderItem={({ item }) => {
          const isEquipped = equippedIds.has(item.id);

          return (
            <View style={styles.itemWrapper}>
              <View
                style={[
                  styles.itemCard,
                  isEquipped && styles.itemEquipped,
                ]}
              >
                <View style={styles.itemPreview}>
                  <Text style={styles.itemIcon}>✨</Text>
                </View>

                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>

                <Text style={styles.itemType}>
                  {item.cosmetic_type}
                </Text>

                {isEquipped && (
                  <View style={styles.equippedBadge}>
                    <Text style={styles.equippedText}>Equipped</Text>
                  </View>
                )}
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
    },
    itemEquipped: {
      borderColor: c.live,
      backgroundColor: c.liveSubtle,
    },
    itemPreview: {
      height: 100,
      borderRadius: Radius.md,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    itemIcon: {
      fontSize: 40,
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
    equippedBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      backgroundColor: c.live,
      alignSelf: 'flex-start',
    },
    equippedText: {
      color: 'white',
      fontSize: 11,
      fontWeight: '600',
    },
  });
