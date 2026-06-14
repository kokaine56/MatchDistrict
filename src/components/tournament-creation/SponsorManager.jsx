import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SPONSOR_LIMITS = { Free: 0, Basic: 5, Pro: Infinity }

let sponsorIdCounter = Date.now()

function HandshakeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}

function LockIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function SponsorForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [amount, setAmount] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name || !amount || parseInt(amount) <= 0) return
    onSubmit({
      id: `sponsor_${sponsorIdCounter++}`,
      name,
      logo: logo || null,
      amount: parseInt(amount),
      website: website || null,
      description: description || null,
      status: 'pending',
    })
  }

  return (
    <div className="sponsor-form-overlay" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="sponsor-form-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-on-background">Add Sponsor</h3>
          <button type="button" onClick={onCancel} className="text-on-surface-variant hover:text-on-background transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Sponsor Name <span className="text-error">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. XYZ Gaming" className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Logo URL <span className="text-on-surface-variant/50">(optional)</span></label>
            <input type="text" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Contribution Amount (₹) <span className="text-error">*</span></label>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Website <span className="text-on-surface-variant/50">(optional)</span></label>
            <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Description <span className="text-on-surface-variant/50">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="About the sponsor..." className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-outline-variant/30 text-sm text-on-surface-variant hover:bg-surface/50 transition-colors">Cancel</button>
            <button type="submit" disabled={!name || !amount || parseInt(amount) <= 0} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors">Add Sponsor</button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default function SponsorManager({ sponsors = [], onChange, userTier }) {
  const [showForm, setShowForm] = useState(false)

  const tier = userTier || 'Free'
  const maxSponsors = SPONSOR_LIMITS[tier] || 0
  const isLocked = tier === 'Free'
  const atLimit = sponsors.length >= maxSponsors && maxSponsors !== Infinity

  const approvedContributions = sponsors
    .filter((s) => s.status === 'approved')
    .reduce((sum, s) => sum + (s.amount || 0), 0)

  const handleAdd = (sponsor) => {
    onChange([...sponsors, sponsor])
    setShowForm(false)
  }

  const handleRemove = (id) => {
    onChange(sponsors.filter((s) => s.id !== id))
  }

  const handleStatusChange = (id, status) => {
    onChange(sponsors.map((s) => (s.id === id ? { ...s, status } : s)))
  }

  if (isLocked) {
    return (
      <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl opacity-70">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center">
            <LockIcon className="w-5 h-5 text-on-surface-variant" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-background">Sponsor Contributions</h3>
            <p className="text-xs text-on-surface-variant">Available on Basic & Pro plans</p>
          </div>
        </div>
        <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Upgrade to Basic or Pro to unlock Sponsor Contributions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HandshakeIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-background">Sponsor Contributions</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {tier === 'Basic' ? `${sponsors.length}/${maxSponsors} sponsors used` : 'Unlimited sponsors'}
            </p>
          </div>
        </div>
        {!atLimit && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Sponsor
          </button>
        )}
      </div>

      {atLimit && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Maximum sponsor limit reached for {tier} Plan.
            {tier === 'Basic' && ' Upgrade to Pro for unlimited sponsors.'}
          </p>
        </div>
      )}

      {sponsors.length === 0 ? (
        <div className="py-6 text-center">
          <HandshakeIcon className="w-8 h-8 mx-auto mb-2 text-on-surface-variant opacity-30" />
          <p className="text-xs text-on-surface-variant">No sponsors added yet. Sponsors can contribute additional funds to the tournament prize pool.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sponsors.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/20">
              {s.logo ? (
                <img src={s.logo} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HandshakeIcon className="w-5 h-5 text-primary/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-on-background truncate">{s.name}</span>
                  <span className={`sponsor-status-badge ${s.status}`}>{s.status}</span>
                </div>
                <p className="text-sm font-semibold text-tertiary mt-0.5">₹{s.amount.toLocaleString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-1">
                {s.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(s.id, 'approved')}
                      className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                      title="Approve"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(s.id, 'rejected')}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Reject"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sponsors.length > 0 && approvedContributions > 0 && (
        <div className="text-xs text-on-surface-variant text-right">
          Approved contributions: <span className="font-semibold text-tertiary">₹{approvedContributions.toLocaleString('en-IN')}</span>
        </div>
      )}

      <AnimatePresence>
        {showForm && <SponsorForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  )
}
