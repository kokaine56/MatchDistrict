import React from 'react';

const FONT_SIZES = { xs: '12px', sm: '14px', md: '20px', lg: '28px' };

export default function VerificationBadge({ tier, size = 'sm' }) {
  if (!tier || tier === 'Free' || tier === 'Amateur' || tier === 'Basic') return null;

  const fontSize = FONT_SIZES[size] || FONT_SIZES.sm;

  return (
    <span
      className="inline-flex items-center select-none shrink-0"
      title="Pro Plan"
      style={{
        color: 'rgb(var(--badge-pro))',
        filter: 'drop-shadow(0 0 4px rgba(var(--badge-pro), 0.35))',
        fontVariationSettings: "'FILL' 1",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize }}>
        verified
      </span>
    </span>
  );
}
