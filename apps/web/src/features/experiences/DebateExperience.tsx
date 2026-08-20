import { useState, useEffect } from 'react'
import { Button } from '@/components/Button'
import {
  FlameIcon,
  TimerIcon,
  VoteIcon,
  ZapIcon,
  RotateCcwIcon,
  PlayIcon,
  UsersIcon,
  PlusIcon,
  SendIcon,
} from '@/components/Icons'
import { Badge } from '@/components/Badge'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { cx } from '@/lib/cx'
import { messages as messagesApi, type RoomWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { chatSocket } from '@/lib/ws/ChatSocket'
import styles from './DebateExperience.module.css'

interface DebatePoint {
  id: string
  side: 'pro' | 'con'
  authorName: string
  text: string
  votes: number
}

const DEFAULT_POINTS: DebatePoint[] = [
  {
    id: '1',
    side: 'pro',
    authorName: 'NeonRider',
    text: 'AI speeds up coding and removes boilerplate drudgery, letting devs focus on architecture.',
    votes: 8,
  },
  {
    id: '2',
    side: 'con',
    authorName: 'ShadowDev',
    text: 'Over-reliance degrades fundamentals and creates subtle security vulnerabilities.',
    votes: 5,
  },
]

export function DebateExperience({ room }: { room: RoomWithPermissions }) {
  const { user, getToken } = useAuth()
  const toast = useToast()
  const [proVotes, setProVotes] = useState(14)
  const [conVotes, setConVotes] = useState(9)
  const [userVote, setUserVote] = useState<'pro' | 'con' | null>(null)

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [timerActive, setTimerActive] = useState(false)
  const [activeSide, setActiveSide] = useState<'pro' | 'con'>('pro')

  // Debate arguments
  const [points, setPoints] = useState<DebatePoint[]>(DEFAULT_POINTS)
  const [newPointText, setNewPointText] = useState('')
  const [pointSide, setPointSide] = useState<'pro' | 'con'>('pro')

  async function postDebateStandingsToChat() {
    const total = proVotes + conVotes || 1
    const pP = Math.round((proVotes / total) * 100)
    const pC = 100 - pP
    const topic = room.topic || room.name
    const msg = `🔥 **LIVE DEBATE STANDINGS** 🔥\n📌 Motion: *" ${topic} "*\n\n🟢 **PRO (Side A)**: ${pP}% (${proVotes} votes)\n🔴 **CON (Side B)**: ${pC}% (${conVotes} votes)\n\n*Cast your vote on the live meter above!*`

    try {
      const token = await getToken()
      await messagesApi.post(token, room.id, msg, room.is_anonymous)
      chatSocket.sendMessage(room.id, msg, room.is_anonymous)
      toast.success('Debate standings posted to chat!')
    } catch {
      toast.error('Could not post to chat')
    }
  }

  useEffect(() => {
    let interval: number | undefined
    if (timerActive && timerSeconds > 0) {
      interval = window.setInterval(() => {
        setTimerSeconds((s) => s - 1)
      }, 1000)
    } else if (timerSeconds === 0) {
      setTimerActive(false)
    }
    return () => clearInterval(interval)
  }, [timerActive, timerSeconds])

  function handleVote(side: 'pro' | 'con') {
    if (userVote === side) return

    if (userVote === 'pro') setProVotes((v) => Math.max(0, v - 1))
    if (userVote === 'con') setConVotes((v) => Math.max(0, v - 1))

    if (side === 'pro') setProVotes((v) => v + 1)
    if (side === 'con') setConVotes((v) => v + 1)

    setUserVote(side)
  }

  function handleAddPoint(e: React.FormEvent) {
    e.preventDefault()
    if (!newPointText.trim()) return

    const point: DebatePoint = {
      id: `${Date.now()}`,
      side: pointSide,
      authorName: user?.profile.display_name ?? 'Anonymous',
      text: newPointText.trim(),
      votes: 1,
    }

    setPoints((pts) => [point, ...pts])
    setNewPointText('')
  }

  function handleUpvotePoint(id: string) {
    setPoints((pts) =>
      pts.map((p) => (p.id === id ? { ...p, votes: p.votes + 1 } : p)),
    )
  }

  const totalVotes = proVotes + conVotes || 1
  const proPercent = Math.round((proVotes / totalVotes) * 100)
  const conPercent = 100 - proPercent

  const topicTitle = room.topic || room.name || 'Structured Debate Arena'

  return (
    <div className={styles.arena}>
      {/* Top Banner & Vote Meter */}
      <div className={styles.meterCard}>
        <div className={styles.meterHeader}>
          <div className={styles.meterTag}>
            <FlameIcon size={16} />
            <span>Live 2-Sided Debate</span>
          </div>
          <div className={styles.totalVoters}>
            <UsersIcon size={14} />
            <span>{totalVotes} total votes</span>
          </div>
        </div>

        <h2 className={styles.topicTitle}>{topicTitle}</h2>

        {/* Tug of war bar */}
        <div className={styles.meterContainer}>
          <div className={styles.barLabels}>
            <span className={styles.proLabel}>
              PRO (Side A) • {proPercent}% ({proVotes})
            </span>
            <span className={styles.conLabel}>
              CON (Side B) • {conPercent}% ({conVotes})
            </span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.proFill}
              style={{ width: `${proPercent}%` }}
            />
            <div
              className={styles.conFill}
              style={{ width: `${conPercent}%` }}
            />
          </div>
        </div>

        {/* Voting & Side Selector Buttons */}
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={cx(styles.voteBtn, styles.proBtn, userVote === 'pro' && styles.voteBtnActive)}
            onClick={() => handleVote('pro')}
          >
            <VoteIcon size={16} />
            <span>Vote PRO ({proVotes})</span>
          </button>

          <button
            type="button"
            className={cx(styles.voteBtn, styles.conBtn, userVote === 'con' && styles.voteBtnActive)}
            onClick={() => handleVote('con')}
          >
            <VoteIcon size={16} />
            <span>Vote CON ({conVotes})</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
          <Button size="sm" variant="ghost" onClick={() => void postDebateStandingsToChat()}>
            <SendIcon size={13} />
            Share Standings to Room Chat
          </Button>
        </div>
      </div>

      {/* Speaker Turn Timer */}
      <div className={styles.turnTimerCard}>
        <div className={styles.turnInfo}>
          <div className={styles.timerHeader}>
            <TimerIcon size={16} />
            <span>Speaker Turn Clock</span>
          </div>
          <div className={styles.turnSideTag}>
            Current Turn:{' '}
            <Badge tone={activeSide === 'pro' ? 'mint' : 'danger'}>
              Side {activeSide.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className={styles.timerDigits}>
          {Math.floor(timerSeconds / 60)}:
          {(timerSeconds % 60).toString().padStart(2, '0')}
        </div>

        <div className={styles.timerControls}>
          <Button
            size="sm"
            variant={timerActive ? 'secondary' : 'primary'}
            onClick={() => setTimerActive((a) => !a)}
          >
            <PlayIcon size={14} />
            {timerActive ? 'Pause' : 'Start Clock'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTimerActive(false)
              setTimerSeconds(60)
            }}
          >
            <RotateCcwIcon size={14} />
            Reset (60s)
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setActiveSide((s) => (s === 'pro' ? 'con' : 'pro'))
              setTimerSeconds(60)
            }}
          >
            <ZapIcon size={14} />
            Switch Turn
          </Button>
        </div>
      </div>

      {/* Key Arguments Bullet Board */}
      <div className={styles.argumentsSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Key Argument Claims</h3>
          <span className={styles.pointCount}>{points.length} submitted</span>
        </div>

        {/* Add argument claim */}
        <form className={styles.addPointForm} onSubmit={handleAddPoint}>
          <div className={styles.sidePicker}>
            <button
              type="button"
              className={cx(styles.sidePickBtn, pointSide === 'pro' && styles.sidePickActivePro)}
              onClick={() => setPointSide('pro')}
            >
              Side PRO
            </button>
            <button
              type="button"
              className={cx(styles.sidePickBtn, pointSide === 'con' && styles.sidePickActiveCon)}
              onClick={() => setPointSide('con')}
            >
              Side CON
            </button>
          </div>

          <div className={styles.inputRow}>
            <input
              type="text"
              className={styles.pointInput}
              placeholder={`Drop a concise argument for ${pointSide.toUpperCase()}…`}
              value={newPointText}
              onChange={(e) => setNewPointText(e.target.value)}
              maxLength={200}
            />
            <Button size="sm" type="submit" disabled={!newPointText.trim()}>
              <PlusIcon size={14} />
              Post Claim
            </Button>
          </div>
        </form>

        {/* List of claims */}
        <div className={styles.pointsGrid}>
          {points.map((pt) => (
            <div
              key={pt.id}
              className={cx(
                styles.pointCard,
                pt.side === 'pro' ? styles.proPointCard : styles.conPointCard,
              )}
            >
              <div className={styles.pointHeader}>
                <div className={styles.authorBadge}>
                  <Avatar name={pt.authorName} size="xs" />
                  <span>{pt.authorName}</span>
                </div>
                <Badge tone={pt.side === 'pro' ? 'mint' : 'danger'}>
                  {pt.side.toUpperCase()}
                </Badge>
              </div>

              <p className={styles.pointBody}>{pt.text}</p>

              <div className={styles.pointFooter}>
                <button
                  type="button"
                  className={styles.upvoteBtn}
                  onClick={() => handleUpvotePoint(pt.id)}
                  title="Agree with this point"
                >
                  <FlameIcon size={13} />
                  <span>{pt.votes} Agrees</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
