import { useEffect, useRef, useCallback } from 'react'

/**
 * Polls a fetch function at a fixed interval.
 * Pauses when the tab is hidden, resumes when visible.
 * @param {Function} fetchFn - Async function to call on each tick
 * @param {number} intervalMs - Polling interval in milliseconds (default 10000)
 * @param {boolean} enabled - Whether polling is active (default true)
 */
export function usePolling(fetchFn, intervalMs = 10000, enabled = true) {
  const fetchRef = useRef(fetchFn)
  const intervalRef = useRef(null)

  fetchRef.current = fetchFn

  const startPolling = useCallback(() => {
    if (intervalRef.current) return
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRef.current?.()
      }
    }, intervalMs)
  }, [intervalMs])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      stopPolling()
      return
    }

    startPolling()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchRef.current?.()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, startPolling, stopPolling])
}
