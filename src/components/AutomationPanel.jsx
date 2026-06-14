import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AutomationPanel({ subscriptionApi, triggerToast, tournaments }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    triggerEvent: 'auto_publish',
    tournamentId: '',
    scheduledDate: '',
    scheduledTime: '',
    message: '',
    targetStatus: 'live'
  })

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await subscriptionApi.getAutomationRules()
      if (res.success) setRules(res.rules || [])
    } catch (e) {} finally { setLoading(false) }
  }, [subscriptionApi])

  useEffect(() => { fetchRules() }, [fetchRules])

  const triggerOptions = [
    { value: 'auto_publish', label: 'Auto Publish Tournament' },
    { value: 'auto_open_registration', label: 'Auto Open Registration' },
    { value: 'auto_close_registration', label: 'Auto Close Registration' },
    { value: 'auto_reminder', label: 'Auto Send Reminder' },
    { value: 'auto_notification', label: 'Auto Post Notice' },
    { value: 'auto_status_update', label: 'Auto Update Status' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.tournamentId) { triggerToast('Name and tournament are required'); return }
    setSubmitting(true)
    try {
      const actionConfig = {
        tournamentId: form.tournamentId,
        scheduledAt: form.scheduledDate && form.scheduledTime
          ? new Date(`${form.scheduledDate}T${form.scheduledTime}`).toISOString()
          : null,
        message: form.message || undefined,
        targetStatus: form.targetStatus || undefined
      }
      const res = await subscriptionApi.createAutomationRule({
        name: form.name,
        triggerEvent: form.triggerEvent,
        actionType: form.triggerEvent,
        actionConfig
      })
      if (res.success) {
        triggerToast('Automation rule created!')
        setShowForm(false)
        setForm({ name: '', triggerEvent: 'auto_publish', tournamentId: '', scheduledDate: '', scheduledTime: '', message: '', targetStatus: 'live' })
        fetchRules()
      } else {
        triggerToast(res.message || 'Failed to create rule')
      }
    } catch (e) { triggerToast('Network error') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this automation rule?')) return
    try {
      const res = await subscriptionApi.deleteAutomationRule(ruleId)
      if (res.success) { triggerToast('Rule deleted'); fetchRules() }
    } catch (e) { triggerToast('Failed to delete') }
  }

  return (
    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-sm sm:text-base font-bold text-on-background flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">smart_toy</span>
          Tournament Automations
        </h3>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all">
          {showForm ? 'Cancel' : 'Create Rule'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit} className="space-y-3 mb-4 overflow-hidden">
            <input type="text" placeholder="Rule Name" value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50" />
            <select value={form.triggerEvent} onChange={(e) => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50">
              {triggerOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
            <select value={form.tournamentId} onChange={(e) => setForm(f => ({ ...f, tournamentId: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50">
              <option value="">Select Tournament</option>
              {tournaments.map(t => (<option key={t.id} value={t.id}>{t.title}</option>))}
            </select>
            <div className="flex gap-2">
              <input type="date" value={form.scheduledDate}
                onChange={(e) => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="flex-1 px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50" />
              <input type="time" value={form.scheduledTime}
                onChange={(e) => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                className="flex-1 px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50" />
            </div>
            {form.triggerEvent === 'auto_notification' && (
              <textarea placeholder="Notice message" value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} rows={2}
                className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50 resize-none" />
            )}
            {form.triggerEvent === 'auto_status_update' && (
              <select value={form.targetStatus} onChange={(e) => setForm(f => ({ ...f, targetStatus: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50">
                <option value="live">Live</option>
                <option value="registration_open">Registration Open</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
            <button type="submit" disabled={submitting}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Automation Rule'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-on-surface-variant text-center py-4">Loading...</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-4">No automation rules yet. Create one to automate tournament operations.</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between bg-surface-container-highest/20 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface truncate">{rule.name}</p>
                <p className="text-[10px] text-on-surface-variant capitalize">{rule.trigger_event?.replace(/_/g, ' ')}</p>
                {rule.last_run_at && <p className="text-[8px] text-on-surface-variant/60">Last run: {new Date(rule.last_run_at).toLocaleDateString()}</p>}
              </div>
              <button onClick={() => handleDelete(rule.id)} className="text-[10px] text-error hover:text-error/80 shrink-0 ml-2">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}