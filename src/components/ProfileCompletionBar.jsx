import React from 'react';

export default function ProfileCompletionBar({ user, onOpenField }) {
  if (!user) return null;

  const hasPhone = Boolean(user.phone && String(user.phone).replace(/\D/g, '').length >= 10);
  const hasGamerTag = Boolean(user.gamerTag && user.gamerTag.trim());
  const hasGameId = Boolean((user.bgmiId && user.bgmiId.trim()) || (user.riotId && user.riotId.trim()) || (user.steamId && user.steamId.trim()));
  const hasSocial = Boolean(user.socialLinks && user.socialLinks.trim());

  const items = [
    { key: 'whatsapp', label: 'WhatsApp', completed: hasPhone },
    { key: 'gamerTag', label: 'Gamer Tag', completed: hasGamerTag },
    { key: 'bgmiId', label: 'Game ID', completed: hasGameId },
    { key: 'socialLinks', label: 'Social Link', completed: hasSocial },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const percentage = Math.round((completedCount / items.length) * 100);
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
        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
          percentage === 100 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-primary/10 text-primary border border-primary/30'
        }`}>
          {percentage}%
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            percentage === 100 ? 'bg-emerald-500' : 'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Missing Chips */}
      {missing.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mr-1">
            Complete next:
          </span>
          {missing.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpenField(item.key)}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all flex items-center gap-1 active:scale-95"
            >
              <span>+</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 pt-0.5">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          <span>Your profile is 100% complete!</span>
        </p>
      )}
    </div>
  );
}
