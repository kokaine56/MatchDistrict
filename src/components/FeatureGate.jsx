import React from 'react';
import { motion } from 'framer-motion';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getUpgradeMessage, getNextPlan } from '../utils/featureGates';

export default function FeatureGate({ feature, children, fallback = null, showUpgrade = false, onUpgrade, limitType }) {
  const { hasFeature, tier } = useSubscription();
  
  if (hasFeature(feature)) return children;
  
  if (showUpgrade) {
    const message = getUpgradeMessage(limitType || feature);
    const nextPlan = getNextPlan(tier);
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group"
      >
        <div className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center rounded-xl">
          <div className="text-center p-6 max-w-sm">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3">lock</span>
            <p className="text-sm text-on-surface font-medium mb-1">Premium Feature</p>
            <p className="text-xs text-on-surface-variant mb-4">{message}</p>
            {nextPlan && onUpgrade && (
              <button
                onClick={() => onUpgrade(nextPlan)}
                className="px-5 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Upgrade to {nextPlan}
              </button>
            )}
          </div>
        </div>
        <div className="opacity-30 pointer-events-none select-none">{children}</div>
      </motion.div>
    );
  }
  
  return fallback;
}
