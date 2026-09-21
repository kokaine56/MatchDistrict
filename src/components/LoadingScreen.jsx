import React from 'react'
import { motion } from 'framer-motion'

export default function LoadingScreen({
  message = 'Loading...',
  overlay = false,
}) {
  const containerClass = overlay
    ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-[#07080C]/85 backdrop-blur-md'
    : 'min-h-screen flex flex-col items-center justify-center text-on-background relative overflow-hidden bg-background'

  return (
    <div className={containerClass}>
      {!overlay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/10 blur-[100px] rounded-full pointer-events-none z-0" />
      )}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex flex-col items-center gap-4 relative z-10 px-4"
      >
        <div className="relative flex items-center justify-center">
          {/* Subtle Outer Glow Ring */}
          <div className="w-12 h-12 rounded-full border-2 border-primary/20 animate-ping absolute inset-0 opacity-20 pointer-events-none" />
          {/* Smooth Core Spinner */}
          <div className="w-10 h-10 rounded-full border-[2.5px] border-slate-300/30 dark:border-white/10 border-t-primary dark:border-t-primary animate-spin shrink-0 shadow-[0_0_16px_rgba(59,130,246,0.3)]" />
        </div>
        <div className="px-4 py-2 rounded-xl bg-white/90 border border-slate-200 shadow-sm dark:bg-[#0d0e14]/80 dark:border-white/10 dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md">
          <p className="text-xs sm:text-sm font-semibold tracking-wide text-center text-slate-700 dark:text-white/80">
            {message}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
