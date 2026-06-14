import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RoundEditor from '../RoundEditor'
import TimelinePreview from '../TimelinePreview'

let roundIdCounter = 0
function newRound() {
  roundIdCounter++
  return { id: `rnd-${Date.now()}-${roundIdCounter}`, name: '', date: '', time: '', qualified: '' }
}

export default function Step7Roadmap({ data, onChange, errors }) {
  const rounds = data.roadmap || []

  const updateRounds = (newRounds) => {
    onChange({ ...data, roadmap: newRounds })
  }

  const addRound = () => updateRounds([...rounds, newRound()])

  const updateRound = (idx, updated) => {
    const next = [...rounds]
    next[idx] = updated
    updateRounds(next)
  }

  const deleteRound = (idx) => {
    if (rounds.length <= 1) return
    updateRounds(rounds.filter((_, i) => i !== idx))
  }

  const moveRound = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= rounds.length) return
    const next = [...rounds]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateRounds(next)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Tournament Roadmap</h2>
        <p className="text-sm text-on-surface-variant mt-1">Create the progression of rounds for your tournament.</p>
      </div>

      <AnimatePresence mode="popLayout">
        {rounds.map((r, idx) => (
          <RoundEditor
            key={r.id}
            round={r}
            index={idx}
            onChange={(updated) => updateRound(idx, updated)}
            onDelete={() => deleteRound(idx)}
            onMoveUp={() => moveRound(idx, -1)}
            onMoveDown={() => moveRound(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === rounds.length - 1}
          />
        ))}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={addRound}
        className="w-full py-3 rounded-xl border-2 border-dashed border-outline-variant/30 text-sm text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
      >
        + Add Round
      </motion.button>

      {errors?.roadmap && <p className="text-xs text-error">{errors.roadmap}</p>}

      {rounds.length > 0 && (
        <div className="pt-4 border-t border-outline-variant/20">
          <TimelinePreview rounds={rounds.map((r) => ({ ...r, name: r.name || `Round ${rounds.indexOf(r) + 1}` }))} />
        </div>
      )}
    </motion.div>
  )
}
