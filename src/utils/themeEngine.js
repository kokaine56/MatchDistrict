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
  // ── FREE THEME (Free Plan) ────────────────────────────────────────────────
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

  // ── PRO THEME (Pro Plan) ──────────────────────────────────────────────────
  gold: {
    id: 'gold',
    name: 'Royal Gold',
    tier: THEME_TIERS.PRO,
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
  }
}

// Aliases for compatibility & legacy names
THEME_REGISTRY.royal_gold = THEME_REGISTRY.gold
THEME_REGISTRY['royal gold'] = THEME_REGISTRY.gold
THEME_REGISTRY.royalgold = THEME_REGISTRY.gold
THEME_REGISTRY.blue = THEME_REGISTRY.white
THEME_REGISTRY.mint = THEME_REGISTRY.white
THEME_REGISTRY.ember = THEME_REGISTRY.gold
THEME_REGISTRY.royal = THEME_REGISTRY.gold
THEME_REGISTRY.golden_obsidian = THEME_REGISTRY.gold
THEME_REGISTRY.cyber = THEME_REGISTRY.gold
THEME_REGISTRY.crimson = THEME_REGISTRY.gold
THEME_REGISTRY.cosmic = THEME_REGISTRY.gold
THEME_REGISTRY.diamond = THEME_REGISTRY.gold

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
  if (config.tier === THEME_TIERS.PRO) {
    return normUserTier === 'pro' || normUserTier === 'organizer' || normUserTier === 'basic'
  }
  return true
}

/**
 * Grouped theme list for UI Selection in Wizard (2 themes only: Free Arctic White & Pro Royal Gold)
 */
export function getThemesByTier() {
  return {
    [THEME_TIERS.FREE]: [THEME_REGISTRY.white],
    [THEME_TIERS.PRO]: [THEME_REGISTRY.gold]
  }
}
