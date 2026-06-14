import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ACTIVE_GAME = 'BGMI'

export default function GameDropdown({ value, onChange, games = [], loading }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = games.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase())
  )

  const selected = games.find((g) => g.name === value)

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
        Game <span className="text-error">*</span>
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="game-dropdown-btn"
      >
        <span>
          {selected ? selected.name : 'Select a game...'}
        </span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="game-dropdown-panel"
          >
            <div className="p-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games..."
                className="game-dropdown-search"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No games found</div>
              ) : (
                filtered.map((g) => {
                  const isDisabled = g.name !== ACTIVE_GAME
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => { onChange(g.name); setOpen(false); setQuery('') }}
                      className={`game-dropdown-option${g.name === value ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`}
                    >
                      <span>{g.name}</span>
                      {isDisabled && <span className="game-dropdown-coming-soon">Coming Soon</span>}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
