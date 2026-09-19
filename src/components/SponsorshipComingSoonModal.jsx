import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function SponsorshipComingSoonModal({ isOpen, onClose }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Sponsorship coming soon"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0E1526] border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-6 pt-8 pb-6 sm:px-8 flex flex-col items-center text-center overflow-y-auto">
              <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl bg-gradient-to-br from-[#3B82F6]/25 to-transparent border border-[#3B82F6]/25 flex items-center justify-center mb-5">
                <svg className="w-8 h-8 sm:w-9 sm:h-9 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 19h18M6 16V9M12 16V6M18 16v-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 21h20" />
                </svg>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/30 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24] animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#FBBF24]">Coming Soon</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug mb-3">
                Sponsorship
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60A5FA] to-[#3B82F6]"> Coming Soon</span>
              </h2>

              <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed">
                Support this tournament and help grow the competitive gaming community.
                Sponsorships are in the works — they will be available here soon.
              </p>
            </div>

            <div className="p-6 pt-2 sm:px-8 pb-8 border-t border-white/5">
              <button
                ref={closeBtnRef}
                onClick={onClose}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#3B82F6] text-white font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(59,130,246,0.45)] active:translate-y-0"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}