import { motion } from 'framer-motion'

export default function StepNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSaveDraft,
  onPublish,
  isSubmitting,
  isLastStep,
  navigationBlocked = false,
  isEditMode = false,
  variant = 'fixed'
}) {
  const isInline = variant === 'inline'

  return (
    <div
      className={
        isInline
          ? 'w-full'
          : 'fixed bottom-0 left-0 right-0 z-50 bg-surface-container/95 backdrop-blur-xl px-3 py-2 sm:px-4 sm:py-3 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.12)]'
      }
      style={
        isInline
          ? undefined
          : { paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }
      }
    >
      <div className={isInline ? 'w-full flex items-stretch gap-2' : 'max-w-3xl mx-auto flex items-stretch gap-2'}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onBack}
          disabled={currentStep === 1 || isSubmitting}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-white dark:bg-white/5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] cursor-pointer disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="hidden sm:inline">Previous</span>
          <span className="sm:hidden">Prev</span>
        </motion.button>

        {!isLastStep && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-white dark:bg-white/5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] cursor-pointer disabled:cursor-not-allowed"
            title="Save progress as draft"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            <span className="hidden sm:inline">Save Draft</span>
            <span className="sm:hidden">Draft</span>
          </motion.button>
        )}

        {isLastStep ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            onClick={onPublish}
            disabled={isSubmitting}
            className="flex-[2] min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_35px_rgba(99,102,241,0.55)] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Publishing...' : 'Publish'}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            onClick={onNext}
            disabled={isSubmitting || navigationBlocked}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_35px_rgba(99,102,241,0.55)] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer disabled:cursor-not-allowed"
            title={navigationBlocked ? 'Fix schedule errors before continuing.' : ''}
          >
            {isSubmitting ? 'Please wait...' : 'Continue'}
          </motion.button>
        )}
      </div>
    </div>
  )
}
