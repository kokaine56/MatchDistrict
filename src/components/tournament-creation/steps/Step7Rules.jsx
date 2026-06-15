import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export const DEFAULT_CATEGORIES = [
  {
    id: 'general',
    title: '1. General Rules',
    items: [
      'All players must use their registered in-game account.',
      'Players must join the correct room before the scheduled start time.',
      'Respect all participants, admins, and officials.',
      'Admin decisions are final and binding.',
      'Any form of cheating will result in immediate disqualification.'
    ]
  },
  {
    id: 'format',
    title: '2. Match Format',
    items: [
      'Mode: Squad / Duo / Solo (as specified).',
      'Perspective: TPP / FPP (as specified).',
      'Map rotation will be announced before the tournament.',
      'Match schedule must be followed strictly.'
    ]
  },
  {
    id: 'room',
    title: '3. Room Joining Rules',
    items: [
      'Room ID and Password will be shared before the match.',
      'Players must join with the registered IGN.',
      'Unauthorized players are not allowed.',
      'Late entries may not be accommodated.'
    ]
  },
  {
    id: 'gameplay',
    title: '4. Gameplay Rules',
    items: [
      'Use of game bugs or exploits is strictly prohibited.',
      'Teaming with other teams is not allowed.',
      'Stream sniping is prohibited.',
      'Intentional feeding or sabotage is prohibited.',
      'Players must play fairly throughout the tournament.'
    ]
  },
  {
    id: 'device',
    title: '5. Device & Software Rules',
    items: [
      'Only official BGMI client is allowed.',
      'Hacks, scripts, ESP, aimbot, mod menus, or third-party tools are strictly prohibited.',
      'Emulator players are not allowed unless explicitly stated.',
      'Any suspicious software may lead to investigation.'
    ]
  },
  {
    id: 'disconnection',
    title: '6. Disconnection Rules',
    items: [
      'Players are responsible for their own internet connection.',
      'No rematch will be provided for individual disconnects.',
      'Match may only be restarted if a server-wide issue occurs and tournament admins approve.'
    ]
  },
  {
    id: 'scoring',
    title: '7. Scoring System',
    items: [
      'Placement points and finish points will follow the tournament scoring format.',
      'Highest total points determine rankings.',
      'Tie-breakers: More Finish Points, Better Placement, Last Match Performance, Admin Decision.'
    ]
  },
  {
    id: 'prohibited',
    title: '8. Prohibited Activities',
    items: [
      'Hacking or cheating.',
      'Exploiting bugs or glitches.',
      'Account sharing.',
      'Impersonation of another player.',
      'Offensive, abusive, or discriminatory behavior.',
      'Match fixing or collusion.'
    ]
  },
  {
    id: 'evidence',
    title: '9. Evidence & Reporting',
    items: [
      'Players should keep match screenshots until results are finalized.',
      'Any dispute must be reported within 15 minutes of match completion.',
      'Admins may request gameplay recordings for verification.'
    ]
  },
  {
    id: 'prize',
    title: '10. Prize Distribution',
    items: [
      'Winners must provide valid payment details.',
      'Fake information may result in prize forfeiture.',
      'Prize distribution may take up to the announced processing period.'
    ]
  },
  {
    id: 'conduct',
    title: '11. Tournament Conduct',
    items: [
      'Follow instructions from tournament staff.',
      'Maintain professional behavior.',
      'Do not spread misinformation regarding results or tournament operations.',
      'Violations may result in warnings, point deductions, disqualification, or bans.'
    ]
  },
  {
    id: 'authority',
    title: '12. Final Authority',
    items: [
      'Tournament organizers reserve the right to modify rules when necessary.',
      'Any situation not covered by these rules will be resolved by tournament officials.',
      'The organizer\'s decision is final.'
    ]
  }
]

export default function Step7Rules({ data, onChange }) {
  // Initialize state from data.rules if it exists
  const initialRules = data.rules ? (typeof data.rules === 'string' ? JSON.parse(data.rules) : data.rules) : {}
  const [selectedDefaultIds, setSelectedDefaultIds] = useState(
    initialRules.selectedDefaultIds || DEFAULT_CATEGORIES.flatMap(cat => cat.items.map((_, idx) => `${cat.id}-${idx}`))
  )
  const [customRules, setCustomRules] = useState(initialRules.customRules || [])
  const [expandedGroups, setExpandedGroups] = useState({ general: true })

  const allDefaultIds = DEFAULT_CATEGORIES.flatMap(cat => cat.items.map((_, idx) => `${cat.id}-${idx}`))
  const isAllSelected = selectedDefaultIds.length === allDefaultIds.length

  useEffect(() => {
    if (!data.rules) {
      const defaultIds = DEFAULT_CATEGORIES.flatMap(cat => cat.items.map((_, idx) => `${cat.id}-${idx}`))
      onChange({
        ...data,
        rules: JSON.stringify({
          selectedDefaultIds: defaultIds,
          customRules: []
        })
      })
    }
  }, [data.rules, onChange])

  const triggerChange = (newIds, newCustom) => {
    setSelectedDefaultIds(newIds)
    setCustomRules(newCustom)
    onChange({
      ...data,
      rules: JSON.stringify({
        selectedDefaultIds: newIds,
        customRules: newCustom
      })
    })
  }

  const handleMasterToggle = () => {
    if (isAllSelected) {
      triggerChange([], customRules)
    } else {
      triggerChange(allDefaultIds, customRules)
    }
  }

  const handleRuleToggle = (id) => {
    let nextIds
    if (selectedDefaultIds.includes(id)) {
      nextIds = selectedDefaultIds.filter(x => x !== id)
    } else {
      nextIds = [...selectedDefaultIds, id]
    }
    triggerChange(nextIds, customRules)
  }

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }))
  }

  const handleAddCustomRule = () => {
    const nextCustom = [...customRules, '']
    triggerChange(selectedDefaultIds, nextCustom)
  }

  const handleCustomRuleChange = (index, value) => {
    const nextCustom = [...customRules]
    nextCustom[index] = value
    triggerChange(selectedDefaultIds, nextCustom)
  }

  const handleRemoveCustomRule = (index) => {
    const nextCustom = customRules.filter((_, i) => i !== index)
    triggerChange(selectedDefaultIds, nextCustom)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6 text-on-surface"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Rules & Regulations</h2>
          <p className="text-sm text-on-surface-variant mt-1">Configure default BGMI rulesets and add custom guidelines.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Select All</span>
          <button
            type="button"
            onClick={handleMasterToggle}
            className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
              isAllSelected ? 'bg-primary' : 'bg-surface-container-highest'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                isAllSelected ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {DEFAULT_CATEGORIES.map((cat) => {
          const isExpanded = !!expandedGroups[cat.id]
          const catCheckedCount = cat.items.filter((_, idx) => selectedDefaultIds.includes(`${cat.id}-${idx}`)).length
          
          return (
            <div
              key={cat.id}
              className="rounded-xl border border-outline-variant/20 bg-surface-container/30 overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleGroup(cat.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-container-high/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-white">{cat.title}</span>
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                    {catCheckedCount}/{cat.items.length} Enabled
                  </span>
                </div>
                <span className={`material-symbols-outlined text-sm text-on-surface-variant transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 divide-y divide-outline-variant/10">
                      {cat.items.map((item, idx) => {
                        const ruleId = `${cat.id}-${idx}`
                        const isChecked = selectedDefaultIds.includes(ruleId)
                        
                        return (
                          <div
                            key={ruleId}
                            onClick={() => handleRuleToggle(ruleId)}
                            className="flex items-start gap-3 py-2.5 cursor-pointer select-none group"
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                              isChecked ? 'bg-primary border-primary' : 'border-outline-variant/50 group-hover:border-primary/50'
                            }`}>
                              {isChecked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-xs leading-relaxed transition-colors ${isChecked ? 'text-on-background' : 'text-on-surface-variant'}`}>
                              {item}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Custom Rules Sub-Module */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container/30 p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">add_circle</span>
            Custom Rules
          </h3>
          <button
            type="button"
            onClick={handleAddCustomRule}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
          >
            <span className="material-symbols-outlined text-sm font-black">+</span>
            Add Custom Rule
          </button>
        </div>

        {customRules.length === 0 ? (
          <div className="text-center py-6 text-xs text-on-surface-variant/70 border border-dashed border-outline-variant/20 rounded-xl">
            No custom rules added yet. Click the button above to add custom stipulations.
          </div>
        ) : (
          <div className="space-y-3">
            {customRules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface-variant/80 min-w-[20px]">{idx + 1}.</span>
                <input
                  type="text"
                  value={rule}
                  onChange={(e) => handleCustomRuleChange(idx, e.target.value)}
                  placeholder="e.g. Map coordinates will be sent to the discord channel."
                  className="flex-1 bg-background/50 border border-outline-variant/35 rounded-xl px-3 py-2 text-xs text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveCustomRule(idx)}
                  className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors border border-transparent hover:border-error/20"
                  title="Remove Rule"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footnote Notice */}
      <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 flex gap-3 shadow-inner">
        <span className="material-symbols-outlined text-primary text-lg shrink-0">info</span>
        <div className="text-[11px] text-on-surface-variant leading-relaxed">
          <span className="font-extrabold text-white block mb-0.5 uppercase tracking-wider">Short Tournament Notice:</span>
          By participating in the tournament, all players agree to follow these rules. Failure to comply may result in penalties, disqualification, or permanent bans from future events.
        </div>
      </div>
    </motion.div>
  )
}
