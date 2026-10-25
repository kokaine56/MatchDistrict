import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Universal portal bottom sheet & dialog modal.
 * Renders into document.body above the footer bar, hides the mobile bottom nav
 * while active, constrains to 85dvh with interior scrolling, pins the bottom action area,
 * and tracks visualViewport for on-screen keyboard compatibility.
 */
export default function BottomSheetModal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  actions,
  maxWidth = 'max-w-md',
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Mark body so CSS rules can hide bottom nav
    document.body.classList.add('md-modal-open');
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    if (bottomNav) {
      bottomNav.style.display = 'none';
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Handle on-screen keyboard via visualViewport
    const updateViewport = () => {
      if (!window.visualViewport || !containerRef.current) return;
      const vv = window.visualViewport;
      const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
      containerRef.current.style.bottom = `${Math.max(0, keyboardHeight)}px`;
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('md-modal-open');
      if (bottomNav) {
        bottomNav.style.display = '';
      }
      document.body.style.overflow = prevOverflow;
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidth} bg-white dark:bg-[#121520] border-t sm:border border-outline-variant/50 rounded-t-3xl sm:rounded-2xl shadow-2xl relative max-h-[85dvh] flex flex-col overflow-hidden outline-none`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-3 border-b border-outline-variant/30 shrink-0 bg-inherit">
              <h3 className="font-headline-md text-base sm:text-lg font-bold text-on-background flex items-center gap-2">
                {icon && <span className="material-symbols-outlined text-primary text-xl">{icon}</span>}
                <span>{title}</span>
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors"
                aria-label="Close dialog"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Scrollable body content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 py-4 space-y-4">
              {children}
            </div>

            {/* Always-visible bottom action area */}
            {actions && (
              <div className="p-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] border-t border-outline-variant/20 flex items-center justify-end gap-2.5 shrink-0 bg-inherit">
                {actions}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
