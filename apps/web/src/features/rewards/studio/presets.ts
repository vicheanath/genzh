export interface OutfitPreset {
  id: string
  name: string
  emoji: string
  description: string
  skus: {
    frame?: string
    avatar_effect?: string
    name_color?: string
    name_font?: string
    title?: string
    badge?: string
    chat_bubble?: string
    banner?: string
  }
}

export const OUTFIT_PRESETS: OutfitPreset[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Netrunner',
    emoji: '⚡',
    description: 'Electric cyan HUD, lightning surge, sci-fi Orbitron typography & speed demon flair',
    skus: {
      frame: 'frame-cyber-neon',
      avatar_effect: 'effect-electric-lightning',
      name_color: 'name-neon-sunset',
      name_font: 'font-cyber-orbitron',
      title: 'title-speed-demon',
      badge: 'badge-rocket-ship',
      chat_bubble: 'bubble-cyber-neon',
      banner: 'banner-cyber-synthwave',
    },
  },
  {
    id: 'inferno',
    name: 'Molten Dragon Lord',
    emoji: '🔥',
    description: 'Blazing volcanic ring, rising molten embers, 24K imperial gold & royal crown',
    skus: {
      frame: 'frame-inferno-fire',
      avatar_effect: 'effect-blazing-flames',
      name_color: 'name-pure-gold',
      name_font: 'font-royal-serif',
      title: 'title-founder-vip',
      badge: 'badge-crown-gold',
      chat_bubble: 'bubble-royal-gold',
      banner: 'banner-cyber-synthwave',
    },
  },
  {
    id: 'sakura',
    name: 'Anime Sakura Spirit',
    emoji: '🌸',
    description: 'Ethereal northern lights portal, sweet romantic hearts & neon cursive script',
    skus: {
      frame: 'frame-aurora-borealis',
      avatar_effect: 'effect-sakura-petals',
      name_color: 'name-cosmic-purple',
      name_font: 'font-cursive-neon',
      title: 'title-night-owl',
      badge: 'badge-coffee-cup',
      chat_bubble: 'bubble-kawaii-pastel',
      banner: 'banner-pastel-dream',
    },
  },
  {
    id: 'arcade',
    name: 'Retro 8-Bit Gamer',
    emoji: '👾',
    description: 'Glitch synthwave border, stardust sparkles, nostalgic 8-bit font & chatterbox badge',
    skus: {
      frame: 'frame-glitch-synth',
      avatar_effect: 'effect-stardust-sparkles',
      name_color: 'name-cyber-matrix',
      name_font: 'font-retro-pixel',
      title: 'title-certified-yapper',
      badge: 'badge-diamond-gem',
      chat_bubble: 'bubble-midnight-glass',
      banner: 'banner-emerald-matrix',
    },
  },
  {
    id: 'cosmic',
    name: 'Cosmic Void Emperor',
    emoji: '🌌',
    description: 'Celestial 24K halo, orbital satellites, deep space hyperdrive & legendary prestige',
    skus: {
      frame: 'frame-golden-halo',
      avatar_effect: 'effect-void-singularity',
      name_color: 'name-cosmic-purple',
      name_font: 'font-glitch-cyber',
      title: 'title-cosmic-legend',
      badge: 'badge-crown-gold',
      chat_bubble: 'bubble-cyber-neon',
      banner: 'banner-deep-nebula',
    },
  },
  {
    id: 'gothic',
    name: 'Dark Gothic Phantom',
    emoji: '💀',
    description: 'Ethereal blue spirit wisps, dark gothic blackletter script & midnight velvet glass',
    skus: {
      frame: 'frame-glitch-synth',
      avatar_effect: 'effect-phantom-ghost',
      name_color: 'name-cosmic-purple',
      name_font: 'font-gothic-medieval',
      title: 'title-code-wizard',
      badge: 'badge-ghost-spirit',
      chat_bubble: 'bubble-midnight-glass',
      banner: 'banner-deep-nebula',
    },
  },
  {
    id: 'saiyan',
    name: 'Dragon Ki Warrior',
    emoji: '💥',
    description: 'Golden Super Saiyan ki energy aura, Audiowide mecha typography & sovereign gold',
    skus: {
      frame: 'frame-inferno-fire',
      avatar_effect: 'effect-dragon-ki',
      name_color: 'name-pure-gold',
      name_font: 'font-audiowide-mecha',
      title: 'title-founder-vip',
      badge: 'badge-fire-spark',
      chat_bubble: 'bubble-royal-gold',
      banner: 'banner-cyber-synthwave',
    },
  },
  {
    id: 'couture',
    name: 'High Fashion VIP',
    emoji: '✨',
    description: '24K celestial halo, prismatic rainbow chroma, Syne haute couture & royal crown',
    skus: {
      frame: 'frame-golden-halo',
      avatar_effect: 'effect-stardust-sparkles',
      name_color: 'name-prismatic-rainbow',
      name_font: 'font-syne-luxury',
      title: 'title-founder-vip',
      badge: 'badge-crown-gold',
      chat_bubble: 'bubble-royal-gold',
      banner: 'banner-deep-nebula',
    },
  },
]
