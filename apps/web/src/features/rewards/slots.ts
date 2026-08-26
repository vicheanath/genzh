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
    case 'name_font':
      return 'Name typeface'
    case 'title':
      return 'Prestige title'
    case 'avatar_effect':
      return 'Avatar effect'
    case 'chat_bubble':
      return 'Chat bubble'
  }
}

/** Detailed description of what this slot customizes. */
export function slotDescription(slot: ItemType): string {
  switch (slot) {
    case 'frame':
      return 'Luminous or animated border ring around your avatar'
    case 'badge':
      return 'Distinctive badge icon displayed beside your name'
    case 'banner':
      return 'Header background banner displayed across your profile card'
    case 'name_color':
      return 'Vivid gradient or glowing paint applied to your display name'
    case 'name_font':
      return 'Unique typeface, spacing, and styling for your name'
    case 'title':
      return 'Prestige tag and flair shown prominently beside your name'
    case 'avatar_effect':
      return 'Magical particles, auras, or animated energy floating around your avatar'
    case 'chat_bubble':
      return 'Custom glowing outline and background tint for your chat messages'
  }
}
