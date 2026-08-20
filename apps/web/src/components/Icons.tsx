import type { LucideProps } from 'lucide-react'
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Copy,
  Crown,
  Flame,
  Gamepad2,
  Globe,
  Hand,
  Hash,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Lock,
  LogOut,
  Mail,
  Maximize2,
  Menu as MenuLucide,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Moon,
  MoreHorizontal,
  Music,
  Palette,
  Pencil,
  PhoneOff,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ScreenShare,
  ScreenShareOff,
  Search,
  Send,
  Settings,
  Shield,
  Shuffle,
  Smile,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Trophy,
  Tv,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Vote,
  Volume2,
  VolumeX,
  X,
  Zap,
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
export const SparklesIcon: IconComponent = (props: IconProps) => <Sparkles size={18} {...props} />
export const HeadphonesIcon: IconComponent = (props: IconProps) => <Headphones size={18} {...props} />
export const PhoneOffIcon: IconComponent = (props: IconProps) => <PhoneOff size={18} {...props} />
export const ScreenShareIcon: IconComponent = (props: IconProps) => <ScreenShare size={18} {...props} />
export const ScreenShareOffIcon: IconComponent = (props: IconProps) => <ScreenShareOff size={18} {...props} />
export const RadioIcon: IconComponent = (props: IconProps) => <Radio size={18} {...props} />
export const HandIcon: IconComponent = (props: IconProps) => <Hand size={18} {...props} />
export const MaximizeIcon: IconComponent = (props: IconProps) => <Maximize2 size={18} {...props} />
export const MinimizeIcon: IconComponent = (props: IconProps) => <Minimize2 size={18} {...props} />

/* ── Experience Types & Actions ─────────────────────────────────────────── */
export const FlameIcon: IconComponent = (props: IconProps) => <Flame size={18} {...props} />
export const TrophyIcon: IconComponent = (props: IconProps) => <Trophy size={18} {...props} />
export const GamepadIcon: IconComponent = (props: IconProps) => <Gamepad2 size={18} {...props} />
export const ShuffleIcon: IconComponent = (props: IconProps) => <Shuffle size={18} {...props} />
export const TimerIcon: IconComponent = (props: IconProps) => <Timer size={18} {...props} />
export const PaletteIcon: IconComponent = (props: IconProps) => <Palette size={18} {...props} />
export const MusicIcon: IconComponent = (props: IconProps) => <Music size={18} {...props} />
export const VoteIcon: IconComponent = (props: IconProps) => <Vote size={18} {...props} />
export const HelpCircleIcon: IconComponent = (props: IconProps) => <HelpCircle size={18} {...props} />
export const CheckCircleIcon: IconComponent = (props: IconProps) => <CheckCircle2 size={18} {...props} />
export const PlayIcon: IconComponent = (props: IconProps) => <Play size={18} {...props} />
export const RotateCcwIcon: IconComponent = (props: IconProps) => <RotateCcw size={18} {...props} />
export const ZapIcon: IconComponent = (props: IconProps) => <Zap size={18} {...props} />

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
export const VolumeXIcon: IconComponent = (props: IconProps) => <VolumeX size={18} {...props} />
export const BanIcon: IconComponent = (props: IconProps) => <Ban size={18} {...props} />
export const MailIcon: IconComponent = (props: IconProps) => <Mail size={18} {...props} />
export const HeartIcon: IconComponent = (props: IconProps) => <Heart size={18} {...props} />
export const GlobeIcon: IconComponent = (props: IconProps) => <Globe size={18} {...props} />

/* ── OAuth Providers ────────────────────────────────────────────────────── */
export const GoogleIcon: IconComponent = ({ size = 18, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
)

export const DiscordIcon: IconComponent = ({ size = 18, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
)

