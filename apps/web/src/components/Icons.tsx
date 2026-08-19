import type { LucideProps } from 'lucide-react'
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Bell,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Crown,
  Hash,
  Headphones,
  Home,
  Lock,
  LogOut,
  Menu as MenuLucide,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  Pencil,
  PhoneOff,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  Sparkles,
  Sun,
  Trash2,
  Tv,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Volume2,
  X,
} from 'lucide-react'

export interface IconProps extends LucideProps {
  size?: number | string
}

export type IconComponent = (props: IconProps) => React.JSX.Element

/* ── Navigation ─────────────────────────────────────────────────────────── */
export const HomeIcon: IconComponent = (props: IconProps) => <Home size={18} {...props} />
export const CompassIcon: IconComponent = (props: IconProps) => <Compass size={18} {...props} />
export const UsersIcon: IconComponent = (props: IconProps) => <Users size={18} {...props} />
export const MenuIcon: IconComponent = (props: IconProps) => <MenuLucide size={18} {...props} />
export const XIcon: IconComponent = (props: IconProps) => <X size={18} {...props} />
export const ChevronDownIcon: IconComponent = (props: IconProps) => <ChevronDown size={18} {...props} />
export const ArrowDownIcon: IconComponent = (props: IconProps) => <ArrowDown size={18} {...props} />
export const ArrowLeftIcon: IconComponent = (props: IconProps) => <ArrowLeft size={18} {...props} />

/* ── Rooms & Media ──────────────────────────────────────────────────────── */
export const HashIcon: IconComponent = (props: IconProps) => <Hash size={18} {...props} />
export const MicIcon: IconComponent = (props: IconProps) => <Mic size={18} {...props} />
export const MicOffIcon: IconComponent = (props: IconProps) => <MicOff size={18} {...props} />
export const VideoIcon: IconComponent = (props: IconProps) => <Video size={18} {...props} />
export const SparkleIcon: IconComponent = (props: IconProps) => <Sparkles size={18} {...props} />
export const HeadphonesIcon: IconComponent = (props: IconProps) => <Headphones size={18} {...props} />
export const PhoneOffIcon: IconComponent = (props: IconProps) => <PhoneOff size={18} {...props} />

/* ── Actions & Entities ─────────────────────────────────────────────────── */
export const PlusIcon: IconComponent = (props: IconProps) => <Plus size={18} {...props} />
export const SendIcon: IconComponent = (props: IconProps) => <Send size={18} {...props} />
export const SmileIcon: IconComponent = (props: IconProps) => <Smile size={18} {...props} />
export const PencilIcon: IconComponent = (props: IconProps) => <Pencil size={18} {...props} />
export const TrashIcon: IconComponent = (props: IconProps) => <Trash2 size={18} {...props} />
export const MoreIcon: IconComponent = (props: IconProps) => <MoreHorizontal size={18} {...props} />
export const CopyIcon: IconComponent = (props: IconProps) => <Copy size={18} {...props} />
export const CheckIcon: IconComponent = (props: IconProps) => <Check size={18} {...props} />
export const SearchIcon: IconComponent = (props: IconProps) => <Search size={18} {...props} />
export const SettingsIcon: IconComponent = (props: IconProps) => <Settings size={18} {...props} />
export const SignOutIcon: IconComponent = (props: IconProps) => <LogOut size={18} {...props} />
export const UserPlusIcon: IconComponent = (props: IconProps) => <UserPlus size={18} {...props} />
export const UserMinusIcon: IconComponent = (props: IconProps) => <UserMinus size={18} {...props} />
export const ShieldIcon: IconComponent = (props: IconProps) => <Shield size={18} {...props} />
export const BellIcon: IconComponent = (props: IconProps) => <Bell size={18} {...props} />
export const SunIcon: IconComponent = (props: IconProps) => <Sun size={18} {...props} />
export const MoonIcon: IconComponent = (props: IconProps) => <Moon size={18} {...props} />
export const MonitorIcon: IconComponent = (props: IconProps) => <Tv size={18} {...props} />
export const MessageSquareIcon: IconComponent = (props: IconProps) => <MessageSquare size={18} {...props} />
export const CrownIcon: IconComponent = (props: IconProps) => <Crown size={18} {...props} />
export const LockIcon: IconComponent = (props: IconProps) => <Lock size={18} {...props} />
export const Volume2Icon: IconComponent = (props: IconProps) => <Volume2 size={18} {...props} />
export const BanIcon: IconComponent = (props: IconProps) => <Ban size={18} {...props} />
