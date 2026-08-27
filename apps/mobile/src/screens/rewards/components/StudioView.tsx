import React, { useState } from 'react';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Palette as PaletteIcon, Plus, X } from 'lucide-react-native';
import { useInventoryQuery, useEquippedQuery, useEquipMutation } from '@genzh/shared';

import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

const COSMETIC_SLOTS = [
  { id: 'frame', label: 'Frame', icon: '🖼️' },
  { id: 'badge', label: 'Badge', icon: '🎖️' },
  { id: 'banner', label: 'Banner', icon: '📜' },
  { id: 'name_color', label: 'Name Color', icon: '🎨' },
  { id: 'name_font', label: 'Name Font', icon: '✏️' },
  { id: 'title', label: 'Title', icon: '👑' },
  { id: 'avatar_effect', label: 'Avatar Effect', icon: '✨' },
  { id: 'chat_bubble', label: 'Chat Bubble', icon: '💬' },
];

export function StudioScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();

  const [selectedSlot, setSelectedSlot] = useState<string>('frame');
  const [showPicker, setShowPicker] = useState(false);

  const inventoryQuery = useInventoryQuery(token);
  const equippedQuery = useEquippedQuery(token);
  const equipMutation = useEquipMutation(token);

  const inventory = inventoryQuery.data || [];
  const equipped = equippedQuery.data || [];
  const equippedMap = new Map(equipped.map((e) => [e.slot, e.item_id]));

  const slotItems = inventory.filter((item) => item.cosmetic_type === selectedSlot);
  const equippedId = equippedMap.get(selectedSlot);
  const equippedItem = inventory.find((item) => item.id === equippedId);

  async function handleEquip(itemId: string, slot: string) {
    try {
      await equipMutation.mutateAsync({
        item_id: itemId,
        slot: slot as any,
      });
      await equippedQuery.refetch();
      toast.success('Equipped!');
      setShowPicker(false);
    } catch (err) {
      toast.error('Could not equip item');
    }
  }

  async function handleUnequip(slot: string) {
    try {
      await equipMutation.mutateAsync({
        item_id: null,
        slot: slot as any,
      });
      await equippedQuery.refetch();
      toast.success('Unequipped');
    } catch (err) {
      toast.error('Could not unequip item');
    }
  }

  const currentSlot = COSMETIC_SLOTS.find((s) => s.id === selectedSlot);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Outfit Studio"
        subtitle="Customize your look"
        actions={<PaletteIcon size={20} color={c.accent} />}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar Preview */}
        <View style={styles.previewSection}>
          <View style={styles.avatarPreview}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.previewHint}>Your avatar preview</Text>
        </View>

        {/* Slots Grid */}
        <Text style={styles.sectionTitle}>Cosmetic Slots</Text>
        <View style={styles.slotsGrid}>
          {COSMETIC_SLOTS.map((slot) => {
            const equipped = equippedMap.get(slot.id);
            return (
              <Pressable
                key={slot.id}
                onPress={() => setSelectedSlot(slot.id)}
                style={({ pressed }) => [
                  styles.slotButton,
                  selectedSlot === slot.id && styles.slotActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.slotIcon}>{slot.icon}</Text>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                {equipped && <View style={styles.equippedDot} />}
              </Pressable>
            );
          })}
        </View>

        {/* Current Slot */}
        {currentSlot && (
          <>
            <View style={styles.slotHeader}>
              <Text style={styles.slotTitle}>{currentSlot.label}</Text>
              {equippedItem && (
                <Pressable
                  onPress={() => void handleUnequip(selectedSlot)}
                  style={({ pressed }) => [styles.unequipButton, pressed && styles.pressed]}
                >
                  <X size={16} color={c.danger} />
                  <Text style={styles.unequipText}>Unequip</Text>
                </Pressable>
              )}
            </View>

            {equippedItem && (
              <View style={styles.equippedCard}>
                <View style={styles.equippedPreview}>
                  <Text style={styles.itemIcon}>✨</Text>
                </View>
                <View style={styles.equippedInfo}>
                  <Text style={styles.equippedName}>{equippedItem.name}</Text>
                  <Text style={styles.equippedType}>(Currently equipped)</Text>
                </View>
              </View>
            )}

            {/* Available Items */}
            <Text style={styles.availableTitle}>
              {slotItems.length} available for this slot
            </Text>
            <FlatList
              scrollEnabled={false}
              data={slotItems.filter((item) => item.id !== equippedId)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void handleEquip(item.id, selectedSlot)}
                  style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
                >
                  <View style={styles.itemRowPreview}>
                    <Text style={styles.itemIcon}>✨</Text>
                  </View>
                  <View style={styles.itemRowInfo}>
                    <Text style={styles.itemRowName}>{item.name}</Text>
                  </View>
                  <View style={styles.equipArrow}>
                    <Plus size={16} color={c.accent} />
                  </View>
                </Pressable>
              )}
              contentContainerStyle={styles.itemList}
            />
          </>
        )}
      </ScrollView>
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
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    previewSection: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    avatarPreview: {
      width: 120,
      height: 120,
      borderRadius: Radius.full,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    avatarText: {
      fontSize: 60,
    },
    previewHint: {
      color: c.textMuted,
      fontSize: 13,
    },
    sectionTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: Spacing.md,
    },
    slotsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      marginBottom: Spacing.lg,
    },
    slotButton: {
      width: '30%',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSubtle,
    },
    pressed: {
      opacity: 0.7,
    },
    slotIcon: {
      fontSize: 24,
      marginBottom: Spacing.xs,
    },
    slotLabel: {
      color: c.text,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
    equippedDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full,
      backgroundColor: c.live,
      position: 'absolute',
      top: Spacing.xs,
      right: Spacing.xs,
    },
    slotHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    slotTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600',
    },
    unequipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      backgroundColor: c.dangerSubtle,
    },
    unequipText: {
      color: c.danger,
      fontSize: 12,
      fontWeight: '600',
    },
    equippedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.accentSubtle,
      borderWidth: 1,
      borderColor: c.accent,
      marginBottom: Spacing.lg,
    },
    equippedPreview: {
      width: 60,
      height: 60,
      borderRadius: Radius.md,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    equippedInfo: {
      flex: 1,
    },
    equippedName: {
      color: c.accentText,
      fontSize: 14,
      fontWeight: '600',
    },
    equippedType: {
      color: c.accentText,
      fontSize: 12,
      opacity: 0.7,
      marginTop: 2,
    },
    availableTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: Spacing.md,
    },
    itemList: {
      gap: Spacing.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    itemRowPreview: {
      width: 50,
      height: 50,
      borderRadius: Radius.md,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemIcon: {
      fontSize: 28,
    },
    itemRowInfo: {
      flex: 1,
    },
    itemRowName: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
    },
    equipArrow: {
      padding: Spacing.sm,
    },
  });
