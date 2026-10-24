import React from 'react';

export default function ProfileCompletionBar({ user, upiId, onOpenField }) {
  if (!user) return null;

  const phoneDigits = String(user.phone || '').replace(/\D/g, '');
  const hasPhone = phoneDigits.length === 10 || (phoneDigits.length === 12 && phoneDigits.startsWith('91'));
  const hasUpi = Boolean(upiId && String(upiId).trim().includes('@'));

  const items = [
    { key: 'whatsapp', label: 'WhatsApp', completed: hasPhone },
    { key: 'upi', label: 'UPI ID', completed: hasUpi },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const percentage = completedCount === 2 ? 100 : (completedCount === 1 ? 50 : 0);

  // Hide the whole card when both WhatsApp and UPI ID are completed
  if (percentage === 100) return null;

  const missing = items.filter((i) => !i.completed);

  return (
    <div className="glass-card p-4 sm:p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">verified</span>
          <span className="font-headline-md text-xs sm:text-sm font-bold text-on-background">
            Profile Completion
          </span>
        </div>
        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
          {percentage}%
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
        <div
          className="h-full transition-all duration-500 rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Missing Chips */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mr-1">
          Complete next:
        </span>
        {missing.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpenField(item.key)}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all flex items-center gap-1 active:scale-95 whitespace-nowrap"
          >
            <span>+</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
