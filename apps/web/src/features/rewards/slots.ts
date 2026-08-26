import type { ItemType } from './api'

/** What to call a slot in a sentence a member reads. */
export function slotLabel(slot: ItemType): string {
  switch (slot) {
    case 'frame':
      return 'Avatar frame'
    case 'badge':
      return 'Profile badge'
    case 'banner':
      return 'Profile banner'
    case 'name_color':
      return 'Name colour'
  }
}
