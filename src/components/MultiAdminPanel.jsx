import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function MultiAdminPanel({ subscriptionApi, triggerToast }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', adminRole: 'admin' })
  const [actionLog, setActionLog] = useState([])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res = await subscriptionApi.getStaff()
      if (res.success) setStaff(res.staff || [])
    } catch (e) {} finally { setLoading(false) }
  }, [subscriptionApi])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email) { triggerToast('Name and email are required'); return }
    setSubmitting(true)
    try {
      const res = await subscriptionApi.inviteStaff({
        name: form.name, email: form.email, role: form.role, adminRole: form.adminRole,
        permissions: JSON.stringify({
          tournamentManagement: true,
          participantManagement: form.adminRole === 'owner',
          analyticsAccess: form.adminRole === 'owner',
        })
      })
      if (res.success) {
        triggerToast('Admin invited!')
        setShowForm(false)
        setForm({ name: '', email: '', role: 'staff', adminRole: 'admin' })
        fetchStaff()
      } else {
        triggerToast(res.message || 'Failed to invite')
      }
    } catch (e) { triggerToast('Network error') }
    finally { setSubmitting(false) }
  }

  const handleRemove = async (staffId) => {
    if (!window.confirm('Remove this admin?')) return
    try {
      const res = await subscriptionApi.removeStaff(staffId)
      if (res.success) { triggerToast('Admin removed'); fetchStaff() }
    } catch (e) { triggerToast('Failed to remove') }
  }

  const handlePermissionToggle = async (staffId, permission, currentValue) => {
    try {
      const perms = {}
      perms[permission] = !currentValue
      const res = await subscriptionApi.updateStaffPermissions({ staffId, permissions: perms })
      if (res.success) fetchStaff()
    } catch (e) { triggerToast('Failed to update permissions') }
  }

  return (
    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-sm sm:text-base font-bold text-on-background flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">admin_panel_settings</span>
          Multi Admin Access
        </h3>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all">
          {showForm ? 'Cancel' : 'Invite Admin'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleInvite} className="space-y-3 mb-4 overflow-hidden">
            <input type="text" placeholder="Admin Name" value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50" />
            <input type="email" placeholder="Admin Email" value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50" />
            <select value={form.adminRole} onChange={(e) => setForm(f => ({ ...f, adminRole: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50">
              <option value="admin">Admin</option>
              <option value="owner">Owner (Full Access)</option>
              <option value="coordinator">Coordinator</option>
            </select>
            <p className="text-[9px] text-on-surface-variant/70 px-1">
              Owners have full access. Admins can manage tournaments and participants. Coordinators can only manage matches.
            </p>
            <button type="submit" disabled={submitting}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
              {submitting ? 'Inviting...' : 'Send Invitation'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-on-surface-variant text-center py-4">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-4">No admin users yet. Invite team members to manage tournaments together.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {staff.map(member => (
            <div key={member.id} className="flex items-center justify-between bg-surface-container-highest/20 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-on-surface truncate">{member.name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                    member.admin_role === 'owner' ? 'bg-amber-500/15 text-amber-400' : 
                    member.admin_role === 'coordinator' ? 'bg-sky-500/15 text-sky-400' : 
                    'bg-primary/15 text-primary'
                  }`}>
                    {member.admin_role || 'admin'}
                  </span>
                </div>
                <p className="text-[10px] text-on-surface-variant">{member.email}</p>
                {member.admin_role !== 'owner' && (
                  <div className="flex gap-3 mt-1.5">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={true} onChange={() => {}} className="w-3 h-3 accent-primary" disabled />
                      <span className="text-[8px] text-on-surface-variant">Tournaments</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={true} onChange={() => handlePermissionToggle(member.id, 'participantManagement', true)} className="w-3 h-3 accent-primary" />
                      <span className="text-[8px] text-on-surface-variant">Participants</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={true} onChange={() => handlePermissionToggle(member.id, 'analyticsAccess', true)} className="w-3 h-3 accent-primary" />
                      <span className="text-[8px] text-on-surface-variant">Analytics</span>
                    </label>
                  </div>
                )}
              </div>
              <button onClick={() => handleRemove(member.id)} className="text-[10px] text-error hover:text-error/80 shrink-0 ml-2">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}