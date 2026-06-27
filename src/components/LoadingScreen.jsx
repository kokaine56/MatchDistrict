export default function LoadingScreen({
  message = 'Loading...',
  overlay = false,
}) {
  const containerClass = overlay
    ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/60 dark:bg-[#07080C]/80 backdrop-blur-md animate-in fade-in duration-200'
    : 'min-h-screen flex flex-col items-center justify-center text-on-background relative overflow-hidden bg-background'

  return (
    <div className={containerClass}>
      {!overlay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/10 blur-[100px] rounded-full pointer-events-none z-0" />
      )}
      <div className="flex flex-col items-center gap-5 relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-12 h-12 rounded-full loading-spinner border-4 border-transparent border-t-blue-600 dark:border-t-white shrink-0 shadow-[0_0_20px_rgba(37,99,235,0.25)] dark:shadow-[0_0_20px_rgba(192,193,255,0.2)]" />
        <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-md dark:bg-surface-container/80 dark:border-outline-variant/35 dark:shadow-lg">
          <p className="text-sm font-semibold tracking-widest uppercase text-center text-gray-600 dark:text-on-surface-variant loading-text-pulse">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
