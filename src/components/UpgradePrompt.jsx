import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUpgradeMessage, PLAN_PRICES, getNextPlan } from '../utils/featureGates';

export default function UpgradePrompt({ isOpen, onClose, currentPlan, limitType, onUpgrade }) {
  const nextPlan = getNextPlan(currentPlan);
  if (!nextPlan) return null;

  const message = getUpgradeMessage(limitType);
  const price = PLAN_PRICES[nextPlan];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-3xl text-primary">rocket_launch</span>
              </div>
              <h3 className="text-lg font-bold text-on-background">Upgrade to {nextPlan}</h3>
              <p className="text-sm text-on-surface-variant mt-2">{message}</p>
            </div>

            <div className="bg-surface-container-highest/40 rounded-xl p-4 mb-5 border border-outline-variant/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-on-surface">{nextPlan} Plan</span>
                <span className="text-lg font-bold text-primary">
                  ₹{price.monthly.toLocaleString()}<span className="text-xs font-normal text-on-surface-variant">/mo</span>
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                or ₹{price.yearly.toLocaleString()}/yr (save 25%)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container-highest/50 transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={() => onUpgrade(nextPlan)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
