import { motion, AnimatePresence } from 'framer-motion'

function CrosshairIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  )
}

function TwoUsersIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9.75a1.5 1.5 0 001.5-1.5V6.75a1.5 1.5 0 00-1.5-1.5H4.5a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

const MATCH_TYPES = [
  { value: 'solo', label: 'Solo', icon: CrosshairIcon, desc: '1 vs 1' },
  { value: 'duo', label: 'Duo', icon: TwoUsersIcon, desc: '2 players per team' },
  { value: 'squad', label: 'Squad', icon: GroupIcon, desc: '4 players per team' },
]

const PERSPECTIVES = [
  { value: 'tpp', label: 'TPP', icon: CameraIcon, desc: 'Third Person Perspective' },
  { value: 'fpp', label: 'FPP', icon: EyeIcon, desc: 'First Person Perspective' },
]

function CheckmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function SelectionCard({ selected, value, label, icon: Icon, desc, onSelect }) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(value)}
      animate={selected ? {
        scale: 1.02,
        transition: { duration: 0.2, ease: 'easeOut' }
      } : {
        scale: 1,
        transition: { duration: 0.2, ease: 'easeOut' }
      }}
      whileHover={{ scale: selected ? 1.02 : 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`selection-card${selected ? ' selected' : ''}`}
    >
      <div className={`mb-2 ${selected ? 'text-primary' : 'text-on-surface-variant'}`}>
        {Icon && <Icon />}
      </div>
      <div className="selection-card-label">{label}</div>
      <div className="selection-card-desc">{desc}</div>
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="selection-checkmark"
          >
            <CheckmarkIcon />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export default function Step2MatchSetup({ data, onChange, errors }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Match Setup</h2>
        <p className="text-sm text-on-surface-variant mt-1">Configure how teams compete.</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">
          Match Type <span className="text-error">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {MATCH_TYPES.map((m) => (
            <SelectionCard
              key={m.value}
              selected={data.match_type === m.value}
              value={m.value}
              label={m.label}
              icon={m.icon}
              desc={m.desc}
              onSelect={(v) => onChange({ ...data, match_type: v })}
            />
          ))}
        </div>
        {errors?.match_type && <p className="text-xs text-error">{errors.match_type}</p>}
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">
          Perspective Mode <span className="text-error">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {PERSPECTIVES.map((p) => (
            <SelectionCard
              key={p.value}
              selected={data.perspective === p.value}
              value={p.value}
              label={p.label}
              icon={p.icon}
              desc={p.desc}
              onSelect={(v) => onChange({ ...data, perspective: v })}
            />
          ))}
        </div>
        {errors?.perspective && <p className="text-xs text-error">{errors.perspective}</p>}
      </div>
    </motion.div>
  )
}
