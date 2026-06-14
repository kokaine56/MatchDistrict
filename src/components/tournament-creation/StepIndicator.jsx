import { motion } from 'framer-motion'

const STEPS = [
  { num: 1, label: 'Basic Details' },
  { num: 2, label: 'Match Setup' },
  { num: 3, label: 'Slots & Entry' },
  { num: 4, label: 'Prize Pool' },
  { num: 5, label: 'Media' },
  { num: 6, label: 'Timing' },
  { num: 7, label: 'Roadmap' },
  { num: 8, label: 'Preview' },
  { num: 9, label: 'Publish' },
]

export default function StepIndicator({ currentStep }) {
  const percent = ((currentStep - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="w-full px-2 sm:px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-on-surface-variant font-medium">
          Step {currentStep} of {STEPS.length}
        </span>
        <span className="text-xs text-on-surface-variant font-medium">
          {Math.round(percent)}% complete
        </span>
      </div>
      <div className="relative h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between mt-2 overflow-x-hidden gap-0 sm:gap-1 pb-1">
        {STEPS.map((s) => (
          <div key={s.num} className="flex flex-col items-center min-w-[28px] sm:min-w-[40px]">
            <motion.div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                s.num === currentStep
                  ? 'bg-primary text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                  : s.num < currentStep
                  ? 'bg-primary/40 text-on-background'
                  : 'bg-surface-container-highest text-on-surface-variant'
              }`}
              animate={s.num === currentStep ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {s.num < currentStep ? '✓' : s.num}
            </motion.div>
            <span className={`text-[9px] mt-1 text-center leading-tight hidden sm:block ${
              s.num === currentStep ? 'text-on-background font-semibold' : 'text-on-surface-variant'
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
