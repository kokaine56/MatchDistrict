/**
 * Roadmap Theme Tokens
 * Provides theme-aware styling classes matching MatchDistrict's global light aesthetic:
 * - 'white' / default: Crisp modern esports light theme (white cards, slate-50/100 backgrounds, slate-200 borders, blue-600 accents)
 * - 'gold' / 'royal_gold': Warm esports gold light aesthetic (ivory/amber-50 cards, amber-300 borders, amber-600 accents)
 */

export function isGoldTheme(cardColor) {
  if (!cardColor) return false;
  const c = String(cardColor).toLowerCase().trim();
  return ['gold', 'royal_gold', 'royal gold', 'royalgold'].includes(c);
}

export function getRoadmapTheme(cardColor) {
  const gold = isGoldTheme(cardColor);

  if (gold) {
    return {
      isGold: true,
      cardBg: 'bg-white border border-amber-200 shadow-sm rounded-2xl',
      cardHeaderBg: 'bg-gradient-to-r from-amber-50/90 via-white to-amber-50/50 border-b border-amber-200/80',
      innerCardBg: 'bg-amber-50/40 border border-amber-200/70 rounded-xl',
      activeTabBg: 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-sm shadow-amber-500/25',
      inactiveTabBg: 'bg-amber-50/70 text-amber-900 hover:text-amber-950 hover:bg-amber-100/70 border border-amber-200/60 font-semibold',
      primaryBtn: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black shadow-sm shadow-amber-500/20 cursor-pointer transition',
      secondaryBtn: 'bg-white hover:bg-amber-50/80 text-amber-950 border border-amber-300 font-bold cursor-pointer transition shadow-xs',
      accentText: 'text-amber-700 font-bold',
      mutedText: 'text-amber-800/70',
      headingText: 'text-amber-950 font-black',
      bodyText: 'text-amber-950/90',
      badgeSuccess: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold',
      badgeWarning: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
      badgeDanger: 'bg-red-50 text-red-700 border border-red-200 font-bold',
      badgeNeutral: 'bg-amber-50 text-amber-900 border border-amber-200 font-semibold',
      inputBg: 'bg-white border border-amber-300 text-slate-900 placeholder-amber-700/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-500',
      modalOverlay: 'bg-slate-900/40 backdrop-blur-sm',
      modalBg: 'bg-white border border-amber-200 shadow-2xl rounded-2xl text-slate-900',
      divider: 'border-amber-200',
    };
  }

  // Global Light Theme (matches the rest of the application)
  return {
    isGold: false,
    cardBg: 'bg-white border border-slate-200 shadow-sm rounded-2xl',
    cardHeaderBg: 'bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200',
    innerCardBg: 'bg-slate-50/80 border border-slate-200/80 rounded-xl',
    activeTabBg: 'bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm shadow-blue-500/20',
    inactiveTabBg: 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200/60 font-semibold',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold shadow-sm shadow-blue-500/20 cursor-pointer transition',
    secondaryBtn: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 font-semibold cursor-pointer transition shadow-xs',
    accentText: 'text-blue-600 font-bold',
    mutedText: 'text-slate-500',
    headingText: 'text-slate-900 font-extrabold',
    bodyText: 'text-slate-700',
    badgeSuccess: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold',
    badgeWarning: 'bg-amber-50 text-amber-800 border border-amber-200 font-bold',
    badgeDanger: 'bg-red-50 text-red-700 border border-red-200 font-bold',
    badgeNeutral: 'bg-slate-100 text-slate-700 border border-slate-200 font-semibold',
    inputBg: 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
    modalOverlay: 'bg-slate-900/40 backdrop-blur-sm',
    modalBg: 'bg-white border border-slate-200 shadow-2xl rounded-2xl text-slate-900',
    divider: 'border-slate-200',
  };
}
