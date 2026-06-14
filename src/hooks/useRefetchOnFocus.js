import { useEffect, useRef } from 'react'

/** Re-run fetch when the tab regains focus or becomes visible (recovers stale/failed loads). */
export function useRefetchOnFocus(refetchFn, enabled = true) {
  const refetchRef = useRef(refetchFn)
  refetchRef.current = refetchFn

  useEffect(() => {
    if (!enabled) return

    const run = () => refetchRef.current?.()

    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }

    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}
