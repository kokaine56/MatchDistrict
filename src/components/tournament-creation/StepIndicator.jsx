import { Fragment } from 'react'
import { motion } from 'framer-motion'

const STEPS = [
  { num: 1, label: 'Basic Details' },
  { num: 2, label: 'Match Setup' },
  { num: 3, label: 'Slots & Entry' },
  { num: 4, label: 'Prize Pool' },
  { num: 5, label: 'Media' },
  { num: 6, label: 'Schedule & Roadmap' },
  { num: 7, label: 'Rules & Regulations' },
  { num: 8, label: 'Preview' },
  { num: 9, label: 'Publish' },
]

export default function StepIndicator({ currentStep }) {
  const percent = ((currentStep - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="w-full px-2 sm:px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-on-surface-variant font-medium">
          Step {currentStep} of {STEPS.length}
        </span>
        <span className="text-xs text-on-surface-variant font-medium">
          {Math.round(percent)}% complete
        </span>
      </div>

      {/* Connected stepper — connector height matches circle height, so the
          track always runs through the exact vertical center of each circle. */}
      <div className="flex items-start w-full">
        {STEPS.map((s, idx) => (
          <Fragment key={s.num}>
            {idx > 0 && (
              <div className="flex-1 flex items-center h-6 sm:h-8">
                <div className="relative w-full h-[3px] rounded-full bg-outline-variant/25 overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                    initial={false}
                    animate={{ width: s.num <= currentStep ? '100%' : '0%' }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col items-center shrink-0 w-6 sm:w-8">
              <motion.div
                className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all duration-300 ${
                  s.num < currentStep
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : s.num === currentStep
                    ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/25 shadow-[0_0_14px_rgba(99,102,241,0.45)]'
                    : 'bg-surface-container-highest text-on-background/70 border border-outline-variant/40'
                }`}
                animate={s.num === currentStep ? { scale: [1, 1.12, 1] } : {}}
                transition={{ duration: 0.35 }}
              >
                {s.num < currentStep ? (
                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="#FFFFFF">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className={`inline-flex items-center justify-center leading-none ${s.num === currentStep ? 'text-white' : ''}`}
                    style={s.num === currentStep ? { color: '#FFFFFF' } : undefined}
                  >
                    {s.num}
                  </span>
                )}
              </motion.div>

              <span className={`text-[9px] mt-1.5 text-center leading-tight hidden sm:block ${
                s.num === currentStep
                  ? 'text-on-background font-bold'
                  : s.num < currentStep
                  ? 'text-on-surface-variant'
                  : 'text-on-surface-variant/80'
              }`}>
                {s.label}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}