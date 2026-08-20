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
} from '@/components/Icons'
import { Badge } from '@/components/Badge'
import { cx } from '@/lib/cx'
import type { RoomWithPermissions } from '@/lib/api'
import styles from './GameExperience.module.css'

type GameMode = 'trivia' | 'would_you_rather' | 'truth_or_dare' | 'word_chain'

interface TriviaQuestion {
  question: string
  options: string[]
  answer: number
  explanation: string
  category: string
}

const TRIVIA_DECK: TriviaQuestion[] = [
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

const WOULD_YOU_RATHER_DECK = [
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

const TRUTH_OR_DARE_DECK = [
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

export function GameExperience({ room: _room }: { room: RoomWithPermissions }) {
  const [activeMode, setActiveMode] = useState<GameMode>('trivia')

  // Trivia state
  const [triviaIndex, setTriviaIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [triviaDone, setTriviaDone] = useState(false)

  // WYR state
  const [wyrIndex, setWyrIndex] = useState(0)
  const [wyrVoted, setWyrVoted] = useState<'A' | 'B' | null>(null)

  // Truth or Dare state
  const [todIndex, setTodIndex] = useState(0)

  // Word chain state
  const [wordChain, setWordChain] = useState<string[]>(['GENZH', 'HYPER', 'REACT', 'TURBO'])
  const [currentWordInput, setCurrentWordInput] = useState('')

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

    const currentQ = TRIVIA_DECK[triviaIndex]
    if (currentQ && index === currentQ.answer) {
      const bonus = timeLeft * 10
      setScore((s) => s + 100 + bonus)
      setStreak((st) => st + 1)
    } else {
      setStreak(0)
    }
  }

  function handleNextTrivia() {
    if (triviaIndex + 1 < TRIVIA_DECK.length) {
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

    setWordChain([...wordChain, word])
    setCurrentWordInput('')
  }

  const currentTrivia = TRIVIA_DECK[triviaIndex] ?? TRIVIA_DECK[0]!
  const currentWyr = WOULD_YOU_RATHER_DECK[wyrIndex] ?? WOULD_YOU_RATHER_DECK[0]!
  const currentTod = TRUTH_OR_DARE_DECK[todIndex] ?? TRUTH_OR_DARE_DECK[0]!

  return (
    <div className={styles.gameContainer}>
      {/* Game Mode Selector Header */}
      <div className={styles.gameHeader}>
        <div className={styles.gameTag}>
          <GamepadIcon size={16} />
          <span>Party Mini-Games Hub</span>
        </div>

        <div className={styles.modeTabs}>
          <button
            type="button"
            className={cx(styles.modeTab, activeMode === 'trivia' && styles.modeTabActive)}
            onClick={() => setActiveMode('trivia')}
          >
            🧠 Trivia Rush
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
      </div>

      {/* ── MODE 1: TRIVIA RUSH ── */}
      {activeMode === 'trivia' && (
        <div className={styles.gameCard}>
          {!triviaDone ? (
            <>
              <div className={styles.triviaScoreBar}>
                <div className={styles.triviaMeta}>
                  <Badge tone="accent">{currentTrivia.category}</Badge>
                  <span className={styles.qCount}>
                    Question {triviaIndex + 1} of {TRIVIA_DECK.length}
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
                    {triviaIndex + 1 < TRIVIA_DECK.length ? 'Next Question →' : 'View Final Score 🏆'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.finalScoreCard}>
              <SparklesIcon size={32} className={styles.sparkleIcon} />
              <h3>Trivia Round Complete!</h3>
              <div className={styles.finalScoreDigits}>{score} Pts</div>
              <p>Great job! Challenge other room members or play another round.</p>
              <Button onClick={handleResetTrivia}>
                <RotateCcwIcon size={16} />
                Play Again
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── MODE 2: WOULD YOU RATHER ── */}
      {activeMode === 'would_you_rather' && (
        <div className={styles.gameCard}>
          <div className={styles.wyrHeader}>
            <span className={styles.wyrTitle}>Would You Rather…</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setWyrIndex((i) => (i + 1) % WOULD_YOU_RATHER_DECK.length)
                setWyrVoted(null)
              }}
            >
              <ShuffleIcon size={14} />
              Next Dilemma
            </Button>
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
            <Button
              size="sm"
              onClick={() => setTodIndex((i) => (i + 1) % TRUTH_OR_DARE_DECK.length)}
            >
              <ShuffleIcon size={14} />
              Spin Next Card
            </Button>
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
            <Badge tone="mint">Active Chain: {wordChain.length}</Badge>
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
