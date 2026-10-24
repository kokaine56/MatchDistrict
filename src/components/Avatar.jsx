import React, { useState, useEffect } from 'react';

const PALETTES = [
  { bg: 'bg-indigo-600/20 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/30' },
  { bg: 'bg-cyan-600/20 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/30' },
  { bg: 'bg-violet-600/20 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/30' },
  { bg: 'bg-emerald-600/20 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
  { bg: 'bg-amber-600/20 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
  { bg: 'bg-rose-600/20 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30' },
  { bg: 'bg-sky-600/20 dark:bg-sky-500/20', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/30' },
  { bg: 'bg-fuchsia-600/20 dark:bg-fuchsia-500/20', text: 'text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/30' },
];

function getPalette(seed) {
  if (!seed && seed !== 0) return PALETTES[0];
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

function getInitial(name, email, gamerTag) {
  const candidate = (name || '').trim() || (gamerTag || '').trim().replace(/^@/, '') || (email || '').split('@')[0] || '?';
  const char = candidate.charAt(0) || '?';
  return char.toUpperCase();
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm font-semibold',
  lg: 'w-12 h-12 text-base font-semibold',
  xl: 'w-16 h-16 text-xl font-bold',
  '2xl': 'w-20 h-20 text-2xl font-bold',
  '3xl': 'w-24 h-24 text-3xl font-extrabold',
};

/**
 * Universal Avatar component.
 * Displays user's resolved avatar image (Google/Discord provider),
 * or falls back to a deterministic colored circle with their uppercase initial.
 */
export default function Avatar({
  user,
  src,
  name,
  email,
  districtId,
  gamerTag,
  size = 'md',
  className = '',
  alt,
  onClick,
}) {
  const avatarUrl = src || user?.avatar || user?.avatarUrl;
  const displayName = name || user?.name || user?.display_name || '';
  const userEmail = email || user?.email || '';
  const userGamerTag = gamerTag || user?.gamerTag || '';
  const seed = districtId ?? user?.district_id ?? user?.districtId ?? user?.id ?? displayName;

  const [hasError, setHasError] = useState(false);

  // Reset error state if avatar URL changes
  useEffect(() => {
    setHasError(false);
  }, [avatarUrl]);

  const palette = getPalette(seed);
  const initial = getInitial(displayName, userEmail, userGamerTag);
  const sizeClasses = SIZE_MAP[size] || size || 'w-10 h-10 text-sm font-semibold';

  const showImage = Boolean(avatarUrl) && !hasError;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full select-none overflow-hidden border ${palette.border} ${palette.bg} ${sizeClasses} ${className}`}
      title={displayName || userEmail || 'User'}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={alt || displayName || 'Avatar'}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover object-center"
          loading="lazy"
        />
      ) : (
        <span className={`font-headline-md font-bold tracking-tight uppercase ${palette.text}`}>
          {initial}
        </span>
      )}
    </div>
  );
}
