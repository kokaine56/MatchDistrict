import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function CustomLinkSection({ subscriptionApi, triggerToast, tier, tournaments }) {
  const [links, setLinks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ slug: '', tournamentId: '', linkType: 'tournament' })

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await subscriptionApi.getCustomLinks()
      if (res.success) setLinks(res.links || [])
    } catch (e) {} finally { setLoading(false) }
  }, [subscriptionApi])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.slug || form.slug.length < 3) { triggerToast('Slug must be at least 3 characters'); return }
    setSubmitting(true)
    try {
      const res = await subscriptionApi.createCustomLink({
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        tournamentId: form.tournamentId || null,
        linkType: form.linkType
      })
      if (res.success) {
        triggerToast('Custom link created!')
        setShowForm(false)
        setForm({ slug: '', tournamentId: '', linkType: 'tournament' })
        fetchLinks()
      } else {
        triggerToast(res.message || 'Failed to create link')
      }
    } catch (e) {
      triggerToast('Network error')
    } finally { setSubmitting(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this custom link?')) return
    try {
      const res = await subscriptionApi.deleteCustomLink(id)
      if (res.success) { triggerToast('Link deleted'); fetchLinks() }
    } catch (e) { triggerToast('Failed to delete') }
  }

  return (
    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-sm sm:text-base font-bold text-on-background flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">link</span>
          Custom Share Links
        </h3>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all">
          {showForm ? 'Cancel' : 'Create Link'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="space-y-3 mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-surface-container-highest/30 border border-outline-variant/40 rounded-xl px-3 py-2">
              <span className="text-[10px] text-on-surface-variant whitespace-nowrap">matchdistrict.com/slug/</span>
              <input
                type="text"
                placeholder="my-tournament-name"
                value={form.slug}
                onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() }))}
                className="flex-1 bg-transparent text-xs text-on-surface outline-none"
              />
            </div>
            <select
              value={form.linkType}
              onChange={(e) => setForm(f => ({ ...f, linkType: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50"
            >
              <option value="tournament">Tournament Link</option>
              {tier === 'Pro' && <option value="dashboard">Dashboard Link</option>}
            </select>
            {form.linkType === 'tournament' && (
              <select
                value={form.tournamentId}
                onChange={(e) => setForm(f => ({ ...f, tournamentId: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50"
              >
                <option value="">Select Tournament</option>
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Custom Link'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-on-surface-variant text-center py-4">Loading...</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-4">No custom links yet</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {links.map(link => (
            <div key={link.id} className="flex items-center justify-between bg-surface-container-highest/20 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface truncate">
                  matchdistrict.com/slug/{link.slug}
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  {link.link_type} {link.tournament_id && `· ${tournaments.find(t => t.id === link.tournament_id)?.title || ''}`}
                  {link.visit_count > 0 && ` · ${link.visit_count} visits`}
                </p>
              </div>
              <button
                onClick={() => handleDelete(link.id)}
                className="text-[10px] text-error hover:text-error/80 shrink-0 ml-2"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
