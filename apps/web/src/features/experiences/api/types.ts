import type { Uuid } from '@/lib/api'

export interface PollOption {
  id: string
  text: string
  votes: number
}

export interface PollData {
  id: string
  question: string
  options: PollOption[]
  totalVotes: number
  creatorName: string
  userVotedOptionId?: string | null
  isClosed?: boolean
}

export interface ConfessionData {
  id: string
  content: string
  theme: string
  timestamp: string
  likes: number
  hasLiked?: boolean
  tag?: string
}

export interface DebateArgument {
  id: string
  side: 'pro' | 'con'
  authorName: string
  text: string
  upvotes: number
  hasUpvoted?: boolean
  timestamp: string
}

export interface DebateData {
  id: string
  topic: string
  description?: string
  proScore: number
  conScore: number
  proArguments: DebateArgument[]
  conArguments: DebateArgument[]
  isConcluded?: boolean
}

export interface GameState {
  gameId: string
  gameType: string
  currentTurn?: Uuid
  scores: Record<string, number>
  status: 'waiting' | 'in_progress' | 'finished'
  boardState?: Record<string, unknown>
}
