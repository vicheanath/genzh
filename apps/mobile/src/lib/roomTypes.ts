import {
  Compass,
  Flame,
  Gamepad2,
  Hash,
  Heart,
  HelpCircle,
  Lock,
  Mic,
  Palette,
  Radio,
  Shuffle,
  Sparkles,
  Tag,
  Users,
  Video,
  Vote,
  Zap,
} from 'lucide-react-native';
import type { RoomFamily, RoomType } from '@genzh/shared';

/**
 * What each kind of room is called, what pillar it belongs to, and what it looks like.
 */
export const ROOM_TYPES: ReadonlyArray<{
  type: RoomType;
  family: RoomFamily;
  label: string;
  description: string;
  icon: typeof Hash;
}> = [
  // 💬 Conversation Pillar
  {
    type: 'text',
    family: 'conversation',
    label: 'Chat',
    description: 'Post messages, links, and media',
    icon: Hash,
  },
  {
    type: 'voice',
    family: 'conversation',
    label: 'Voice & screen',
    description: 'Drop-in audio chat & screen share',
    icon: Mic,
  },
  {
    type: 'video',
    family: 'conversation',
    label: 'Video grid',
    description: 'Group video calls and face-to-face hangouts',
    icon: Video,
  },
  {
    type: 'stage',
    family: 'conversation',
    label: 'Stage',
    description: 'Moderated audience broadcast stage',
    icon: Radio,
  },

  // 🎮 Social Games Pillar
  {
    type: 'truth_or_dare',
    family: 'social_games',
    label: 'Truth / Dare',
    description: 'Spin the wheel, spicy prompts & hilarious dares',
    icon: Sparkles,
  },
  {
    type: 'would_you_rather',
    family: 'social_games',
    label: 'Would You Rather',
    description: 'Vote on impossible dilemmas with live splits',
    icon: Shuffle,
  },
  {
    type: 'hot_takes',
    family: 'social_games',
    label: 'Hot Takes',
    description: 'Spicy opinions and live agreement meter',
    icon: Flame,
  },
  {
    type: 'poll',
    family: 'social_games',
    label: 'Live poll',
    description: 'Interactive audience votes and real-time bars',
    icon: Vote,
  },
  {
    type: 'trivia',
    family: 'social_games',
    label: 'Trivia quiz',
    description: 'Fast-paced timed Q&A with leaderboards',
    icon: HelpCircle,
  },
  {
    type: 'debate',
    family: 'social_games',
    label: 'Debate arena',
    description: 'Structured 2-sided showdowns with live voting',
    icon: Flame,
  },
  {
    type: 'guess_who',
    family: 'social_games',
    label: 'Guess Who',
    description: '20 questions & secret persona deduction',
    icon: Users,
  },
  {
    type: 'game',
    family: 'social_games',
    label: 'Party games',
    description: 'Spontaneous mini-games suite',
    icon: Gamepad2,
  },
  {
    type: 'activity',
    family: 'social_games',
    label: 'Activity lounge',
    description: 'Interactive canvas & chill games',
    icon: Palette,
  },

  // 🧭 Social Discovery Pillar
  {
    type: 'random_chat',
    family: 'social_discovery',
    label: 'Random chat',
    description: 'Instant speed roulette with skip & next',
    icon: Zap,
  },
  {
    type: 'anonymous_chat',
    family: 'social_discovery',
    label: 'Anonymous chat',
    description: 'Blind identities with playful avatars',
    icon: Lock,
  },
  {
    type: 'match_interest',
    family: 'social_discovery',
    label: 'Match by interest',
    description: 'Connect with people by shared tags',
    icon: Tag,
  },
  {
    type: 'friend_finder',
    family: 'social_discovery',
    label: 'Friend finder',
    description: 'Discover new friends with icebreakers',
    icon: Heart,
  },
  {
    type: 'topic_room',
    family: 'social_discovery',
    label: 'Topic rooms',
    description: 'Dynamic drop-in lounges for hot topics',
    icon: Compass,
  },
  {
    type: 'confession',
    family: 'social_discovery',
    label: 'Confessions',
    description: 'Drop secrets and read community truths',
    icon: Lock,
  },
  {
    type: 'quick_chat',
    family: 'social_discovery',
    label: 'Speed chat',
    description: 'Fast timed 1-on-1 chats',
    icon: Zap,
  },
];

export const CHANNEL_GROUPS: ReadonlyArray<{
  family: RoomFamily;
  heading: string;
  types: readonly RoomType[];
}> = [
  {
    family: 'conversation',
    heading: 'Conversation',
    types: ['text', 'voice', 'video', 'stage'],
  },
  {
    family: 'social_games',
    heading: 'Social Games',
    types: [
      'truth_or_dare',
      'would_you_rather',
      'hot_takes',
      'poll',
      'trivia',
      'debate',
      'guess_who',
      'game',
      'activity',
    ],
  },
  {
    family: 'social_discovery',
    heading: 'Social Discovery',
    types: [
      'random_chat',
      'anonymous_chat',
      'match_interest',
      'friend_finder',
      'topic_room',
      'confession',
      'quick_chat',
    ],
  },
];

export function roomTypeIcon(type: RoomType): typeof Hash {
  return ROOM_TYPES.find((entry) => entry.type === type)?.icon ?? Hash;
}

export function roomTypeLabel(type: RoomType): string {
  return ROOM_TYPES.find((entry) => entry.type === type)?.label ?? type.replace(/_/g, ' ');
}

export function roomTypeDescription(type: RoomType): string {
  return ROOM_TYPES.find((entry) => entry.type === type)?.description ?? '';
}

/** Rooms whose whole point is a live experience rather than a transcript. */
export const EXPERIENCE_TYPES: ReadonlyArray<RoomType> = [
  'truth_or_dare',
  'would_you_rather',
  'hot_takes',
  'poll',
  'trivia',
  'debate',
  'guess_who',
  'game',
  'activity',
  'random_chat',
  'anonymous_chat',
  'match_interest',
  'friend_finder',
  'topic_room',
  'confession',
  'quick_chat',
];

export function isExperienceRoom(type: RoomType): boolean {
  return EXPERIENCE_TYPES.includes(type);
}

export const ROOM_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'random', label: '🎲 Random' },
  { value: 'gaming', label: '🎮 Gaming' },
  { value: 'debate', label: '🔥 Debates' },
  { value: 'confession', label: '🤫 Confessions' },
  { value: 'tech', label: '💻 Tech & code' },
  { value: 'music', label: '🎵 Music' },
  { value: 'art', label: '🎨 Art' },
  { value: 'memes', label: '😂 Memes' },
];
