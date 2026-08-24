import {
  Flame,
  Gamepad2,
  Hash,
  Lock,
  Mic,
  Palette,
  Radio,
  Video,
  Vote,
  Zap,
} from 'lucide-react-native';
import type { RoomType } from '@genzh/shared';

/**
 * What each kind of room is called and what it looks like.
 *
 * One table rather than a switch in every screen: the sidebar, the discovery
 * feed, the create sheet and the room header all need the same icon for
 * `quick_chat`, and they used to each pick their own.
 */
export const ROOM_TYPES: ReadonlyArray<{
  type: RoomType;
  label: string;
  icon: typeof Hash;
}> = [
  { type: 'text', label: 'Chat', icon: Hash },
  { type: 'voice', label: 'Voice & screen', icon: Mic },
  { type: 'stage', label: 'Stage', icon: Radio },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'debate', label: 'Debate arena', icon: Flame },
  { type: 'poll', label: 'Live poll', icon: Vote },
  { type: 'game', label: 'Party games', icon: Gamepad2 },
  { type: 'confession', label: 'Confessions', icon: Lock },
  { type: 'quick_chat', label: 'Speed chat', icon: Zap },
  { type: 'activity', label: 'Activity lounge', icon: Palette },
];

export function roomTypeIcon(type: RoomType): typeof Hash {
  return ROOM_TYPES.find((entry) => entry.type === type)?.icon ?? Hash;
}

export function roomTypeLabel(type: RoomType): string {
  return ROOM_TYPES.find((entry) => entry.type === type)?.label ?? type.replace('_', ' ');
}

/** Rooms whose whole point is a live experience rather than a transcript. */
export const EXPERIENCE_TYPES: ReadonlyArray<RoomType> = [
  'poll',
  'debate',
  'game',
  'confession',
  'quick_chat',
  'activity',
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
