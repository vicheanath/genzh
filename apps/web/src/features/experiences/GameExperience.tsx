import { useState, useEffect } from 'react'
import { Button } from '@/components/Button'
import {
  GamepadIcon,
  TrophyIcon,
  TimerIcon,
  ShuffleIcon,
  SparklesIcon,
  FlameIcon,
  RotateCcwIcon,
  ZapIcon,
  PlusIcon,
  PencilIcon,
  SendIcon,
} from '@/components/Icons'
import { Badge } from '@/components/Badge'
import { useToast } from '@/components/Toast'
import { cx } from '@/lib/cx'
import { messages as messagesApi, type RoomWithPermissions } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { chatSocket } from '@/lib/ws/ChatSocket'
import styles from './GameExperience.module.css'

type GameMode = 'trivia' | 'would_you_rather' | 'truth_or_dare' | 'word_chain'

export interface TriviaQuestion {
  category: string
  question: string
  options: string[]
  answer: number
  explanation: string
}

export interface WouldYouRatherItem {
  optionA: string
  optionB: string
  votesA: number
  votesB: number
}

export interface TruthOrDareItem {
  type: 'truth' | 'dare'
  text: string
}

const DEFAULT_TRIVIA_DECK: TriviaQuestion[] = [
  {
    category: '💻 Tech & Internet',
    question: 'What was the original name of JavaScript when Brendan Eich created it in 10 days?',
    options: ['Mocha', 'LiveScript', 'ECMAScript', 'Oak'],
    answer: 0,
    explanation: 'JavaScript was initially named Mocha in May 1995, then renamed to LiveScript, and finally JavaScript!',
  },
  {
    category: '🎮 Gaming',
    question: 'Which legendary game coined the phrase "The cake is a lie"?',
    options: ['Half-Life 2', 'Portal', 'BioShock', 'Fallout 3'],
    answer: 1,
    explanation: 'Portal (2007) featured graffiti in hidden dens warning players that "the cake is a lie".',
  },
  {
    category: '🪐 Science & Universe',
    question: 'How long does light from the Sun take to reach Earth on average?',
    options: ['8 minutes and 20 seconds', '12 minutes and 4 seconds', '1 minute and 30 seconds', 'Instantaneous'],
    answer: 0,
    explanation: 'At 300,000 km/s across ~150 million km, sunlight travels for roughly 8 minutes and 20 seconds.',
  },
  {
    category: '🎵 Pop Culture',
    question: 'Which song was the first YouTube video to hit 1 billion views?',
    options: ['Despacito', 'Baby - Justin Bieber', 'Gangnam Style - PSY', 'See You Again'],
    answer: 2,
    explanation: 'PSY’s Gangnam Style broke the YouTube counter in December 2012 by surpassing 1 billion views!',
  },
]

const DEFAULT_WOULD_YOU_RATHER_DECK: WouldYouRatherItem[] = [
  {
    optionA: 'Have infinite free flight travel anywhere in the world',
    optionB: 'Never need to sleep again with 100% full energy 24/7',
    votesA: 28,
    votesB: 35,
  },
  {
    optionA: 'Speak and understand every human language fluently',
    optionB: 'Talk to animals and understand their thoughts',
    votesA: 42,
    votesB: 31,
  },
  {
    optionA: 'Live 100 years into the future with zero memories of the past',
    optionB: 'Live 100 years in the past with all your modern knowledge',
    votesA: 19,
    votesB: 38,
  },
]

const DEFAULT_TRUTH_OR_DARE_DECK: TruthOrDareItem[] = [
  {
    type: 'truth',
    text: 'What is the most unhinged Google search in your history in the past 7 days?',
  },
  {
    type: 'dare',
    text: 'Send a voice message saying "beep boop beep" with a completely serious robot accent.',
  },
  {
    type: 'truth',
    text: 'What is a hot take you believe that would get you cancelled in 5 minutes?',
  },
  {
    type: 'dare',
    text: 'Type a full sentence using only auto-complete predictions on your keyboard and post it.',
  },
]

export function GameExperience({ room }: { room: RoomWithPermissions }) {
  const { user, getToken } = useAuth()
  const toast = useToast()

  const isOwner = room.owner_id === user?.id || can(room.your_permissions, 'manage_room')

  // Creator Customized Decks
  const [activeMode, setActiveMode] = useState<GameMode>('trivia')
  const [showBuilder, setShowBuilder] = useState(false)
  const [builderTab, setBuilderTab] = useState<GameMode>('trivia')

  // Decks state (customizable by room creator)
  const [triviaDeck, setTriviaDeck] = useState<TriviaQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`genzh_custom_trivia_${room.id}`)
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_TRIVIA_DECK
  })

  const [wyrDeck, setWyrDeck] = useState<WouldYouRatherItem[]>(() => {
    try {
      const saved = localStorage.getItem(`genzh_custom_wyr_${room.id}`)
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_WOULD_YOU_RATHER_DECK
  })

  const [todDeck, setTodDeck] = useState<TruthOrDareItem[]>(() => {
    try {
      const saved = localStorage.getItem(`genzh_custom_tod_${room.id}`)
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_TRUTH_OR_DARE_DECK
  })

  // Trivia player state
  const [triviaIndex, setTriviaIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [triviaDone, setTriviaDone] = useState(false)
  const [hasSharedResults, setHasSharedResults] = useState(false)

  // WYR player state
  const [wyrIndex, setWyrIndex] = useState(0)
  const [wyrVoted, setWyrVoted] = useState<'A' | 'B' | null>(null)

  // Truth or Dare player state
  const [todIndex, setTodIndex] = useState(0)

  // Word chain player state
  const [wordChain, setWordChain] = useState<string[]>(['GENZH', 'HYPER', 'REACT', 'TURBO'])
  const [currentWordInput, setCurrentWordInput] = useState('')

  // ── BUILDER FORM STATES ──
  // Trivia builder form
  const [customQuestion, setCustomQuestion] = useState('')
  const [customCategory, setCustomCategory] = useState('🎲 Random Trivia')
  const [customOptions, setCustomOptions] = useState(['', '', '', ''])
  const [customAnswer, setCustomAnswer] = useState(0)
  const [customExplanation, setCustomExplanation] = useState('')

  // WYR builder form
  const [customWyrA, setCustomWyrA] = useState('')
  const [customWyrB, setCustomWyrB] = useState('')

  // TOD builder form
  const [customTodType, setCustomTodType] = useState<'truth' | 'dare'>('truth')
  const [customTodText, setCustomTodText] = useState('')

  // Trivia countdown timer
  useEffect(() => {
    if (activeMode !== 'trivia' || triviaDone || selectedOption !== null) return

    if (timeLeft > 0) {
      const timer = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setSelectedOption(-1) // timed out
    }
  }, [activeMode, timeLeft, triviaDone, selectedOption])

  function handleSelectTriviaOption(index: number) {
    if (selectedOption !== null) return
    setSelectedOption(index)

    const currentQ = triviaDeck[triviaIndex]
    if (currentQ && index === currentQ.answer) {
      const bonus = timeLeft * 10
      setScore((s) => s + 100 + bonus)
      setStreak((st) => st + 1)
    } else {
      setStreak(0)
    }
  }

  function handleNextTrivia() {
    if (triviaIndex + 1 < triviaDeck.length) {
      setTriviaIndex((i) => i + 1)
      setSelectedOption(null)
      setTimeLeft(15)
    } else {
      setTriviaDone(true)
    }
  }

  function handleResetTrivia() {
    setTriviaIndex(0)
    setSelectedOption(null)
    setScore(0)
    setStreak(0)
    setTimeLeft(15)
    setTriviaDone(false)
    setHasSharedResults(false)
  }

  // ── POST RESULTS TO CHAT ──
  async function postTriviaResultsToChat() {
    const playerName = user?.profile.display_name ?? 'Anonymous Gamer'
    const messageContent = `🏆 **TRIVIA RUSH RESULTS** 🏆\n👤 Player: **${playerName}**\n⭐️ Final Score: **${score} Pts** (${score >= 300 ? '🔥 Godlike!' : score >= 150 ? '⚡ Great Job!' : '👍 Good Try!'})\n🔥 Best Streak: **${streak}x**\n📚 Questions Completed: **${triviaDeck.length}/${triviaDeck.length}**\n\n*Can anyone in the room beat this high score?*`

    try {
      const token = await getToken()
      await messagesApi.post(token, room.id, messageContent, room.is_anonymous)
      chatSocket.sendMessage(room.id, messageContent, room.is_anonymous)
      setHasSharedResults(true)
      toast.success('Results posted to chat!')
    } catch {
      toast.error('Could not post results to chat')
    }
  }

  async function postWyrResultsToChat() {
    const wyr = wyrDeck[wyrIndex] ?? wyrDeck[0]!
    const total = wyr.votesA + wyr.votesB || 1
    const pA = Math.round((wyr.votesA / total) * 100)
    const pB = 100 - pA
    const messageContent = `🤔 **WOULD YOU RATHER POLL RESULT**\n🅰️ **${wyr.optionA}** — ${pA}%\n🅱️ **${wyr.optionB}** — ${pB}%\n\n*Vote live on the mini-game bar above!*`

    try {
      const token = await getToken()
      await messagesApi.post(token, room.id, messageContent, room.is_anonymous)
      chatSocket.sendMessage(room.id, messageContent, room.is_anonymous)
      toast.success('Dilemma shared to chat!')
    } catch {
      toast.error('Could not share to chat')
    }
  }

  async function postTodPromptToChat() {
    const tod = todDeck[todIndex] ?? todDeck[0]!
    const messageContent = `🎯 **${tod.type.toUpperCase()} DROP**\n🎲 *" ${tod.text} "*\n\n*Answer or complete the dare in chat!*`

    try {
      const token = await getToken()
      await messagesApi.post(token, room.id, messageContent, room.is_anonymous)
      chatSocket.sendMessage(room.id, messageContent, room.is_anonymous)
      toast.success('Prompt dropped into chat!')
    } catch {
      toast.error('Could not share prompt to chat')
    }
  }

  function handleAddWord(e: React.FormEvent) {
    e.preventDefault()
    const word = currentWordInput.trim().toUpperCase()
    if (!word) return

    const lastWord = wordChain[wordChain.length - 1] ?? 'GENZH'
    const lastLetter = lastWord[lastWord.length - 1] ?? 'H'

    if (word[0] !== lastLetter) {
      alert(`Word must start with "${lastLetter}"!`)
      return
    }

    const nextChain = [...wordChain, word]
    setWordChain(nextChain)
    setCurrentWordInput('')

    // Share milestones every 5 words
    if (nextChain.length % 5 === 0) {
      const msg = `⚡ **WORD CHAIN MILESTONE!** Chain reached **${nextChain.length} words**! Last word: **${word}** (Next starts with: **${word.slice(-1)}**)`
      void getToken().then((token) => {
        void messagesApi.post(token, room.id, msg, room.is_anonymous)
      })
    }
  }

  // ── BUILDER ACTIONS (FOR ROOM CREATORS) ──
  function handleSaveCustomTrivia(e: React.FormEvent) {
    e.preventDefault()
    const validOpts = customOptions.map((o) => o.trim())
    if (!customQuestion.trim() || validOpts.some((o) => !o)) return

    const newQ: TriviaQuestion = {
      category: customCategory.trim() || 'Custom Trivia',
      question: customQuestion.trim(),
      options: validOpts,
      answer: customAnswer,
      explanation: customExplanation.trim() || 'Created by the room host!',
    }

    const updated = [newQ, ...triviaDeck]
    setTriviaDeck(updated)
    try {
      localStorage.setItem(`genzh_custom_trivia_${room.id}`, JSON.stringify(updated))
    } catch {}

    setCustomQuestion('')
    setCustomOptions(['', '', '', ''])
    setCustomExplanation('')
    toast.success('Custom trivia question added to deck!')
  }

  function handleSaveCustomWyr(e: React.FormEvent) {
    e.preventDefault()
    if (!customWyrA.trim() || !customWyrB.trim()) return

    const newWyr: WouldYouRatherItem = {
      optionA: customWyrA.trim(),
      optionB: customWyrB.trim(),
      votesA: 1,
      votesB: 1,
    }

    const updated = [newWyr, ...wyrDeck]
    setWyrDeck(updated)
    try {
      localStorage.setItem(`genzh_custom_wyr_${room.id}`, JSON.stringify(updated))
    } catch {}

    setCustomWyrA('')
    setCustomWyrB('')
    toast.success('Custom dilemma added to deck!')
  }

  function handleSaveCustomTod(e: React.FormEvent) {
    e.preventDefault()
    if (!customTodText.trim()) return

    const newTod: TruthOrDareItem = {
      type: customTodType,
      text: customTodText.trim(),
    }

    const updated = [newTod, ...todDeck]
    setTodDeck(updated)
    try {
      localStorage.setItem(`genzh_custom_tod_${room.id}`, JSON.stringify(updated))
    } catch {}

    setCustomTodText('')
    toast.success(`Custom ${customTodType.toUpperCase()} added!`)
  }

  const currentTrivia = triviaDeck[triviaIndex] ?? triviaDeck[0]!
  const currentWyr = wyrDeck[wyrIndex] ?? wyrDeck[0]!
  const currentTod = todDeck[todIndex] ?? todDeck[0]!

  return (
    <div className={styles.gameContainer}>
      {/* Game Mode Selector Header */}
      <div className={styles.gameHeader}>
        <div className={styles.gameTag}>
          <GamepadIcon size={16} />
          <span>Party Mini-Games Hub</span>
          {isOwner && (
            <Badge tone="accent">Host Controls</Badge>
          )}
        </div>

        <div className={styles.headerRightActions}>
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={cx(styles.modeTab, activeMode === 'trivia' && styles.modeTabActive)}
              onClick={() => setActiveMode('trivia')}
            >
              🧠 Trivia Rush ({triviaDeck.length})
            </button>
            <button
              type="button"
              className={cx(styles.modeTab, activeMode === 'would_you_rather' && styles.modeTabActive)}
              onClick={() => setActiveMode('would_you_rather')}
            >
              🤔 Would You Rather
            </button>
            <button
              type="button"
              className={cx(styles.modeTab, activeMode === 'truth_or_dare' && styles.modeTabActive)}
              onClick={() => setActiveMode('truth_or_dare')}
            >
              🎯 Truth / Dare
            </button>
            <button
              type="button"
              className={cx(styles.modeTab, activeMode === 'word_chain' && styles.modeTabActive)}
              onClick={() => setActiveMode('word_chain')}
            >
              ⚡ Word Chain
            </button>
          </div>

          {isOwner && (
            <Button
              size="sm"
              variant={showBuilder ? 'secondary' : 'ghost'}
              onClick={() => setShowBuilder((s) => !s)}
            >
              <PencilIcon size={14} />
              {showBuilder ? 'Close Deck Builder' : 'Build / Customize Games'}
            </Button>
          )}
        </div>
      </div>

      {/* ── ROOM CREATOR GAME BUILDER DRAWER ── */}
      {showBuilder && isOwner && (
        <div className={styles.builderCard}>
          <div className={styles.builderHeader}>
            <div className={styles.builderTitle}>
              <PencilIcon size={15} />
              <span>Room Creator Game Deck Builder</span>
            </div>
            <div className={styles.builderTabs}>
              <button
                type="button"
                className={cx(styles.builderTabBtn, builderTab === 'trivia' && styles.builderTabActive)}
                onClick={() => setBuilderTab('trivia')}
              >
                + Add Trivia
              </button>
              <button
                type="button"
                className={cx(styles.builderTabBtn, builderTab === 'would_you_rather' && styles.builderTabActive)}
                onClick={() => setBuilderTab('would_you_rather')}
              >
                + Add Dilemma
              </button>
              <button
                type="button"
                className={cx(styles.builderTabBtn, builderTab === 'truth_or_dare' && styles.builderTabActive)}
                onClick={() => setBuilderTab('truth_or_dare')}
              >
                + Add Truth/Dare
              </button>
            </div>
          </div>

          {/* Builder Tab 1: Trivia */}
          {builderTab === 'trivia' && (
            <form className={styles.builderForm} onSubmit={handleSaveCustomTrivia}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Enter custom trivia question (e.g. Which framework was built by Google?)"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Category (e.g. Web Dev)"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
              </div>

              <div className={styles.optionsGrid}>
                {customOptions.map((opt, idx) => (
                  <div key={idx} className={styles.builderOptionRow}>
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={customAnswer === idx}
                      onChange={() => setCustomAnswer(idx)}
                      title="Select this as the correct answer"
                    />
                    <input
                      type="text"
                      className={styles.builderInput}
                      placeholder={`Choice ${['A', 'B', 'C', 'D'][idx]}${customAnswer === idx ? ' (Correct Answer)' : ''}`}
                      value={opt}
                      onChange={(e) => {
                        const copy = [...customOptions]
                        copy[idx] = e.target.value
                        setCustomOptions(copy)
                      }}
                      required
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Explanation / Fun fact when answered (optional)"
                  value={customExplanation}
                  onChange={(e) => setCustomExplanation(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button size="sm" type="submit">
                  <PlusIcon size={14} />
                  Add to Room Deck
                </Button>
              </div>
            </form>
          )}

          {/* Builder Tab 2: Would You Rather */}
          {builderTab === 'would_you_rather' && (
            <form className={styles.builderForm} onSubmit={handleSaveCustomWyr}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Choice A (e.g. Have teleportation power)"
                  value={customWyrA}
                  onChange={(e) => setCustomWyrA(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Choice B (e.g. Have time travel power)"
                  value={customWyrB}
                  onChange={(e) => setCustomWyrB(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="sm" type="submit">
                  <PlusIcon size={14} />
                  Add Dilemma to Room Deck
                </Button>
              </div>
            </form>
          )}

          {/* Builder Tab 3: Truth or Dare */}
          {builderTab === 'truth_or_dare' && (
            <form className={styles.builderForm} onSubmit={handleSaveCustomTod}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <select
                  className={styles.builderInput}
                  value={customTodType}
                  onChange={(e) => setCustomTodType(e.target.value as 'truth' | 'dare')}
                  style={{ width: '120px' }}
                >
                  <option value="truth">Truth</option>
                  <option value="dare">Dare</option>
                </select>
                <input
                  type="text"
                  className={styles.builderInput}
                  placeholder="Enter the spicy truth question or hilarious dare…"
                  value={customTodText}
                  onChange={(e) => setCustomTodText(e.target.value)}
                  style={{ flex: 1 }}
                  required
                />
                <Button size="sm" type="submit">
                  <PlusIcon size={14} />
                  Add Prompt to Room Deck
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── MODE 1: TRIVIA RUSH ── */}
      {activeMode === 'trivia' && (
        <div className={styles.gameCard}>
          {!triviaDone ? (
            <>
              <div className={styles.triviaScoreBar}>
                <div className={styles.triviaMeta}>
                  <Badge tone="accent">{currentTrivia.category}</Badge>
                  <span className={styles.qCount}>
                    Question {triviaIndex + 1} of {triviaDeck.length}
                  </span>
                </div>

                <div className={styles.scoreStats}>
                  <span className={styles.streakBadge}>
                    <FlameIcon size={14} />
                    {streak}x Streak
                  </span>
                  <span className={styles.scoreBadge}>
                    <TrophyIcon size={14} />
                    {score} Pts
                  </span>
                  <span className={cx(styles.timerBadge, timeLeft <= 5 && styles.timerWarning)}>
                    <TimerIcon size={14} />
                    {timeLeft}s
                  </span>
                </div>
              </div>

              <h3 className={styles.triviaQuestion}>{currentTrivia.question}</h3>

              <div className={styles.optionsGrid}>
                {currentTrivia.options.map((opt, idx) => {
                  const isChosen = selectedOption === idx
                  const isCorrect = idx === currentTrivia.answer
                  const showResult = selectedOption !== null

                  let optClass = styles.triviaOption
                  if (showResult) {
                    if (isCorrect) optClass = cx(styles.triviaOption, styles.triviaOptionCorrect)
                    else if (isChosen) optClass = cx(styles.triviaOption, styles.triviaOptionWrong)
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={optClass}
                      onClick={() => handleSelectTriviaOption(idx)}
                      disabled={selectedOption !== null}
                    >
                      <span className={styles.optionLetter}>
                        {['A', 'B', 'C', 'D'][idx]}
                      </span>
                      <span className={styles.optionText}>{opt}</span>
                    </button>
                  )
                })}
              </div>

              {selectedOption !== null && (
                <div className={styles.explanationCard}>
                  <div className={styles.explanationTitle}>
                    {selectedOption === currentTrivia.answer ? '🎉 Correct!' : '❌ Incorrect'}
                  </div>
                  <p className={styles.explanationText}>{currentTrivia.explanation}</p>
                  <Button size="sm" onClick={handleNextTrivia}>
                    {triviaIndex + 1 < triviaDeck.length ? 'Next Question →' : 'View Final Score 🏆'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.finalScoreCard}>
              <SparklesIcon size={32} className={styles.sparkleIcon} />
              <h3>Trivia Round Complete!</h3>
              <div className={styles.finalScoreDigits}>{score} Pts</div>
              <p>Great job! Share your high score with everyone in chat or play another round.</p>
              
              <div className={styles.finalActionsRow}>
                <Button
                  onClick={() => void postTriviaResultsToChat()}
                  disabled={hasSharedResults}
                  style={{ background: hasSharedResults ? 'var(--color-surface-hover)' : 'var(--color-accent)' }}
                >
                  <SendIcon size={15} />
                  {hasSharedResults ? '✓ Posted in Room Chat' : '📢 Post Results to Room Chat'}
                </Button>
                <Button variant="secondary" onClick={handleResetTrivia}>
                  <RotateCcwIcon size={15} />
                  Play Again
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODE 2: WOULD YOU RATHER ── */}
      {activeMode === 'would_you_rather' && (
        <div className={styles.gameCard}>
          <div className={styles.wyrHeader}>
            <span className={styles.wyrTitle}>Would You Rather…</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="sm" variant="ghost" onClick={() => void postWyrResultsToChat()}>
                <SendIcon size={14} />
                Share Dilemma to Chat
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setWyrIndex((i) => (i + 1) % wyrDeck.length)
                  setWyrVoted(null)
                }}
              >
                <ShuffleIcon size={14} />
                Next Dilemma
              </Button>
            </div>
          </div>

          <div className={styles.wyrOptions}>
            <button
              type="button"
              className={cx(styles.wyrCard, styles.wyrCardA, wyrVoted === 'A' && styles.wyrCardSelected)}
              onClick={() => setWyrVoted('A')}
            >
              <span className={styles.wyrLabel}>Choice A</span>
              <p className={styles.wyrText}>{currentWyr.optionA}</p>
              {wyrVoted && (
                <div className={styles.wyrPercent}>
                  {Math.round(
                    (currentWyr.votesA / (currentWyr.votesA + currentWyr.votesB)) * 100,
                  )}
                  % of players chose this
                </div>
              )}
            </button>

            <div className={styles.orCircle}>OR</div>

            <button
              type="button"
              className={cx(styles.wyrCard, styles.wyrCardB, wyrVoted === 'B' && styles.wyrCardSelected)}
              onClick={() => setWyrVoted('B')}
            >
              <span className={styles.wyrLabel}>Choice B</span>
              <p className={styles.wyrText}>{currentWyr.optionB}</p>
              {wyrVoted && (
                <div className={styles.wyrPercent}>
                  {Math.round(
                    (currentWyr.votesB / (currentWyr.votesA + currentWyr.votesB)) * 100,
                  )}
                  % of players chose this
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── MODE 3: TRUTH OR DARE ── */}
      {activeMode === 'truth_or_dare' && (
        <div className={styles.gameCard}>
          <div className={styles.todHeader}>
            <Badge tone={currentTod.type === 'truth' ? 'mint' : 'danger'}>
              {currentTod.type.toUpperCase()}
            </Badge>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="sm" variant="ghost" onClick={() => void postTodPromptToChat()}>
                <SendIcon size={14} />
                Drop to Chat
              </Button>
              <Button
                size="sm"
                onClick={() => setTodIndex((i) => (i + 1) % todDeck.length)}
              >
                <ShuffleIcon size={14} />
                Spin Next Card
              </Button>
            </div>
          </div>

          <div className={styles.todPromptCard}>
            <p className={styles.todPromptText}>"{currentTod.text}"</p>
          </div>
        </div>
      )}

      {/* ── MODE 4: WORD CHAIN ── */}
      {activeMode === 'word_chain' && (
        <div className={styles.gameCard}>
          <div className={styles.chainHeader}>
            <div className={styles.chainTitle}>
              <ZapIcon size={16} />
              <span>
                Chain Rule: Next word must start with "
                <strong>
                  {(wordChain[wordChain.length - 1] ?? 'GENZH').slice(-1)}
                </strong>
                "
              </span>
            </div>
            <Badge tone="mint">Active Chain: {wordChain.length} Words</Badge>
          </div>

          <div className={styles.chainPills}>
            {wordChain.map((w, idx) => (
              <span key={idx} className={styles.chainPill}>
                {w} {idx < wordChain.length - 1 && '→'}
              </span>
            ))}
          </div>

          <form className={styles.chainForm} onSubmit={handleAddWord}>
            <input
              type="text"
              className={styles.chainInput}
              placeholder={`Enter word starting with "${(wordChain[wordChain.length - 1] ?? 'GENZH').slice(-1)}"…`}
              value={currentWordInput}
              onChange={(e) => setCurrentWordInput(e.target.value)}
              maxLength={30}
              autoFocus
            />
            <Button size="sm" type="submit" disabled={!currentWordInput.trim()}>
              Add to Chain
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
