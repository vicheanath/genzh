import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ShoppingBag, X } from 'lucide-react-native';
import {
  useEquipMutation,
  useEquippedQuery,
  useInventoryQuery,
  type ItemType,
} from '@genzh/shared';

import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonRows } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../context/AuthContext';
import { ItemPreview } from '../../../features/rewards/ItemPreview';
import { SLOTS, equipPayload, equippedIn, slotInfo } from '../../../features/rewards/cosmetics';
import { Radius, Spacing, type Palette } from '../../../theme/tokens';
import { useThemedStyles, useColors } from '../../../theme/ThemeContext';

/**
 * The dressing room: one slot at a time, everything you own for it.
 *
 * The equip endpoint takes one key per slot rather than a `{ slot, item }`
 * pair, which is the detail this screen used to get wrong — it sent a shape the
 * server has never accepted, so nothing here has ever equipped anything. The
 * mapping now lives once, in `features/rewards/cosmetics`, and both the read
 * and the write go through it.
 *
 * Sending exactly one key matters beyond correctness: an omitted key leaves its
 * slot alone, so putting on a frame cannot quietly take off a badge.
 */
export function StudioView() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token, user } = useAuth();
  const toast = useToast();

  const [slot, setSlot] = useState<ItemType>('frame');

  const inventoryQuery = useInventoryQuery(token);
  const equippedQuery = useEquippedQuery(token);
  const equip = useEquipMutation(token);

  const equipped = equippedQuery.data;
  const wornHere = equippedIn(equipped, slot);
  const current = slotInfo(slot);

  const owned = useMemo(
    () => (inventoryQuery.data ?? []).filter((entry) => entry.item.item_type === slot),
    [inventoryQuery.data, slot],
  );

  async function wear(itemId: string | null, name: string) {
    try {
      await equip.mutateAsync(equipPayload(slot, itemId));
      toast.success(itemId ? `Wearing ${name}` : `${current?.label ?? 'Slot'} cleared`);
    } catch {
      toast.error(itemId ? 'Could not equip that' : 'Could not clear the slot');
    }
  }

  if (inventoryQuery.isLoading || equippedQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <SkeletonRows rows={4} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* What the rest of the app sees. A real avatar rather than an emoji
          placeholder, because the whole point of the screen is how this looks
          to somebody else. */}
      <View style={styles.preview}>
        <Avatar
          name={user?.profile.display_name || user?.handle || 'You'}
          url={user?.profile.avatar_url}
          accent={user?.profile.accent_color}
          size={104}
        />
        <Text style={styles.previewName}>{user?.profile.display_name || user?.handle}</Text>
        <Text style={styles.previewHint}>
          {equipped
            ? `${SLOTS.filter((s) => equippedIn(equipped, s.id)).length} of ${SLOTS.length} slots filled`
            : 'Nothing equipped yet'}
        </Text>
      </View>

      {/* Every slot at once, so what is empty is as visible as what is not. */}
      <View style={styles.slots}>
        {SLOTS.map((info) => {
          const worn = equippedIn(equipped, info.id);
          const active = slot === info.id;
          return (
            <Pressable
              key={info.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${info.label}${worn ? `, wearing ${worn.name}` : ', empty'}`}
              onPress={() => setSlot(info.id)}
              style={({ pressed }) => [
                styles.slot,
                active && { borderColor: c.accent, backgroundColor: c.accentSubtle },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.slotGlyph}>{info.glyph}</Text>
              <Text style={styles.slotLabel} numberOfLines={1}>
                {info.short}
              </Text>
              {worn ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.header}>
        <Text style={styles.heading}>{current?.label}</Text>
        {wornHere ? (
          <Button
            title="Take off"
            size="sm"
            variant="ghost"
            icon={<X size={14} color={c.danger} />}
            onPress={() => void wear(null, wornHere.name)}
            loading={equip.isPending}
          />
        ) : null}
      </View>

      {owned.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={24} color={c.textSubtle} />}
          title={`No ${current?.label.toLowerCase()} owned`}
          description="Buy one in the Store tab and it will show up here."
        />
      ) : (
        <View style={styles.list}>
          {owned.map((entry) => {
            const isWorn = wornHere?.id === entry.item.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isWorn }}
                disabled={isWorn || equip.isPending}
                onPress={() => void wear(entry.item.id, entry.item.name)}
                style={({ pressed }) => [
                  styles.row,
                  isWorn && { borderColor: c.accent, backgroundColor: c.accentSubtle },
                  pressed && styles.pressed,
                ]}
              >
                <ItemPreview item={entry.item} size={52} style={styles.rowArt} />

                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.item.name}
                  </Text>
                  <Text style={styles.rowRarity} numberOfLines={1}>
                    {entry.item.rarity}
                  </Text>
                </View>

                {isWorn ? (
                  <Check size={18} color={c.accentText} />
                ) : (
                  <Text style={styles.wearHint}>Wear</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    loading: {
      padding: Spacing.lg,
    },
    content: {
      padding: Spacing.md,
      paddingBottom: Spacing.xxl * 2,
      gap: Spacing.lg,
    },
    preview: {
      alignItems: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.lg,
      backgroundColor: c.surface,
      borderRadius: Radius.xxl,
      borderWidth: 1,
      borderColor: c.border,
    },
    previewName: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
      marginTop: Spacing.sm,
    },
    previewHint: {
      color: c.textSubtle,
      fontSize: 12,
    },
    slots: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    slot: {
      width: '23%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xs,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    slotGlyph: {
      fontSize: 20,
    },
    slotLabel: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.1,
    },
    dot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 6,
      height: 6,
      borderRadius: Radius.full,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 32,
    },
    heading: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    list: {
      gap: Spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowArt: {
      width: 52,
    },
    rowText: {
      flex: 1,
      gap: 1,
    },
    rowName: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
    },
    rowRarity: {
      color: c.textSubtle,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    wearHint: {
      color: c.accentText,
      fontSize: 12,
      fontWeight: '800',
    },
    pressed: {
      opacity: 0.75,
    },
  });
