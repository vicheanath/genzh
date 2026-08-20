import { useState } from 'react'
import { Button } from '@/components/Button'
import {
  LockIcon,
  SparklesIcon,
  PlusIcon,
  ShuffleIcon,
  SendIcon,
} from '@/components/Icons'
import { Badge } from '@/components/Badge'
import { cx } from '@/lib/cx'
import type { RoomWithPermissions } from '@/lib/api'
import styles from './ConfessionExperience.module.css'

interface Confession {
  id: string
  alias: string
  text: string
  tag: string
  theme: 'midnight' | 'sunset' | 'cyber' | 'rose' | 'emerald'
  createdAt: string
  reactions: Record<string, number>
}

const THEMES: Array<{ key: Confession['theme']; label: string; bg: string }> = [
  { key: 'midnight', label: '🌌 Midnight', bg: 'linear-gradient(135deg, #1e1b4b, #312e81)' },
  { key: 'sunset', label: '🌅 Sunset', bg: 'linear-gradient(135deg, #831843, #9a3412)' },
  { key: 'cyber', label: '⚡ Cyber', bg: 'linear-gradient(135deg, #064e3b, #0f766e)' },
  { key: 'rose', label: '🌸 Velvet', bg: 'linear-gradient(135deg, #4c0519, #881337)' },
  { key: 'emerald', label: '✨ Neon Dream', bg: 'linear-gradient(135deg, #1e293b, #0f172a)' },
]

const TAGS = ['🤫 Secret', '🔥 Spicy', '💀 Regret', '☕ Spill the Tea', '🌌 3 AM Thought', '❤️ Secret Crush']

const INITIAL_CONFESSIONS: Confession[] = [
  {
    id: 'conf-1',
    alias: 'MysticFox#4912',
    text: 'I pretend to be in deep focus when my manager calls, but I am literally just watching mechanical keyboard build ASMR.',
    tag: '💀 Regret',
    theme: 'midnight',
    createdAt: '12m ago',
    reactions: { '💀': 14, '😂': 8, '☕': 3 },
  },
  {
    id: 'conf-2',
    alias: 'NeonGhost#8102',
    text: 'I accidentally dropped production database in my first week at a previous startup and fixed it in 6 minutes before anyone noticed.',
    tag: '🔥 Spicy',
    theme: 'cyber',
    createdAt: '45m ago',
    reactions: { '😱': 18, '🔥': 12, '🤐': 9 },
  },
  {
    id: 'conf-3',
    alias: 'VelvetOtter#2239',
    text: 'I still listen to Minecraft soundtrack volume Alpha when studying because nothing in the modern world matches that peace.',
    tag: '🌌 3 AM Thought',
    theme: 'rose',
    createdAt: '2h ago',
    reactions: { '❤️': 22, '✨': 15 },
  },
]

export function ConfessionExperience({ room }: { room: RoomWithPermissions }) {
  const [confessions, setConfessions] = useState<Confession[]>(INITIAL_CONFESSIONS)
  const [showCompose, setShowCompose] = useState(false)
  const [confessionText, setConfessionText] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>(TAGS[0] ?? '🤫 Secret')
  const [selectedTheme, setSelectedTheme] = useState<Confession['theme']>('midnight')
  const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null)

  function handleAddConfession(e: React.FormEvent) {
    e.preventDefault()
    if (!confessionText.trim()) return

    const newConf: Confession = {
      id: `conf-${Date.now()}`,
      alias: room.anonymous_identity?.alias_name || `AnonUser#${Math.floor(1000 + Math.random() * 9000)}`,
      text: confessionText.trim(),
      tag: selectedTag,
      theme: selectedTheme,
      createdAt: 'Just now',
      reactions: { '🔥': 1 },
    }

    setConfessions([newConf, ...confessions])
    setConfessionText('')
    setShowCompose(false)
  }

  function handleReact(confId: string, emoji: string) {
    setConfessions((list) =>
      list.map((c) => {
        if (c.id !== confId) return c
        const currentCount = c.reactions[emoji] || 0
        return {
          ...c,
          reactions: {
            ...c.reactions,
            [emoji]: currentCount + 1,
          },
        }
      }),
    )
  }

  function handleRandomSpotlight() {
    if (confessions.length === 0) return
    const randomIdx = Math.floor(Math.random() * confessions.length)
    setSpotlightIndex(randomIdx)
  }

  const spotlightConfession = spotlightIndex !== null ? confessions[spotlightIndex] : null

  return (
    <div className={styles.container}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.tag}>
            <LockIcon size={16} />
            <span>Anonymous Confession Wall & Truth Drops</span>
          </div>
          <span className={styles.topic}>{room.topic || room.name}</span>
        </div>

        <div className={styles.headerActions}>
          <Button size="sm" variant="secondary" onClick={handleRandomSpotlight}>
            <ShuffleIcon size={14} />
            Reveal Random Secret
          </Button>

          <Button size="sm" onClick={() => setShowCompose((s) => !s)}>
            <PlusIcon size={14} />
            {showCompose ? 'Close Box' : 'Drop a Confession'}
          </Button>
        </div>
      </div>

      {/* Spotlight Reveal Card Modal / Panel */}
      {spotlightConfession && (
        <div className={styles.spotlightOverlay}>
          <div
            className={styles.spotlightCard}
            style={{
              background:
                THEMES.find((t) => t.key === spotlightConfession.theme)?.bg ??
                THEMES[0]?.bg ??
                '#1e1b4b',
            }}
          >
            <div className={styles.spotlightTop}>
              <Badge tone="accent">{spotlightConfession.tag}</Badge>
              <span className={styles.spotlightAlias}>
                Posted by {spotlightConfession.alias}
              </span>
            </div>

            <p className={styles.spotlightText}>
              "{spotlightConfession.text}"
            </p>

            <div className={styles.spotlightActions}>
              <div className={styles.reactionsBar}>
                {['🔥', '💀', '😱', '☕', '❤️', '🤐'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={styles.reactBtn}
                    onClick={() => handleReact(spotlightConfession.id, emoji)}
                  >
                    <span>{emoji}</span>
                    <span className={styles.reactCount}>
                      {spotlightConfession.reactions[emoji] || 0}
                    </span>
                  </button>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSpotlightIndex(null)}>
                Close Reveal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drop a Confession Form */}
      {showCompose && (
        <form className={styles.composeCard} onSubmit={handleAddConfession}>
          <div className={styles.composeHeader}>
            <SparklesIcon size={16} />
            <span>Drop an Anonymous Truth Card</span>
          </div>

          <textarea
            className={styles.textarea}
            placeholder="Write your secret or confession… Real profiles are completely masked and untraceable."
            value={confessionText}
            onChange={(e) => setConfessionText(e.target.value)}
            rows={3}
            maxLength={500}
            required
            autoFocus
          />

          {/* Theme & Tag Selectors */}
          <div className={styles.metaSelectors}>
            <div className={styles.metaGroup}>
              <span className={styles.metaLabel}>Mood Tag:</span>
              <div className={styles.tagsRow}>
                {TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={cx(styles.tagChip, selectedTag === tag && styles.tagChipActive)}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.metaGroup}>
              <span className={styles.metaLabel}>Card Aesthetic:</span>
              <div className={styles.themeRow}>
                {THEMES.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    className={cx(
                      styles.themeBtn,
                      selectedTheme === theme.key && styles.themeBtnActive,
                    )}
                    onClick={() => setSelectedTheme(theme.key)}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.composeFooter}>
            <div className={styles.aliasPreview}>
              Posting as:{' '}
              <strong>
                {room.anonymous_identity?.alias_name || 'Anonymous Alias'}
              </strong>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowCompose(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={!confessionText.trim()}>
                <SendIcon size={14} />
                Drop Secret
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Confessions Grid */}
      <div className={styles.grid}>
        {confessions.map((c) => {
          const themeObj = THEMES.find((t) => t.key === c.theme) ?? THEMES[0]
          return (
            <div
              key={c.id}
              className={styles.card}
              style={{ background: themeObj ? themeObj.bg : 'linear-gradient(135deg, #1e1b4b, #312e81)' }}
            >
              <div className={styles.cardHeader}>
                <Badge tone="accent">{c.tag}</Badge>
                <span className={styles.cardTime}>{c.createdAt}</span>
              </div>

              <p className={styles.cardText}>"{c.text}"</p>

              <div className={styles.cardFooter}>
                <span className={styles.aliasName}>{c.alias}</span>

                <div className={styles.reactionsBar}>
                  {['🔥', '💀', '😱', '☕', '❤️', '🤐'].map((emoji) => {
                    const count = c.reactions[emoji] || 0
                    if (count === 0) return null
                    return (
                      <button
                        key={emoji}
                        type="button"
                        className={styles.reactBtn}
                        onClick={() => handleReact(c.id, emoji)}
                      >
                        <span>{emoji}</span>
                        <span className={styles.reactCount}>{count}</span>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    className={cx(styles.reactBtn, styles.addReactBtn)}
                    onClick={() => handleReact(c.id, '🔥')}
                    title="Add reaction"
                  >
                    +🔥
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
