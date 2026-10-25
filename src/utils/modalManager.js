/**
 * Global Reference-Counted Modal & Scroll Lock Manager
 *
 * Tracks open sheets/dialogs across the application so that:
 * 1. Body scroll lock, scrollbar width compensation, and 'md-modal-open' class
 *    are applied only when activeModalCount > 0.
 * 2. Decremented cleanly on close AND on unmount, clamped to never drop below zero.
 * 3. Restores exact prior body overflow, paddingRight, and scroll position when all modals close.
 * 4. Compatible with React StrictMode (mount -> unmount -> mount cycles).
 */

let activeModalCount = 0;
let prevOverflow = '';
let prevPaddingRight = '';
let savedScrollY = 0;

export function acquireModalLock() {
  if (typeof document === 'undefined') {
    return () => {};
  }

  if (activeModalCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    prevOverflow = document.body.style.overflow;
    prevPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    document.body.classList.add('md-modal-open');
  }

  activeModalCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeModalCount = Math.max(0, activeModalCount - 1);

    if (activeModalCount === 0) {
      document.body.classList.remove('md-modal-open');
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.scrollTo(0, savedScrollY);
    }
  };
}

export function getActiveModalCount() {
  return activeModalCount;
}
