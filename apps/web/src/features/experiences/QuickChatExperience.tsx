import { useState, useEffect } from 'react'
import { Button } from '@/components/Button'
import {
  TimerIcon,
  ShuffleIcon,
  ZapIcon,
  SparklesIcon,
  RotateCcwIcon,
} from '@/components/Icons'
import { cx } from '@/lib/cx'
import type { RoomWithPermissions } from '@/lib/api'
import styles from './QuickChatExperience.module.css'

const ICEBREAKERS = [
  'What is a skill you have that is 100% useless in real life but you are proud of?',
  'If you could delete one social media platform from existence forever, which one goes?',
  'What is the weirdest habit you formed during late-night coding or gaming sessions?',
  'If humans came with a warning label, what would yours say?',
  'What is your all-time favorite midnight snack when pulling an all-nighter?',
  'What movie or game has a 10/10 soundtrack that you listen to regularly?',
  'If you could instantly become a world master in one skill overnight, what would it be?',
  'What is an unpopular opinion you hold about modern tech or AI?',
]

export function QuickChatExperience({ room: _room }: { room: RoomWithPermissions }) {
  const [secondsRemaining, setSecondsRemaining] = useState(300) // 5 min countdown
  const [promptIndex, setPromptIndex] = useState(0)
  const [bursts, setBursts] = useState<Array<{ id: number; emoji: string; x: number }>>([])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsRemaining((s) => (s > 0 ? s - 1 : 300))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  function handleNextPrompt() {
    setPromptIndex((i) => (i + 1) % ICEBREAKERS.length)
  }

  function handleTriggerBurst(emoji: string) {
    const newBurst = {
      id: Date.now() + Math.random(),
      emoji,
      x: 20 + Math.random() * 60,
    }
    setBursts((b) => [...b, newBurst])
    setTimeout(() => {
      setBursts((b) => b.filter((item) => item.id !== newBurst.id))
    }, 1500)
  }

  const mins = Math.floor(secondsRemaining / 60)
  const secs = secondsRemaining % 60

  return (
    <div className={styles.container}>
      {/* Session Timer & Header */}
      <div className={styles.header}>
        <div className={styles.headerTag}>
          <ZapIcon size={16} />
          <span>Ephemeral Speed Chat</span>
        </div>

        <div className={styles.timerWrap}>
          <span className={styles.timerLabel}>Session Refresh:</span>
          <div className={cx(styles.timerDigits, secondsRemaining < 60 && styles.timerExpiring)}>
            <TimerIcon size={14} />
            <span>
              {mins}:{(secs < 10 ? '0' : '') + secs}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSecondsRemaining(300)}
            title="Extend session"
          >
            <RotateCcwIcon size={13} />
            +5m
          </Button>
        </div>
      </div>

      {/* Icebreaker Prompt Card */}
      <div className={styles.promptCard}>
        <div className={styles.promptTop}>
          <div className={styles.rouletteLabel}>
            <SparklesIcon size={14} />
            <span>Spontaneous Icebreaker Prompt</span>
          </div>
          <Button size="sm" variant="secondary" onClick={handleNextPrompt}>
            <ShuffleIcon size={14} />
            Spin Next Topic
          </Button>
        </div>

        <p className={styles.promptText}>"{ICEBREAKERS[promptIndex]}"</p>

        {/* Reaction Bursts */}
        <div className={styles.reactionsRow}>
          <span className={styles.reactionsHint}>Tap to drop live room energy:</span>
          <div className={styles.burstBtns}>
            {['⚡', '🔥', '❤️', '🚀', '💀', '🎉'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.burstBtn}
                onClick={() => handleTriggerBurst(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Reaction Animation Portal */}
      <div className={styles.burstContainer}>
        {bursts.map((b) => (
          <span
            key={b.id}
            className={styles.floatingEmoji}
            style={{ left: `${b.x}%` }}
          >
            {b.emoji}
          </span>
        ))}
      </div>
    </div>
  )
}
