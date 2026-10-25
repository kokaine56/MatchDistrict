import React from 'react';

/**
 * Universal pill tab / chip selector.
 * Selected = filled rounded pill with accent background (bg-primary) and light text (text-white).
 * Unselected = plain text (text-on-surface-variant hover:text-on-background) with NO underline.
 * Each pill keeps its natural width so 3+ items fit on a single line at 360px/375px viewports.
 */
export default function PillTabs({
  tabs,
  activeId,
  onChange,
  className = '',
  itemClassName = '',
  size = 'md', // 'sm' | 'md'
}) {
  const padClass = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm';

  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 sm:gap-1.5 flex-nowrap ${className}`}
    >
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = typeof tab === 'object' ? tab.count : null;
        const icon = typeof tab === 'object' ? tab.icon : null;
        const isActive = activeId === id;

        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(id)}
            className={`rounded-full font-headline-md font-semibold transition-all duration-150 whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 select-none ${padClass} ${
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/40'
            } ${itemClassName}`}
          >
            {icon && <span className="material-symbols-outlined text-[15px] sm:text-[17px]">{icon}</span>}
            <span>{label}</span>
            {count !== undefined && count !== null && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
