/**
 * Roadmap Theme Tokens
 * Provides theme-aware styling classes supporting:
 * - 'gold' / 'royal_gold': Rich esports gold aesthetic with amber borders and warm highlights
 * - 'white' / default: Modern cyber dark / slate gaming aesthetic with cyan/blue accents
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
      cardBg: 'bg-[#18150f] border border-amber-500/25 shadow-xl',
      cardHeaderBg: 'bg-gradient-to-r from-amber-950/40 via-[#1c1811] to-[#18150f] border-b border-amber-500/20',
      innerCardBg: 'bg-[#1f1b14] border border-amber-500/20',
      activeTabBg: 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black shadow-md shadow-amber-500/20',
      inactiveTabBg: 'bg-[#1a1610] text-amber-200/70 hover:text-amber-100 hover:bg-[#252018] border border-amber-500/15',
      primaryBtn: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold shadow-md shadow-amber-500/20 cursor-pointer',
      secondaryBtn: 'bg-[#241f17] hover:bg-[#2e271e] text-amber-300 border border-amber-500/30 font-bold cursor-pointer',
      accentText: 'text-amber-400',
      mutedText: 'text-amber-200/60',
      headingText: 'text-amber-100 font-extrabold',
      bodyText: 'text-amber-100/90',
      badgeSuccess: 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30',
      badgeWarning: 'bg-amber-950/60 text-amber-300 border border-amber-500/30',
      badgeDanger: 'bg-red-950/60 text-red-300 border border-red-500/30',
      badgeNeutral: 'bg-amber-950/40 text-amber-200/80 border border-amber-500/20',
      inputBg: 'bg-[#13110c] border border-amber-500/30 text-amber-100 placeholder-amber-400/30 focus:border-amber-400 focus:ring-1 focus:ring-amber-400',
      modalOverlay: 'bg-black/80 backdrop-blur-md',
      modalBg: 'bg-[#18150f] border border-amber-500/30 shadow-2xl',
      divider: 'border-amber-500/20',
    };
  }

  // Default cyber / slate modern esports dark theme
  return {
    isGold: false,
    cardBg: 'bg-[#0f172a] border border-slate-700/60 shadow-xl',
    cardHeaderBg: 'bg-gradient-to-r from-slate-900 via-[#0f172a] to-slate-900 border-b border-slate-700/50',
    innerCardBg: 'bg-[#1e293b]/80 border border-slate-700/50',
    activeTabBg: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-500/20',
    inactiveTabBg: 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-750 border border-slate-700/40',
    primaryBtn: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold shadow-md shadow-cyan-500/20 cursor-pointer',
    secondaryBtn: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold cursor-pointer',
    accentText: 'text-cyan-400',
    mutedText: 'text-slate-400',
    headingText: 'text-slate-100 font-extrabold',
    bodyText: 'text-slate-200',
    badgeSuccess: 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30',
    badgeWarning: 'bg-amber-950/60 text-amber-300 border border-amber-500/30',
    badgeDanger: 'bg-red-950/60 text-red-300 border border-red-500/30',
    badgeNeutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    inputBg: 'bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400',
    modalOverlay: 'bg-black/80 backdrop-blur-md',
    modalBg: 'bg-[#0f172a] border border-slate-700 shadow-2xl',
    divider: 'border-slate-800',
  };
}
