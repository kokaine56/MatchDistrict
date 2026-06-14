import React from 'react';
import { motion } from 'framer-motion';

export default function UsageMeter({ label, used, limit, icon, onUpgrade, plan }) {
  const isUnlimited = limit === Infinity || limit === 999999;
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((used / (limit || 1)) * 100));
  const isNearLimit = percentage >= 80 && !isUnlimited;
  const isAtLimit = percentage >= 100 && !isUnlimited;

  const barColor = isAtLimit ? 'bg-error' : isNearLimit ? 'bg-warning' : 'bg-primary';

  return (
    <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-4 backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-sm text-on-surface-variant">{icon}</span>}
          <span className="text-xs font-medium text-on-surface">{label}</span>
        </div>
        <span className="text-xs font-semibold text-on-surface">
          {isUnlimited ? (
            <span className="text-emerald-400">Unlimited</span>
          ) : (
            <span className={isAtLimit ? 'text-error' : isNearLimit ? 'text-warning' : 'text-on-surface'}>
              {used?.toLocaleString()} / {limit?.toLocaleString()}
            </span>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-surface-container-highest/50 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percentage, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${barColor}`}
          />
        </div>
      )}
      {isAtLimit && onUpgrade && (
        <button
          onClick={() => onUpgrade(plan || 'Basic')}
          className="mt-2 w-full text-xs text-primary font-medium hover:text-primary/80 transition-colors"
        >
          Upgrade plan to increase limit
        </button>
      )}
    </div>
  );
}
