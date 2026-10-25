import React from 'react'

/**
 * Shared mobile sticky action bar for registration and payment steps.
 * Sits directly above the fixed mobile bottom navigation bar (--bottom-nav-h + safe-area-inset)
 * and hides on desktop (sm:hidden).
 */
export default function StickyBottomBar({ children, className = '', style = {}, ...props }) {
  return (
    <div
      className={`sticky-bottom-action-bar fixed left-0 right-0 sm:hidden z-50 px-4 py-3 flex items-center gap-3 rounded-t-2xl border-t border-white/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] ${className}`}
      style={{
        bottom: 'calc(var(--bottom-nav-h, 64px) + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(255, 255, 255, 0.84)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
