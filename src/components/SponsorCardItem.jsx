import { motion } from 'motion/react';
import { Eye, EyeOff, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function SponsorCardItem({
  card,
  isSelected,
  onSelect,
  onToggleFreeze,
}) {
  const [revealSecrets, setRevealSecrets] = useState(false);

  // Helper to get classes for each theme card
  const getThemeStyles = () => {
    switch (card.type) {
      case 'OBSIDIAN_ELITE':
        return {
          wrapper: 'carbon-pattern border border-neutral-800 text-white min-h-[230px]',
          tag: 'text-neutral-300 border-neutral-700 bg-neutral-900/80',
          contactless: 'text-neutral-300',
          chipGold: false,
          labelColor: 'text-neutral-400',
          accentBorder: 'ring-2 ring-neutral-400 shadow-[0_0_25px_rgba(255,255,255,0.08)]',
        };
      case 'DIAMOND_PREFERRED':
        return {
          wrapper: 'bg-gradient-to-tr from-[#020617] via-[#0b132b] to-[#1d3557] border border-blue-900/40 text-blue-100 min-h-[230px]',
          tag: 'text-yellow-400 border-yellow-500/30 bg-[#bf8f30]/20',
          contactless: 'text-yellow-400',
          chipGold: true,
          labelColor: 'text-blue-300/80',
          accentBorder: 'ring-2 ring-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.3)]',
        };
      case 'GOLD_ELITE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#543d04] via-[#c69324] to-[#f3cf65] border border-[#a17812] text-yellow-950 min-h-[230px]',
          tag: 'text-yellow-900 border-yellow-900/20 bg-yellow-100/30',
          contactless: 'text-yellow-900',
          chipGold: true,
          labelColor: 'text-yellow-950/70',
          accentBorder: 'ring-2 ring-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.3)]',
        };
      case 'SILVER_PLUS':
        return {
          wrapper: 'bg-gradient-to-tr from-[#1e293b] via-[#475569] to-[#94a3b8] border border-slate-500/40 text-slate-100 min-h-[230px]',
          tag: 'text-slate-100 border-slate-200/40 bg-slate-800/40',
          contactless: 'text-slate-100',
          chipGold: true,
          labelColor: 'text-slate-200/70',
          accentBorder: 'ring-2 ring-slate-300 shadow-[0_0_25px_rgba(148,163,184,0.3)]',
        };
      case 'EMERALD_PRESTIGE':
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-teal-500 min-h-[230px]',
          tag: 'text-emerald-100 border-emerald-300/30 bg-emerald-950/50',
          contactless: 'text-teal-200',
          chipGold: true,
          labelColor: 'text-teal-950/70',
          accentBorder: 'ring-2 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
        };
      default:
        return {
          wrapper: 'bg-gradient-to-tr from-[#022c22] via-[#0d9488] to-[#2dd4bf] border border-teal-500/40 text-teal-500 min-h-[230px]',
          tag: 'text-emerald-100 border-emerald-300/30 bg-emerald-950/50',
          contactless: 'text-teal-200',
          chipGold: true,
          labelColor: 'text-teal-950/70',
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
      className={`relative rounded-2xl overflow-hidden card-shimmer cursor-pointer transition-all duration-300 flex flex-col justify-between p-6 shadow-2xl select-none ${
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

      {/* Freeze overlay */}
      {card.isFrozen && (
        <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-center p-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-2 animate-bounce" />
          <p className="text-white font-medium text-lg tracking-wide">CARD TEMPORARILY FROZEN</p>
          <p className="text-slate-400 text-xs px-4 mt-1">Pending Sponsor Authorization</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFreeze();
            }}
            className="mt-4 px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-semibold tracking-wider transition shadow-lg shadow-sky-500/20"
          >
            ACTIVE AUTHORIZATION
          </button>
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
        <span className={`text-[10px] tracking-widest font-mono uppercase font-semibold block mb-1 ${styles.labelColor}`}>
          Sponsored Balance
        </span>
        <div className="text-2xl sm:text-3xl font-display tracking-tight font-bold flex items-baseline">
          {formatBalance(card.balance)}
        </div>
      </div>

      {/* BOTTOM METADATA ROW */}
      <div className="flex items-end justify-between z-10 w-full mt-4">
        <div className="flex flex-col">
          <span className={`text-[8.5px] uppercase tracking-wider block font-semibold mb-0.5 ${styles.labelColor}`}>
            Cardmember Name
          </span>
          <span className="text-xs sm:text-[13px] font-mono tracking-wider font-semibold opacity-95">
            {card.cardmemberName}
          </span>
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
            className="bg-black/40 hover:bg-black/60 p-1 rounded-full text-white/80 hover:text-white transition cursor-pointer"
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
          className="absolute inset-x-0 bottom-16 bg-black/90 backdrop-blur-md border-y border-neutral-800 z-20 px-6 py-3 flex text-left flex-col text-neutral-300"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[9px] text-[#38bdf8] tracking-widest font-mono uppercase font-semibold mb-0.5">Sensitive Details</div>
          <div className="flex justify-between items-center pr-2">
            <span className="font-mono text-sm tracking-[0.2em] font-medium text-white">{card.cardNumber}</span>
            <span className="font-mono text-xs text-neutral-400">EXP: {card.expiry}</span>
            <span className="font-mono text-xs text-neutral-400">CVV: {card.cvv}</span>
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
