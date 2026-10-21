/**
 * Roadmap Theme Tokens
 * Provides theme-aware styling classes matching MatchDistrict's design system:
 * - 'white' / default: Crisp modern esports theme with neutral surfaces, slate borders, blue-600 accent.
 * - 'gold' / 'royal_gold': Warm esports gold aesthetic with amber borders and amber-500/600 accent.
 * Full dark mode and light mode support with high-contrast text and border tokens.
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
      cardBg: 'bg-white dark:bg-[#13110c] border border-amber-200/80 dark:border-amber-900/60 shadow-xs rounded-xl',
      cardHeaderBg: 'bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-900/40',
      innerCardBg: 'bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/40 rounded-xl',
      activeTabBg: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-xs',
      inactiveTabBg: 'bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 border border-amber-200/50 dark:border-amber-800/50 font-semibold',
      primaryBtn: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl cursor-pointer transition shadow-xs min-h-[44px]',
      secondaryBtn: 'bg-white dark:bg-slate-900 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800/70 font-semibold rounded-xl cursor-pointer transition min-h-[44px]',
      accentText: 'text-amber-600 dark:text-amber-400 font-bold',
      mutedText: 'text-amber-800/70 dark:text-amber-300/70',
      headingText: 'text-slate-900 dark:text-amber-100 font-bold',
      bodyText: 'text-slate-700 dark:text-amber-200/90',
      badgeSuccess: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold rounded-full',
      badgeWarning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold rounded-full',
      badgeDanger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold rounded-full',
      badgeNeutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-full',
      badgeHighlight: 'bg-amber-100 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold rounded-full',
      inputBg: 'bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/70 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl',
      modalOverlay: 'bg-slate-950/60 backdrop-blur-xs',
      modalBg: 'bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xl rounded-xl text-slate-900 dark:text-slate-100',
      divider: 'border-amber-200/60 dark:border-amber-900/40',
      subtleDivider: 'border-amber-100/60 dark:border-amber-900/20',
      rowHover: 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
      tableHeaderBg: 'bg-amber-50/50 dark:bg-amber-950/30',
    };
  }

  // Global Neutral / Blue Theme (matches MatchDistrict site theme)
  return {
    isGold: false,
    cardBg: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs rounded-xl',
    cardHeaderBg: 'bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800',
    innerCardBg: 'bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800/60 rounded-xl',
    activeTabBg: 'bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs',
    inactiveTabBg: 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer transition shadow-xs min-h-[44px]',
    secondaryBtn: 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-xl cursor-pointer transition min-h-[44px]',
    accentText: 'text-blue-600 dark:text-blue-400 font-bold',
    mutedText: 'text-slate-500 dark:text-slate-400',
    headingText: 'text-slate-900 dark:text-slate-100 font-bold',
    bodyText: 'text-slate-700 dark:text-slate-300',
    badgeSuccess: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold rounded-full',
    badgeWarning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold rounded-full',
    badgeDanger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold rounded-full',
    badgeNeutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-full',
    badgeHighlight: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold rounded-full',
    inputBg: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl',
    modalOverlay: 'bg-slate-950/60 backdrop-blur-xs',
    modalBg: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl text-slate-900 dark:text-slate-100',
    divider: 'border-slate-200/80 dark:border-slate-800',
    subtleDivider: 'border-slate-100 dark:border-slate-800/40',
    rowHover: 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40',
    tableHeaderBg: 'bg-slate-50/60 dark:bg-slate-800/50',
  };
}
