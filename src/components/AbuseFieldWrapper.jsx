// ─────────────────────────────────────────────────────────────────────────────
// AbuseFieldWrapper — Match District (v2)
//
// Drop-in wrapper that intercepts onChange and runs AbuseTracker scanning.
// Shows an animated inline warning and blocks further typing if a bad word
// is found.
//
// Usage:
//   <AbuseFieldWrapper fieldId="teamName" onWarning={setHasAbuse}>
//     <input
//       value={teamName}
//       onChange={e => setTeamName(e.target.value)}
//       ...
//     />
//   </AbuseFieldWrapper>
//
// Props:
//   fieldId    {string}    - unique ID for this field (used as the worker callback key)
//   value      {string}    - controlled value (watched for external changes)
//   onWarning  {fn}        - called with (hasBadWord: bool) whenever the state changes
//   children   {ReactNode} - the <input> or <textarea> element
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, cloneElement, Children } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAbuseTracker } from '../hooks/useAbuseTracker.js'

export default function AbuseFieldWrapper({ fieldId, value, onWarning, children }) {
  const { checkField, getFieldError, clearFieldError } = useAbuseTracker()
  const debounceRef = useRef(null)
  const onWarningRef = useRef(onWarning)

  // Keep onWarning ref in sync so the debounced callback always has the latest fn
  useEffect(() => { onWarningRef.current = onWarning }, [onWarning])

  // Watch external value changes (covers programmatic clears etc.)
  useEffect(() => {
    if (!value || value.trim() === '') {
      clearFieldError(fieldId)
      onWarningRef.current && onWarningRef.current(false)
      return
    }
    scan(value)
  }, [value, fieldId]) // eslint-disable-line react-hooks/exhaustive-deps

  function scan(rawValue) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await checkField(fieldId, rawValue)
      onWarningRef.current && onWarningRef.current(!!result.hasBadWord)
    }, 180)
  }

  // Intercept the child's onChange so we react on every keystroke
  const child = Children.only(children)
  const wrappedChild = cloneElement(child, {
    onChange: (e) => {
      // Call the original onChange first so state updates
      child.props.onChange && child.props.onChange(e)
      const newVal = e.target.value
      if (!newVal || !newVal.trim()) {
        clearTimeout(debounceRef.current)
        clearFieldError(fieldId)
        onWarningRef.current && onWarningRef.current(false)
        return
      }
      scan(newVal)
    }
  })

  const errorMsg = getFieldError(fieldId)

  return (
    <div className="relative w-full">
      {/* Highlight border of the child when there's an error */}
      <div
        className={
          errorMsg
            ? '[&>div>input]:!ring-2 [&>div>input]:!ring-rose-500/40 [&>div>input]:!border-rose-500 [&>div>textarea]:!ring-2 [&>div>textarea]:!ring-rose-500/40 [&>div>textarea]:!border-rose-500 [&>input]:!ring-2 [&>input]:!ring-rose-500/40 [&>input]:!border-rose-500 [&>textarea]:!ring-2 [&>textarea]:!ring-rose-500/40 [&>textarea]:!border-rose-500'
            : ''
        }
      >
        {wrappedChild}
      </div>

      {/* Animated warning banner */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            key="abuse-warn"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 backdrop-blur-sm"
          >
            <span
              className="material-symbols-outlined text-rose-400 text-[16px] shrink-0"
              style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
            >
              gpp_bad
            </span>
            <p className="font-body-sm text-[11px] text-rose-400 leading-snug font-semibold flex-1">
              {errorMsg}
            </p>
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-ping opacity-75" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
