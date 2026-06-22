import { motion } from 'motion/react';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function SponsorCardItem({
  card,
  isSelected,
  onSelect,
  onToggleFreeze,
}) {
  const [revealSecrets, setRevealSecrets] = useState(false);

  const cardDigits = card.lastFour || String(card.id).slice(-4).padStart(4, '0').replace(/[^0-9]/g, '7');

  // Helper to get classes for each theme card
  const getThemeStyles = () => {
    switch (card.type) {
      case 'OBSIDIAN_ELITE':
        return {
          wrapper: 'carbon-pattern border border-neutral-800 text-white min-h-[230px]',
          tag: 'border-white/20 bg-white/10',
          contactless: '',
          chipGold: false,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-white/30 shadow-[0_0_25px_rgba(255,255,255,0.08)]',
        };
      case 'DIAMOND_PREFERRED':
        return {
          wrapper: 'bg-gradient-to-tr from-[#020617] via-[#0b132b] to-[#1d3557] border border-blue-900/40 text-white min-h-[230px]',
          tag: 'border-white/20 bg-white/10',
          contactless: '',
          chipGold: true,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.3)]',
        };
      case 'GOLD_ELITE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#543d04] via-[#c69324] to-[#f3cf65] border border-[#a17812] text-white min-h-[230px]',
          tag: 'border-white/30 bg-black/20',
          contactless: '',
          chipGold: true,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.3)]',
        };
      case 'SILVER_PLUS':
        return {
          wrapper: 'bg-gradient-to-tr from-[#1e293b] via-[#475569] to-[#94a3b8] border border-slate-500/40 text-white min-h-[230px]',
          tag: 'border-white/20 bg-white/10',
          contactless: '',
          chipGold: true,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-slate-300 shadow-[0_0_25px_rgba(148,163,184,0.3)]',
        };
      case 'EMERALD_PRESTIGE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-white min-h-[230px]',
          tag: 'border-white/20 bg-white/10',
          contactless: '',
          chipGold: true,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
        };
      default:
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-white min-h-[230px]',
          tag: 'border-white/20 bg-white/10',
          contactless: '',
          chipGold: true,
          labelColor: 'text-white',
          accentBorder: 'ring-2 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
        };
    }
  };

  const styles = getThemeStyles();

  // Helper for dynamic formatting of money
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

      {/* TOP ROW */}
      <div className="flex items-start justify-between z-10 w-full mb-4">
        {/* EMV Microchip */}
        <div className={`w-11 h-9 rounded-md relative overflow-hidden shadow-inner flex flex-wrap p-1 border ${
          styles.chipGold 
            ? 'bg-gradient-to-br from-amber-100 via-amber-300 to-amber-600 border-amber-700/40 text-amber-900' 
            : 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 border-slate-600/40 text-slate-800'
        }`}>
          <div className="absolute top-0 bottom-0 left-[35%] w-[1px] bg-black/15" />
          <div className="absolute top-0 bottom-0 left-[65%] w-[1px] bg-black/15" />
          <div className="absolute left-0 right-0 top-[50%] h-[1px] bg-black/15" />
          <div className="absolute top-[20%] bottom-[20%] left-0 right-0 border-y border-black/10" />
          <div className="absolute top-1 bottom-1 left-2 right-2 rounded-[2px] border border-black/15 bg-transparent" />
        </div>

        {/* Tag Pill */}
        <div className={`text-[9.5px] font-semibold tracking-[0.16em] uppercase px-3 py-1.5 rounded-full border shadow-sm select-none ${styles.tag}`}>
          {card.tagName}
        </div>
      </div>

      {/* MIDDLE VALUE SECTION */}
      <div className="flex flex-col my-auto z-10">
          <span className={`text-[10px] tracking-widest uppercase font-semibold block mb-1`}>
            Sponsored Balance
        </span>
        <div className="text-2xl sm:text-3xl tracking-tight font-black flex items-baseline">
          {formatBalance(card.balance)}
        </div>
      </div>

      {/* BOTTOM METADATA ROW */}
      <div className="flex items-end justify-between z-10 w-full mt-4">
        <div className="flex flex-col">
          <span className={`text-[8.5px] uppercase tracking-wider block font-semibold mb-0.5`}>
            Cardmember Name
          </span>
          <span className="text-xs sm:text-[13px] tracking-wider font-extrabold uppercase">
            {card.cardmemberName}
          </span>
          <div className="text-[11px] font-medium tracking-widest mt-1">•••• {cardDigits}</div>
        </div>

        {/* Wireless payment wavy signals logo */}
        <div className={styles.contactless}>
          <svg className="w-5 h-5 opacity-90 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 8.5C6.5 10 6.5 14 5 15.5" />
            <path d="M8.5 6C11 8.5 11 15.5 8.5 18" />
            <path d="M12 3.5C15.5 7 15.5 17 12 20.5" />
          </svg>
        </div>
      </div>

      {/* Card Info Overlay Actions */}
      <div className="absolute top-4 left-6 flex items-center gap-1 z-20">
        {isSelected && !card.isFrozen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRevealSecrets(!revealSecrets);
            }}
            className="bg-black/40 hover:bg-black/60 p-1 rounded-full hover:text-white/80 transition cursor-pointer"
            title="Toggle Card Details"
          >
            {revealSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Hidden Card Number Revealed */}
      {revealSecrets && isSelected && !card.isFrozen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-0 bottom-16 bg-black/90 backdrop-blur-md border-y border-neutral-800 z-20 px-6 py-3 flex text-left flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[9px] tracking-widest uppercase font-semibold mb-0.5">Sensitive Details</div>
          <div className="flex justify-between items-center pr-2">
            <span className="text-sm tracking-[0.2em] font-medium">{card.cardNumber}</span>
            <span className="text-xs">EXP: {card.expiry}</span>
            <span className="text-xs">CVV: {card.cvv}</span>
          </div>
        </motion.div>
      )}

      {/* Selected Indicator Check Indicator */}
      {isSelected && !card.isFrozen && (
        <div className="absolute top-4 left-14 z-20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-neutral-950" />
        </div>
      )}
    </motion.div>
  );
}
