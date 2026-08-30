import {
  CompassIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  HeartIcon,
  HelpCircleIcon,
  LockIcon,
  MicIcon,
  PaletteIcon,
  RadioIcon,
  ShuffleIcon,
  SparkleIcon,
  TagIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import type { RoomFamily, RoomType } from '@/lib/api'

/**
 * What each kind of room is called, what pillar it belongs to, and what it
 * looks like.
 *
 * The one place any of that is decided. It used to be three: this table, a
 * `PILLAR_GROUPS` in the create dialog, and a `ROOM_ICONS` map in the room
 * header — and they had drifted apart, so the same room genuinely changed
 * appearance depending on which screen you were looking at. A "Would You
 * Rather" room was a shuffle in the feed and a sparkle in its own header;
 * trivia and match-by-interest had the same problem. Anything that needs an
 * icon or a label for a room type reads it from here.
 *
 * Mirrors `apps/mobile/src/lib/roomTypes.ts`. Room types are a server concept,
 * so both clients name the same set — what differs is only which icon library
 * draws them.
 */
export const ROOM_TYPES: ReadonlyArray<{
  type: RoomType
  family: RoomFamily
  label: string
  icon: typeof HashIcon
}> = [
  // 💬 Conversation
  { type: 'text', family: 'conversation', label: 'Chat', icon: HashIcon },
  { type: 'voice', family: 'conversation', label: 'Voice & screen', icon: MicIcon },
  { type: 'video', family: 'conversation', label: 'Video grid', icon: VideoIcon },
  { type: 'stage', family: 'conversation', label: 'Stage', icon: RadioIcon },

  // 🎮 Social Games
  { type: 'truth_or_dare', family: 'social_games', label: 'Truth / Dare', icon: SparkleIcon },
  { type: 'would_you_rather', family: 'social_games', label: 'Would You Rather', icon: ShuffleIcon },
  { type: 'hot_takes', family: 'social_games', label: 'Hot Takes', icon: FlameIcon },
  { type: 'poll', family: 'social_games', label: 'Live poll', icon: VoteIcon },
  { type: 'trivia', family: 'social_games', label: 'Trivia quiz', icon: HelpCircleIcon },
  { type: 'debate', family: 'social_games', label: 'Debate arena', icon: FlameIcon },
  { type: 'guess_who', family: 'social_games', label: 'Guess Who', icon: UsersIcon },
  { type: 'game', family: 'social_games', label: 'Party games', icon: GamepadIcon },
  { type: 'activity', family: 'social_games', label: 'Activity lounge', icon: PaletteIcon },

  // 🧭 Social Discovery
  { type: 'random_chat', family: 'social_discovery', label: 'Random chat', icon: ZapIcon },
  { type: 'anonymous_chat', family: 'social_discovery', label: 'Anonymous chat', icon: LockIcon },
  { type: 'match_interest', family: 'social_discovery', label: 'Match by interest', icon: TagIcon },
  { type: 'friend_finder', family: 'social_discovery', label: 'Friend finder', icon: HeartIcon },
  { type: 'topic_room', family: 'social_discovery', label: 'Topic rooms', icon: CompassIcon },
  { type: 'confession', family: 'social_discovery', label: 'Confessions', icon: LockIcon },
  { type: 'quick_chat', family: 'social_discovery', label: 'Speed chat', icon: ZapIcon },
]

/** The three pillars, in the order the create dialog offers them. */
export const ROOM_FAMILIES: ReadonlyArray<{
  family: RoomFamily
  label: string
  emoji: string
  /** What picking this pillar gets you, shown under the tabs. */
  blurb: string
}> = [
  {
    family: 'conversation',
    label: 'Talk',
    emoji: '💬',
    blurb: 'A room to say things in — by text, voice, or camera.',
  },
  {
    family: 'social_games',
    label: 'Play',
    emoji: '🎮',
    blurb: 'A room with a game running in it. Everyone joins mid-round.',
  },
  {
    family: 'social_discovery',
    label: 'Meet',
    emoji: '🧭',
    blurb: 'A room for strangers. Matched on a topic, or on nothing at all.',
  },
]

/**
 * The topics a room can be filed under.
 *
 * `category` is a free-form string on the server, so this list *is* the
 * taxonomy — which is why it has to be one list. It was two: the feed's filter
 * row and the create dialog's dropdown, and the dialog offered an "Art"
 * category the feed had no filter for. Every room anybody filed under Art was
 * unreachable by browsing the moment it was made.
 */
export const ROOM_CATEGORIES: ReadonlyArray<{ key: string; label: string; emoji: string }> = [
  { key: 'random', label: 'Random', emoji: '🎲' },
  { key: 'gaming', label: 'Gaming', emoji: '🎮' },
  { key: 'debate', label: 'Debates', emoji: '🔥' },
  { key: 'confession', label: 'Confessions', emoji: '🤫' },
  { key: 'music', label: 'Music', emoji: '🎵' },
  { key: 'art', label: 'Art', emoji: '🎨' },
  { key: 'memes', label: 'Memes', emoji: '😂' },
  { key: 'tech', label: 'Tech', emoji: '💻' },
]

export function roomTypeIcon(type: RoomType): typeof HashIcon {
  return ROOM_TYPES.find((entry) => entry.type === type)?.icon ?? HashIcon
}

export function roomTypeLabel(type: RoomType): string {
  return ROOM_TYPES.find((entry) => entry.type === type)?.label ?? type.replace(/_/g, ' ')
}

export function roomTypesIn(family: RoomFamily) {
  return ROOM_TYPES.filter((entry) => entry.family === family)
}

export function roomCategoryLabel(key: string | null | undefined): string | null {
  if (!key) return null
  const found = ROOM_CATEGORIES.find((entry) => entry.key === key)
  return found ? `${found.emoji} ${found.label}` : null
}
