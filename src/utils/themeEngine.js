/**
 * Match District Master Collectible Theme Engine
 * Standardized Central Theme Registry for Cards & Detail Page Hero Themes
 */

export const THEME_TIERS = {
  FREE: 'free',
  BASIC: 'basic',
  PRO: 'pro'
}

// All themes use the same clean base typography.
// Dark text is for light themes, Light text is for dark themes.
export const TEXT_STYLES = {
  LIGHT_BG: {
    title: 'text-slate-900',
    titleText: 'text-slate-900 font-black',
    org: 'text-slate-800',
    orgText: 'text-slate-800 font-bold',
    status: 'text-slate-700',
    statusText: 'text-slate-700 font-extrabold',
    targetIcon: 'text-slate-700',
    divider: 'border-slate-300/80',
    prizeText: 'text-slate-900 font-black',
    prizeIcon: 'text-amber-600',
    prizeShadow: '',
    entryText: 'text-slate-900 font-black',
    entryIcon: 'text-emerald-600',
    entryShadow: '',
    formatLabel: 'text-slate-600 font-bold',
    formatValue: 'text-slate-900 font-black',
    slotLabel: 'text-slate-600 font-bold',
    slotIcon: 'text-slate-600',
    slotValue: 'text-slate-900 font-black',
    btnBg: 'bg-primary',
    btnText: 'text-white',
    gameBg: 'bg-slate-200/60',
    gameBorder: 'border-slate-300'
  },
  DARK_BG: {
    title: 'text-white',
    titleText: 'text-white font-black',
    org: 'text-slate-200',
    orgText: 'text-slate-200 font-bold',
    status: 'text-slate-300',
    statusText: 'text-slate-300 font-extrabold',
    targetIcon: 'text-slate-300',
    divider: 'border-slate-700',
    prizeText: 'text-[#FFFFFF] font-black',
    prizeIcon: 'text-amber-400',
    prizeShadow: 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
    entryText: 'text-[#FFFFFF] font-black',
    entryIcon: 'text-emerald-400',
    entryShadow: 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
    formatLabel: 'text-slate-400 font-bold',
    formatValue: 'text-white font-black',
    slotLabel: 'text-slate-400 font-bold',
    slotIcon: 'text-slate-400',
    slotValue: 'text-white font-black',
    btnBg: 'bg-primary',
    btnText: 'text-white',
    gameBg: 'bg-slate-800/50',
    gameBorder: 'border-slate-700'
  }
}

export const THEME_REGISTRY = {
  // ── FREE THEMES ──────────────────────────────────────────────────────────
  white: {
    id: 'white',
    name: 'Arctic White',
    tier: THEME_TIERS.FREE,
    tagline: 'Apple Luxury Aesthetic',
    accentColor: '#3B82F6',
    borderHex: '#E2E8F0',
    cardBg: '#FFFFFF',
    pageBg: '#07080C',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-slate-900/90 via-slate-950/95 to-[#07080C]',
    glowColor: 'rgba(59, 130, 246, 0.15)'
  },
  blue: {
    id: 'blue',
    name: 'Frost Blue',
    tier: THEME_TIERS.FREE,
    tagline: 'Frozen Atmospheric Energy',
    accentColor: '#2563EB',
    borderHex: '#BFDBFE',
    cardBg: '#E8F0FE',
    pageBg: '#060B18',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-blue-950/90 via-slate-950/95 to-[#060B18]',
    glowColor: 'rgba(37, 99, 235, 0.25)'
  },
  mint: {
    id: 'mint',
    name: 'Sage Mint',
    tier: THEME_TIERS.FREE,
    tagline: 'Botanical Glass Energy',
    accentColor: '#0D9488',
    borderHex: '#6EE7B7',
    cardBg: '#ECFDF5',
    pageBg: '#051210',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-emerald-950/90 via-slate-950/95 to-[#051210]',
    glowColor: 'rgba(16, 185, 129, 0.22)'
  },

  // ── BASIC THEMES ─────────────────────────────────────────────────────────
  gold: {
    id: 'gold',
    name: 'Royal Gold',
    tier: THEME_TIERS.BASIC,
    tagline: 'Luxury Solid Gold Plate',
    accentColor: '#FFC107',
    borderHex: '#FFCA28',
    cardBg: '#D4A017',
    pageBg: '#0E0C06',
    textStyle: 'DARK_BG',
    heroGradient: 'from-amber-950/90 via-slate-950/95 to-[#0E0C06]',
    glowColor: 'rgba(255, 193, 7, 0.45)',
    typographyOverrides: {
      titleText: 'text-[#FFFFFF] font-black',
      title: 'text-[#FFFFFF] font-black',
      orgText: 'text-[#FFFFFF] font-bold',
      org: 'text-[#FFFFFF] font-bold',
      statusText: 'text-[#3D2500] font-extrabold',
      status: 'text-[#3D2500] font-extrabold',
      targetIcon: 'text-amber-200',
      divider: 'border-amber-500/25',
      prizeBg: 'bg-[#2A1B00]/55 backdrop-blur-sm',
      prizeBorder: 'border-[#FFC107]/40',
      prizeText: 'text-[#FFFFFF] font-black',
      entryBg: 'bg-[#2A1B00]/55 backdrop-blur-sm',
      entryBorder: 'border-[#FFC107]/40',
      entryText: 'text-[#FFFFFF] font-black',
      formatLabel: 'text-amber-200/90 font-extrabold tracking-widest',
      formatValue: 'text-[#FFFFFF] font-black',
      slotLabel: 'text-amber-200/90 font-extrabold tracking-widest',
      slotIcon: 'text-amber-200',
      slotValue: 'text-[#FFFFFF] font-black',
      btnBg: 'bg-gradient-to-r from-[#FFE082] via-[#FFC107] to-[#FFCA28] border border-[#FFF4C2]/70 shadow-[0_4px_12px_rgba(80,50,0,0.5)]',
      btnText: 'text-[#3D2500] font-black',
      gameBg: 'bg-[#2A1B00]/55 border border-[#FFC107]/40',
      gameBorder: 'border-[#FFC107]/40'
    }
  },
  ember: {
    id: 'ember',
    name: 'Ember Flame',
    tier: THEME_TIERS.BASIC,
    tagline: 'Molten Metal & Burning Orange',
    accentColor: '#EA580C',
    borderHex: '#F97316',
    cardBg: '#FFF7ED',
    pageBg: '#160A04',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-orange-950/90 via-slate-950/95 to-[#160A04]',
    glowColor: 'rgba(249, 115, 22, 0.35)'
  },
  royal: {
    id: 'royal',
    name: 'Royal Purple',
    tier: THEME_TIERS.BASIC,
    tagline: 'Electric Galaxy Esports',
    accentColor: '#9333EA',
    borderHex: '#C084FC',
    cardBg: '#FAF5FF',
    pageBg: '#10071A',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-purple-950/90 via-slate-950/95 to-[#10071A]',
    glowColor: 'rgba(168, 85, 247, 0.35)'
  },

  // ── PRO THEMES (LEGENDARY GAME COLLECTIBLES) ──────────────────────────────
  golden_obsidian: {
    id: 'golden_obsidian',
    name: 'Obsidian Gold',
    tier: THEME_TIERS.PRO,
    tagline: 'Volcanic Rock & Molten Gold Veins',
    accentColor: '#F59E0B',
    borderHex: '#F59E0B',
    cardBg: '#151515',
    pageBg: '#090B10',
    textStyle: 'DARK_BG',
    heroGradient: 'from-amber-950/80 via-slate-950/98 to-[#090B10]',
    glowColor: 'rgba(245, 158, 11, 0.45)'
  },
  cyber: {
    id: 'cyber',
    name: 'Neon Cyber',
    tier: THEME_TIERS.PRO,
    tagline: 'Cyberpunk Grid & Holographic Scan',
    accentColor: '#06B6D4',
    borderHex: '#38BDF8',
    cardBg: '#091528',
    pageBg: '#040C1A',
    textStyle: 'DARK_BG',
    heroGradient: 'from-cyan-950/80 via-slate-950/98 to-[#040C1A]',
    glowColor: 'rgba(56, 189, 248, 0.45)'
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Phantom',
    tier: THEME_TIERS.PRO,
    tagline: 'Dark Ghost Smoke & Blood Red Symbols',
    accentColor: '#EF4444',
    borderHex: '#F87171',
    cardBg: '#1A0C0E',
    pageBg: '#120507',
    textStyle: 'DARK_BG',
    heroGradient: 'from-red-950/85 via-slate-950/98 to-[#120507]',
    glowColor: 'rgba(239, 68, 68, 0.45)'
  },
  cosmic: {
    id: 'cosmic',
    name: 'Cosmic Infinity',
    tier: THEME_TIERS.PRO,
    tagline: 'Deep Space Nebula & Galaxy Streams',
    accentColor: '#8B5CF6',
    borderHex: '#A78BFA',
    cardBg: '#0F0E26',
    pageBg: '#070617',
    textStyle: 'DARK_BG',
    heroGradient: 'from-violet-950/80 via-slate-950/98 to-[#070617]',
    glowColor: 'rgba(167, 139, 250, 0.45)'
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond Elite',
    tier: THEME_TIERS.PRO,
    tagline: 'Crystal Platinum & Refraction Streaks',
    accentColor: '#38BDF8',
    borderHex: '#E2E8F0',
    cardBg: '#151D2A',
    pageBg: '#0B1019',
    textStyle: 'DARK_BG',
    heroGradient: 'from-slate-900/80 via-slate-950/98 to-[#0B1019]',
    glowColor: 'rgba(226, 232, 240, 0.45)'
  }
}

// Alias mappings for legacy or alternative names
THEME_REGISTRY.emerald = { ...THEME_REGISTRY.mint, id: 'emerald' } // Emerald Jade removed per request, fallback to Mint
THEME_REGISTRY.golden_emerald = { ...THEME_REGISTRY.mint, id: 'golden_emerald' }
THEME_REGISTRY.golden_rose = {
  ...THEME_REGISTRY.gold,
  id: 'golden_rose',
  name: 'Rose Gold',
  tier: THEME_TIERS.BASIC,
  accentColor: '#E11D48',
  borderHex: '#FB7185',
  cardBg: '#FFF1F2',
  pageBg: '#14080D'
}

/**
 * Get theme object by key or return white default
 */
export function getThemeConfig(themeKey) {
  const key = (themeKey || 'white').toLowerCase().trim()
  return THEME_REGISTRY[key] || THEME_REGISTRY.white
}

/**
 * Get typography classes based on theme's textStyle and optional overrides
 */
export function getThemeTypography(themeKey) {
  const config = getThemeConfig(themeKey)
  const base = TEXT_STYLES[config.textStyle] || TEXT_STYLES.LIGHT_BG
  return {
    ...base,
    ...(config.typographyOverrides || {})
  }
}

/**
 * Check if a theme is unlocked based on user's subscription tier
 */
export function isThemeUnlocked(themeKey, userTier = 'Free') {
  const config = getThemeConfig(themeKey)
  const normUserTier = (userTier || 'Free').toLowerCase()

  if (config.tier === THEME_TIERS.FREE) return true
  if (config.tier === THEME_TIERS.BASIC) {
    return normUserTier === 'basic' || normUserTier === 'pro' || normUserTier === 'organizer'
  }
  if (config.tier === THEME_TIERS.PRO) {
    return normUserTier === 'pro' || normUserTier === 'organizer'
  }
  return true
}

/**
 * Grouped theme list for UI Selection in Wizard
 */
export function getThemesByTier() {
  const all = Object.values(THEME_REGISTRY).filter(t => !['golden_emerald', 'golden_rose', 'emerald'].includes(t.id))
  return {
    [THEME_TIERS.FREE]: all.filter(t => t.tier === THEME_TIERS.FREE),
    [THEME_TIERS.BASIC]: all.filter(t => t.tier === THEME_TIERS.BASIC),
    [THEME_TIERS.PRO]: all.filter(t => t.tier === THEME_TIERS.PRO)
  }
}
