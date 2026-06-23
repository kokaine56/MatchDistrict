import { motion } from 'motion/react';

export default function SponsorCardItem({
  card,
  isSelected,
  onSelect,
  onToggleFreeze,
}) {
  // Helper to get classes for each theme card
  const getThemeStyles = () => {
    switch (card.type) {
      case 'OBSIDIAN_ELITE':
        return {
          wrapper: 'carbon-pattern border border-neutral-800 text-white min-h-[200px]',
          tag: 'border-white/20 bg-white/10',
          accentBorder: 'ring-2 ring-white/30 shadow-[0_0_25px_rgba(255,255,255,0.08)]',
        };
      case 'DIAMOND_PREFERRED':
        return {
          wrapper: 'bg-gradient-to-tr from-[#020617] via-[#0b132b] to-[#1d3557] border border-blue-900/40 text-white min-h-[200px]',
          tag: 'border-white/20 bg-white/10',
          accentBorder: 'ring-2 ring-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.3)]',
        };
      case 'GOLD_ELITE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#543d04] via-[#c69324] to-[#f3cf65] border border-[#a17812] text-white min-h-[200px]',
          tag: 'border-white/30 bg-black/20',
          accentBorder: 'ring-2 ring-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.3)]',
        };
      case 'SILVER_PLUS':
        return {
          wrapper: 'bg-gradient-to-tr from-[#1e293b] via-[#475569] to-[#94a3b8] border border-slate-500/40 text-white min-h-[200px]',
          tag: 'border-white/20 bg-white/10',
          accentBorder: 'ring-2 ring-slate-300 shadow-[0_0_25px_rgba(148,163,184,0.3)]',
        };
      case 'EMERALD_PRESTIGE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-white min-h-[200px]',
          tag: 'border-white/20 bg-white/10',
          accentBorder: 'ring-2 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
        };
      default:
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-white min-h-[200px]',
          tag: 'border-white/20 bg-white/10',
          accentBorder: 'ring-2 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
        };
    }
  };

  const styles = getThemeStyles();

  const formatBalance = (val) => {
    if (val >= 1000000 && card.type === 'OBSIDIAN_ELITE') {
      return `₹${(val / 100000).toLocaleString('en-IN')},000+`;
    }
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <motion.div
      whileHover={{ y: card.isFrozen ? 0 : -6, scale: card.isFrozen ? 1 : 1.01 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={() => {
        if (!card.isFrozen) onSelect();
      }}
      className={`relative rounded-2xl overflow-hidden card-shimmer cursor-pointer transition-all duration-300 flex flex-col justify-between p-6 shadow-2xl select-none sponsored-card ${
        styles.wrapper
      } ${isSelected ? styles.accentBorder : 'hover:shadow-xl hover:border-neutral-700/60'}`}
      id={`sponsored-card-${card.id}`}
    >
      {/* Background concentric ripples for Diamond Preferred */}
      {card.type === 'DIAMOND_PREFERRED' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
          <div className="absolute top-1/2 left-12 w-0 h-0 flex items-center justify-center">
            <div className="radar-ring animate-radar-1" />
            <div className="radar-ring animate-radar-2" />
            <div className="radar-ring animate-radar-3" />
          </div>
        </div>
      )}

      {/* Tag Pill */}
      <div className="flex items-start justify-between z-10 w-full mb-2">
        <div className={`text-[9.5px] font-semibold tracking-[0.16em] uppercase px-3 py-1.5 rounded-full border shadow-sm select-none ${styles.tag}`}>
          {card.tagName}
        </div>
      </div>

      {/* Middle — Sponsored Balance */}
      <div className="flex flex-col my-auto z-10">
        <span className="text-[10px] tracking-widest uppercase font-semibold block mb-1">
          Sponsored Balance
        </span>
        <div className="text-2xl sm:text-3xl tracking-tight font-black flex items-baseline">
          {formatBalance(card.balance)}
        </div>
      </div>

      {/* Bottom — Sponsor Name */}
      <div className="flex items-end z-10 w-full mt-4">
        <div className="flex flex-col">
          <span className="text-[8.5px] uppercase tracking-wider block font-semibold mb-0.5">
            Sponsor
          </span>
          <span className="text-xs sm:text-[13px] tracking-wider font-extrabold uppercase">
            {card.cardmemberName}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
