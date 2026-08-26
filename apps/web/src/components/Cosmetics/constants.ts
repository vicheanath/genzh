import styles from './cosmetics.module.css'

/** Animation classes supported by the cosmetic motion system. */
export const ANIMATIONS: Record<string, string | undefined> = {
  pulse: styles.animPulse,
  spin: styles.animSpin,
  aurora: styles.animAurora,
  shimmer: styles.animShimmer,
  float: styles.animFloat,
  flicker: styles.animFlicker,
  flame: styles.animFlame,
  cyber: styles.animCyber,
}

/** Default particle emojis / glyphs per effect type when no custom icon is specified. */
export const PARTICLE_SYMBOLS: Record<string, string> = {
  sparkles: '✦',
  flames: '🔥',
  bubbles: '🫧',
  hearts: '💖',
  electric: '⚡',
  snow: '❄️',
  stars: '⭐',
  orbit: '🪐',
  sakura: '🌸',
  void: '🌀',
  ghost: '👻',
  matrix: '01',
  rainbow: '✨',
  coins: '🪙',
  ki: '🔥',
}

/** CSS animation class mappings for particle aura engines. */
export const EFFECT_ANIMATION_CLASSES: Record<string, string | undefined> = {
  sparkles: styles.particleSparkle,
  flames: styles.particleFlame,
  bubbles: styles.particleBubble,
  hearts: styles.particleHeart,
  electric: styles.particleElectric,
  snow: styles.particleSnow,
  orbit: styles.particleOrbit,
  stars: styles.particleSparkle,
  sakura: styles.particleSakura,
  void: styles.particleVoid,
  ghost: styles.particleGhost,
  matrix: styles.particleMatrix,
  rainbow: styles.particleRainbow,
  coins: styles.particleCoins,
  ki: styles.particleKi,
}
