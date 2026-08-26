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

export function roomTypeIcon(type: RoomType): typeof HashIcon {
  return ROOM_TYPES.find((entry) => entry.type === type)?.icon ?? HashIcon
}

export function roomTypeLabel(type: RoomType): string {
  return ROOM_TYPES.find((entry) => entry.type === type)?.label ?? type.replace(/_/g, ' ')
}
