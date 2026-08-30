import type {
  EquipInput,
  EquippedCosmetics,
  ItemRarity,
  ItemType,
  StoreItem,
} from '@genzh/shared';

import type { Palette } from '../../theme/tokens';

/**
 * The eight cosmetic slots, as data.
 *
 * Three screens need this list and each of them used to carry its own copy,
 * spelled differently — which is how the studio ended up asking to equip a slot
 * the store had never heard of. The `field` column is the part that cannot be
 * derived: the equip endpoint names each slot with its own key rather than
 * taking a slot and an id, so the mapping has to be written down once.
 */
export interface SlotInfo {
  id: ItemType;
  label: string;
  /** The short form, for a filter strip where the label has to fit. */
  short: string;
  glyph: string;
  field: keyof EquipInput;
}

export const SLOTS: ReadonlyArray<SlotInfo> = [
  { id: 'frame', label: 'Frame', short: 'Frame', glyph: '🖼️', field: 'frame_item_id' },
  { id: 'badge', label: 'Badge', short: 'Badge', glyph: '🎖️', field: 'badge_item_id' },
  { id: 'banner', label: 'Banner', short: 'Banner', glyph: '📜', field: 'banner_item_id' },
  {
    id: 'name_color',
    label: 'Name colour',
    short: 'Colour',
    glyph: '🎨',
    field: 'name_color_item_id',
  },
  { id: 'name_font', label: 'Name font', short: 'Font', glyph: '✏️', field: 'name_font_item_id' },
  { id: 'title', label: 'Title', short: 'Title', glyph: '👑', field: 'title_item_id' },
  {
    id: 'avatar_effect',
    label: 'Avatar effect',
    short: 'Effect',
    glyph: '✨',
    field: 'avatar_effect_item_id',
  },
  {
    id: 'chat_bubble',
    label: 'Chat bubble',
    short: 'Bubble',
    glyph: '💬',
    field: 'chat_bubble_item_id',
  },
];

export function slotInfo(type: ItemType): SlotInfo | undefined {
  return SLOTS.find((slot) => slot.id === type);
}

export function slotLabel(type: ItemType): string {
  return slotInfo(type)?.label ?? type;
}

/**
 * What is in one slot right now.
 *
 * `EquippedCosmetics` is a record with one field per slot rather than a list of
 * `{ slot, item }` pairs, so reading it by slot needs the same mapping the
 * writes do. Going through `SLOTS` keeps the two in step.
 */
export function equippedIn(
  equipped: EquippedCosmetics | undefined,
  type: ItemType,
): StoreItem | null {
  if (!equipped) return null;
  return (equipped[type] as StoreItem | null | undefined) ?? null;
}

/**
 * The body for wearing or removing one thing.
 *
 * An omitted key leaves a slot alone and an explicit `null` clears it, so this
 * always sends exactly one key: equipping a frame must not silently strip the
 * badge, which is what sending the whole record would do.
 */
export function equipPayload(type: ItemType, itemId: string | null): EquipInput {
  const info = slotInfo(type);
  if (!info) return {};
  return { [info.field]: itemId } as EquipInput;
}

/**
 * Rarity as colour.
 *
 * Presentation only — rarity gates nothing, and these are the same four steps
 * the web's `--rarity-tint` uses, translated to the mobile palette. Common
 * deliberately gets the neutral surface rather than a colour: if every rarity
 * is tinted, none of them reads as special.
 */
export function rarityTone(rarity: ItemRarity, c: Palette) {
  switch (rarity) {
    case 'legendary':
      return { tint: 'rgba(245, 158, 11, 0.15)', ink: '#f59e0b', edge: 'rgba(245, 158, 11, 0.45)' };
    case 'epic':
      return { tint: 'rgba(168, 85, 247, 0.14)', ink: '#a855f7', edge: 'rgba(168, 85, 247, 0.42)' };
    case 'rare':
      return { tint: 'rgba(56, 189, 248, 0.12)', ink: '#38bdf8', edge: 'rgba(56, 189, 248, 0.4)' };
    default:
      return { tint: c.surfaceMuted, ink: c.textSubtle, edge: c.border };
  }
}

/**
 * The glyph to draw for an item that has no artwork.
 *
 * Staff type `style_config` as free-form JSON in the console, so an item may
 * carry an emoji, a colour, or nothing at all. Falling back to the slot's own
 * glyph means an unstyled item still looks like the kind of thing it is,
 * instead of every tile in the catalog showing the same sparkle.
 */
export function itemGlyph(item: StoreItem): string {
  return item.style_config?.icon ?? slotInfo(item.item_type)?.glyph ?? '✨';
}

/** The colour an item paints itself with, when it names one. */
export function itemTint(item: StoreItem): string | null {
  return item.style_config?.color ?? item.style_config?.glow ?? null;
}
