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
  navigationBlocked = false
}) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container/95 backdrop-blur-xl border-t border-gray-200 dark:border-outline-variant/20 px-3 py-2 sm:px-4 sm:py-3"
      style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}
    >
      <div className="max-w-3xl mx-auto flex items-stretch gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onBack}
          disabled={currentStep === 1 || isSubmitting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl border-2 border-gray-300 dark:border-outline-variant/40 bg-white dark:bg-white/5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="hidden sm:inline">Previous</span>
          <span className="sm:hidden">Prev</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onSaveDraft}
          disabled={isSubmitting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_35px_rgba(99,102,241,0.55)] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Saving...
            </span>
          ) : (
            <span>Save Draft</span>
          )}
        </motion.button>

        {isLastStep ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            onClick={onPublish}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_35px_rgba(99,102,241,0.55)] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {isSubmitting ? 'Publishing...' : 'Publish'}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            onClick={onNext}
            disabled={isSubmitting || navigationBlocked}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_35px_rgba(99,102,241,0.55)] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
            title={navigationBlocked ? 'Fix schedule errors before continuing.' : ''}
          >
            {isSubmitting ? 'Please wait...' : 'Continue'}
          </motion.button>
        )}
      </div>
    </div>
  )
}
