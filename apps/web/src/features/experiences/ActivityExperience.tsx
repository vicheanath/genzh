import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/Button'
import {
  PaletteIcon,
  MusicIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/Icons'
import { cx } from '@/lib/cx'
import type { RoomWithPermissions } from '@/lib/api'
import styles from './ActivityExperience.module.css'

type Tab = 'whiteboard' | 'soundboard'

const COLORS = [
  '#ec4899', // Neon Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#ef4444', // Red
  '#ffffff', // White
  '#0f172a', // Dark
]

const SOUNDS = [
  { name: 'Air Horn 📯', key: 'airhorn', freq: [440, 554, 659] },
  { name: 'Vine Boom 💥', key: 'boom', freq: [120, 60, 30] },
  { name: 'Applause 👏', key: 'applause', freq: [500, 800, 1200] },
  { name: 'Victory Fanfare 🎺', key: 'victory', freq: [261, 329, 392, 523] },
  { name: '8-Bit Jump 🍄', key: 'jump', freq: [150, 300, 600] },
  { name: 'Level Up ✨', key: 'levelup', freq: [300, 450, 600, 900] },
  { name: 'Sad Trombone 🎺', key: 'sad', freq: [300, 280, 260, 200] },
  { name: 'Laser Beam ⚡', key: 'laser', freq: [900, 600, 300, 100] },
]

export function ActivityExperience({ room: _room }: { room: RoomWithPermissions }) {
  const [activeTab, setActiveTab] = useState<Tab>('whiteboard')

  // Whiteboard canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [brushSize, setBrushSize] = useState(4)
  const [isEraser, setIsEraser] = useState(false)

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = 320 * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    // Dark canvas background
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, rect.width, 320)
  }, [activeTab])

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    setIsDrawing(true)
    const rect = canvas.getBoundingClientRect()
    const touch = 'touches' in e && e.touches[0] ? e.touches[0] : null
    const clientX = touch ? touch.clientX : (e as React.MouseEvent).clientX
    const clientY = touch ? touch.clientY : (e as React.MouseEvent).clientY
    const x = clientX - rect.left
    const y = clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = isEraser ? '#0f172a' : (selectedColor ?? '#ec4899')
    ctx.lineWidth = isEraser ? brushSize * 3 : brushSize
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const touch = 'touches' in e && e.touches[0] ? e.touches[0] : null
    const clientX = touch ? touch.clientX : (e as React.MouseEvent).clientX
    const clientY = touch ? touch.clientY : (e as React.MouseEvent).clientY
    const x = clientX - rect.left
    const y = clientY - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stopDrawing() {
    setIsDrawing(false)
  }

  function handleClearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, rect.width, 320)
  }

  function handleSaveDrawing() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `genzh-whiteboard-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }

  // Synthesize instant Web Audio sounds
  function playSynthSound(freqs: number[]) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = idx % 2 === 0 ? 'sine' : 'sawtooth'
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08)

        gain.gain.setValueAtTime(0.3, audioCtx.currentTime + idx * 0.08)
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.08 + 0.35)

        osc.connect(gain)
        gain.connect(audioCtx.destination)

        osc.start(audioCtx.currentTime + idx * 0.08)
        osc.stop(audioCtx.currentTime + idx * 0.08 + 0.4)
      })
    } catch {
      // Audio context policy
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.tag}>
          <SparklesIcon size={16} />
          <span>Interactive Activity Lounge</span>
        </div>

        <div className={styles.tabButtons}>
          <button
            type="button"
            className={cx(styles.tabBtn, activeTab === 'whiteboard' && styles.tabBtnActive)}
            onClick={() => setActiveTab('whiteboard')}
          >
            <PaletteIcon size={14} />
            <span>Live Whiteboard</span>
          </button>
          <button
            type="button"
            className={cx(styles.tabBtn, activeTab === 'soundboard' && styles.tabBtnActive)}
            onClick={() => setActiveTab('soundboard')}
          >
            <MusicIcon size={14} />
            <span>Party Soundboard</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: WHITEBOARD ── */}
      {activeTab === 'whiteboard' && (
        <div className={styles.whiteboardCard}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.colorPalette}>
              {COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  className={cx(
                    styles.colorSwatch,
                    selectedColor === col && !isEraser && styles.colorSwatchActive,
                  )}
                  style={{ background: col }}
                  onClick={() => {
                    setSelectedColor(col)
                    setIsEraser(false)
                  }}
                  title={`Select color ${col}`}
                />
              ))}
            </div>

            <div className={styles.toolDivider} />

            <div className={styles.brushControl}>
              <span className={styles.brushLabel}>Size: {brushSize}px</span>
              <input
                type="range"
                min="1"
                max="24"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                className={styles.rangeSlider}
              />
            </div>

            <div className={styles.toolDivider} />

            <Button
              size="sm"
              variant={isEraser ? 'secondary' : 'ghost'}
              onClick={() => setIsEraser((e) => !e)}
            >
              🧹 {isEraser ? 'Using Eraser' : 'Eraser'}
            </Button>

            <Button size="sm" variant="ghost" onClick={handleClearCanvas}>
              <TrashIcon size={14} />
              Clear
            </Button>

            <Button size="sm" onClick={handleSaveDrawing}>
              💾 Export PNG
            </Button>
          </div>

          {/* Canvas Viewport */}
          <div className={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
        </div>
      )}

      {/* ── TAB 2: SOUNDBOARD ── */}
      {activeTab === 'soundboard' && (
        <div className={styles.soundboardCard}>
          <div className={styles.soundboardTitle}>
            <MusicIcon size={16} />
            <span>Instant Reaction Soundboard (Click to Play Live Audio)</span>
          </div>

          <div className={styles.soundsGrid}>
            {SOUNDS.map((sound) => (
              <button
                key={sound.key}
                type="button"
                className={styles.soundBtn}
                onClick={() => playSynthSound(sound.freq)}
              >
                <span className={styles.soundName}>{sound.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
