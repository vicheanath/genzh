import { useState } from 'react'
import { Button } from '@/components/Button'
import {
  VoteIcon,
  PlusIcon,
  CheckCircleIcon,
  UsersIcon,
  SparklesIcon,
  XIcon,
  SendIcon,
} from '@/components/Icons'
import { Badge } from '@/components/Badge'
import { useToast } from '@/components/Toast'
import { cx } from '@/lib/cx'
import { type RoomWithPermissions } from '@/lib/api'
import { chatApi as messagesApi } from '@/features/chat'
import { useAuth } from '@/lib/auth'
import { chatSocket } from '@/lib/ws/ChatSocket'
import styles from './PollExperience.module.css'

interface PollOption {
  id: string
  text: string
  votes: number
}

interface Poll {
  id: string
  question: string
  options: PollOption[]
  totalVotes: number
  creatorName: string
  userVotedOptionId?: string | null
  isClosed?: boolean
}

const INITIAL_POLLS: Poll[] = [
  {
    id: 'poll-1',
    question: 'What is the greatest programming language for high performance?',
    creatorName: 'Rustacean42',
    totalVotes: 32,
    options: [
      { id: 'opt-1', text: '🦀 Rust (Zero-cost abstractions & fearless concurrency)', votes: 19 },
      { id: 'opt-2', text: '⚡ C++ (Classic speed & fine control)', votes: 7 },
      { id: 'opt-3', text: '🏎️ Zig (Clean simplicity)', votes: 4 },
      { id: 'opt-4', text: '🐹 Go (Fast build & goroutines)', votes: 2 },
    ],
  },
  {
    id: 'poll-2',
    question: 'Best time to code without interruptions?',
    creatorName: 'NightOwl',
    totalVotes: 18,
    options: [
      { id: 'opt-2-1', text: '🌙 1:00 AM - 4:00 AM (Absolute tranquility)', votes: 12 },
      { id: 'opt-2-2', text: '☀️ 6:00 AM - 9:00 AM (Early bird focus)', votes: 4 },
      { id: 'opt-2-3', text: '☕ 2:00 PM - 5:00 PM (Midday grind)', votes: 2 },
    ],
  },
]

export function PollExperience({ room }: { room: RoomWithPermissions }) {
  const { getToken } = useAuth()
  const toast = useToast()
  const [polls, setPolls] = useState<Poll[]>(INITIAL_POLLS)
  const [activePollIndex, setActivePollIndex] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Create poll state
  const [newQuestion, setNewQuestion] = useState('')
  const [newOptions, setNewOptions] = useState(['', ''])

  const activePoll = polls[activePollIndex] ?? polls[0]

  async function postPollResultsToChat() {
    if (!activePoll) return
    const optionsSummary = activePoll.options
      .map((opt) => {
        const pct =
          activePoll.totalVotes > 0
            ? Math.round((opt.votes / activePoll.totalVotes) * 100)
            : 0
        return `• **${opt.text}** — ${pct}% (${opt.votes} votes)`
      })
      .join('\n')

    const msg = `🗳️ **LIVE POLL RESULTS** 🗳️\n❓ **${activePoll.question}**\n${optionsSummary}\n\n📊 Total Votes: **${activePoll.totalVotes}** • *Vote live on the poll card above!*`

    try {
      const token = await getToken()
      await messagesApi.post(token, room.id, msg, room.is_anonymous)
      chatSocket.sendMessage(room.id, msg, room.is_anonymous)
      toast.success('Poll results posted to chat!')
    } catch {
      toast.error('Could not post poll to chat')
    }
  }

  function handleVote(pollId: string, optionId: string) {
    setPolls((currentPolls) =>
      currentPolls.map((poll) => {
        if (poll.id !== pollId) return poll

        const previousVoteId = poll.userVotedOptionId
        if (previousVoteId === optionId) return poll // already voted

        const updatedOptions = poll.options.map((opt) => {
          let v = opt.votes
          if (opt.id === previousVoteId) v = Math.max(0, v - 1)
          if (opt.id === optionId) v = v + 1
          return { ...opt, votes: v }
        })

        const diff = previousVoteId ? 0 : 1

        return {
          ...poll,
          options: updatedOptions,
          totalVotes: poll.totalVotes + diff,
          userVotedOptionId: optionId,
        }
      }),
    )
  }

  function handleAddOptionField() {
    if (newOptions.length < 5) {
      setNewOptions([...newOptions, ''])
    }
  }

  function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault()
    const validOptions = newOptions.map((o) => o.trim()).filter(Boolean)
    if (!newQuestion.trim() || validOptions.length < 2) return

    const newPoll: Poll = {
      id: `poll-${Date.now()}`,
      question: newQuestion.trim(),
      creatorName: 'You',
      totalVotes: 0,
      options: validOptions.map((text, idx) => ({
        id: `opt-${Date.now()}-${idx}`,
        text,
        votes: 0,
      })),
    }

    setPolls([newPoll, ...polls])
    setActivePollIndex(0)
    setNewQuestion('')
    setNewOptions(['', ''])
    setShowCreateModal(false)
  }

  return (
    <div className={styles.container}>
      {/* Poll Header Bar */}
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.badge}>
            <VoteIcon size={16} />
            <span>Live Interactive Polls</span>
          </div>
          <span className={styles.roomTopic}>{room.topic || room.name}</span>
        </div>

        <div className={styles.headerActions}>
          <Button size="sm" onClick={() => setShowCreateModal((s) => !s)}>
            <PlusIcon size={15} />
            {showCreateModal ? 'Close' : 'Create Poll'}
          </Button>
        </div>
      </div>

      {/* Create Poll Drawer / Form */}
      {showCreateModal && (
        <form className={styles.createCard} onSubmit={handleCreatePoll}>
          <div className={styles.createHeader}>
            <SparklesIcon size={16} />
            <span>Launch a New Live Poll</span>
          </div>

          <input
            type="text"
            className={styles.questionInput}
            placeholder="Ask a question (e.g. Favorite tech stack, spicy hot takes…)"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            required
            maxLength={140}
          />

          <div className={styles.optionsList}>
            {newOptions.map((opt, idx) => (
              <div key={idx} className={styles.optionInputRow}>
                <input
                  type="text"
                  className={styles.optionInput}
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const next = [...newOptions]
                    next[idx] = e.target.value
                    setNewOptions(next)
                  }}
                  required={idx < 2}
                  maxLength={80}
                />
                {idx >= 2 && (
                  <button
                    type="button"
                    className={styles.removeOptBtn}
                    onClick={() => setNewOptions(newOptions.filter((_, i) => i !== idx))}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className={styles.createFooter}>
            {newOptions.length < 5 && (
              <Button size="sm" variant="ghost" type="button" onClick={handleAddOptionField}>
                <PlusIcon size={14} />
                Add Option
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!newQuestion.trim() || newOptions.filter((o) => o.trim()).length < 2}>
              Start Voting
            </Button>
          </div>
        </form>
      )}

      {/* Active Poll Card */}
      {activePoll && (
        <div className={styles.pollCard}>
          <div className={styles.pollMeta}>
            <Badge tone="mint" dot>
              Live Poll
            </Badge>
            <div className={styles.votersTag}>
              <UsersIcon size={13} />
              <span>{activePoll.totalVotes} votes</span>
            </div>
          </div>

          <h3 className={styles.questionText}>{activePoll.question}</h3>

          <div className={styles.pollOptions}>
            {activePoll.options.map((option) => {
              const percent =
                activePoll.totalVotes > 0
                  ? Math.round((option.votes / activePoll.totalVotes) * 100)
                  : 0
              const isSelected = activePoll.userVotedOptionId === option.id

              return (
                <button
                  key={option.id}
                  type="button"
                  className={cx(styles.optionCard, isSelected && styles.optionCardSelected)}
                  onClick={() => handleVote(activePoll.id, option.id)}
                >
                  <div
                    className={styles.optionFill}
                    style={{ width: `${percent}%` }}
                  />
                  <div className={styles.optionContent}>
                    <div className={styles.optionTextRow}>
                      {isSelected && (
                        <CheckCircleIcon size={15} className={styles.checkIcon} />
                      )}
                      <span className={styles.optionText}>{option.text}</span>
                    </div>
                    <span className={styles.optionStats}>
                      {percent}% ({option.votes})
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className={styles.pollFooter}>
            <span className={styles.pollCreator}>Started by {activePoll.creatorName}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {activePoll.userVotedOptionId && (
                <span className={styles.votedNotice}>✓ Your vote recorded</span>
              )}
              <Button size="sm" variant="ghost" onClick={() => void postPollResultsToChat()}>
                <SendIcon size={13} />
                Share Poll to Room Chat
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Poll Switcher Tabs */}
      {polls.length > 1 && (
        <div className={styles.pollTabs}>
          {polls.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              className={cx(
                styles.pollTabBtn,
                activePollIndex === idx && styles.pollTabBtnActive,
              )}
              onClick={() => setActivePollIndex(idx)}
            >
              Poll #{idx + 1}: {p.question.slice(0, 30)}…
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
