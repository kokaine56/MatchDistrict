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
    org: 'text-slate-800',
    status: 'text-slate-700',
    divider: 'border-slate-300',
    prizeBg: 'bg-emerald-100/50',
    prizeBorder: 'border-emerald-200',
    prizeText: 'text-emerald-800',
    entryBg: 'bg-amber-100/50',
    entryBorder: 'border-amber-200',
    entryText: 'text-amber-800',
    formatLabel: 'text-slate-600',
    formatValue: 'text-slate-900',
    slotLabel: 'text-slate-600',
    slotIcon: 'text-slate-600',
    slotValue: 'text-slate-900',
    btnBg: 'bg-primary'
  },
  DARK_BG: {
    title: 'text-white',
    org: 'text-slate-200',
    status: 'text-slate-300',
    divider: 'border-slate-700',
    prizeBg: 'bg-emerald-950/40',
    prizeBorder: 'border-emerald-800/40',
    prizeText: 'text-emerald-400',
    entryBg: 'bg-amber-950/40',
    entryBorder: 'border-amber-800/40',
    entryText: 'text-amber-400',
    formatLabel: 'text-slate-400',
    formatValue: 'text-white',
    slotLabel: 'text-slate-400',
    slotIcon: 'text-slate-400',
    slotValue: 'text-white',
    btnBg: 'bg-primary'
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
    tagline: 'Luxury Brushed Gold Metal',
    accentColor: '#D97706',
    borderHex: '#F59E0B',
    cardBg: '#FAF5E6',
    pageBg: '#0E0C06',
    textStyle: 'LIGHT_BG',
    heroGradient: 'from-amber-950/90 via-slate-950/95 to-[#0E0C06]',
    glowColor: 'rgba(245, 158, 11, 0.3)'
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
 * Get typography classes based on theme's textStyle
 */
export function getThemeTypography(themeKey) {
  const config = getThemeConfig(themeKey)
  return TEXT_STYLES[config.textStyle] || TEXT_STYLES.LIGHT_BG
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
