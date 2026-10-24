
/**
 * SocialAuthButtons
 *
 * Minimal, modern, circular icon-only social authentication buttons for
 * Google and Discord, displayed side by side beneath an "or continue with" divider.
 */
export default function SocialAuthButtons({
  dividerText = 'or continue with',
  googleRef,
  onGoogleClick,
  onDiscordClick,
  isLoading = false,
}) {
  return (
    <div className="space-y-4 pt-2 w-full">
      {/* Subtle divider */}
      <div className="relative flex items-center justify-center">
        <div className="border-t border-slate-200 dark:border-white/10 w-full" />
        <span className="absolute bg-white dark:bg-[#1B1B1F] px-3 font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider select-none">
          {dividerText}
        </span>
      </div>

      {/* Side-by-side circular social login buttons */}
      <div className="w-full flex items-center justify-center gap-4 sm:gap-5 pt-1 pb-1">
        {/* Google Circular Button (Left) */}
        <div
          role="button"
          tabIndex={isLoading ? -1 : 0}
          onClick={onGoogleClick}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
              e.preventDefault();
              const innerBtn = e.currentTarget.querySelector('.nsm7Bb-HzV7m-LgbsSe, .S9gUrf-YoZ4jf, [role="button"]');
              if (innerBtn && innerBtn !== e.currentTarget && typeof innerBtn.click === 'function') {
                innerBtn.click();
              } else if (typeof onGoogleClick === 'function') {
                onGoogleClick();
              }
            }
          }}
          aria-label="Continue with Google"
          title="Continue with Google"
          className={`relative w-14 h-14 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200 flex items-center justify-center shadow-sm cursor-pointer hover:scale-[1.04] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1B1B1F] overflow-hidden shrink-0 ${
            isLoading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {/* Static SVG Google Brand Icon (always visible on initial paint, centered, multicolor) */}
          <svg
            className="w-6 h-6 shrink-0"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.23-.67-.35-1.37-.35-2.09z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>

          {/* Overlaid GIS render container (transparent overlay, captures clicks directly to GIS SDK) */}
          <div
            ref={googleRef}
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 flex items-center justify-center scale-[1.38] rounded-full overflow-hidden opacity-0 pointer-events-auto"
            style={{ transformOrigin: 'center' }}
          />
        </div>

        {/* Discord Circular Button (Right) */}
        <button
          type="button"
          onClick={onDiscordClick}
          disabled={isLoading}
          aria-label="Continue with Discord"
          title="Continue with Discord"
          className="w-14 h-14 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 hover:border-[#5865F2]/40 hover:bg-[#5865F2]/5 dark:hover:bg-[#5865F2]/10 transition-all duration-200 flex items-center justify-center shadow-sm cursor-pointer hover:scale-[1.04] active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1B1B1F] shrink-0"
        >
          {/* Recognizable Discord Brand Mascot SVG */}
          <svg
            className="w-6 h-6 shrink-0 fill-[#5865F2]"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
