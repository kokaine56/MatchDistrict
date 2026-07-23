import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthToken } from '../utils/getAuthToken'
import AdminLayout from '../components/admin/AdminLayout.jsx'

export default function AdminOrganizers() {
  const navigate = useNavigate()
  const [organizers, setOrganizers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState('')
  const [showToast, setShowToast] = useState(false)

  const triggerToast = (msg) => {
    setToast(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const fetchOrganizers = async () => {
    setLoading(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const orgs = (data.users || []).filter(u =>
          u.role === 'organiser' || u.orgApplicationStatus === 'approved'
        )
        setOrganizers(orgs)
      } else {
        triggerToast('Failed to load organizers')
      }
    } catch {
      triggerToast('Error fetching organizers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOrganizers() }, [])

  const filtered = organizers.filter(org => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (org.name || '').toLowerCase().includes(q) ||
           (org.email || '').toLowerCase().includes(q) ||
           (org.orgName || '').toLowerCase().includes(q)
  })

  const formatDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  return (
    <AdminLayout
      activeTab="organizers"
      onTabChange={(tab) => {
        if (tab === 'organizers') return
        navigate('/admin')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('admin-tab-change', { detail: tab }))
        }, 100)
      }}
      onNavigate={(page) => {
        if (page === 'home') navigate('/')
        else if (page === 'profile') navigate('/admin/profile')
        else if (page === 'create-tournament') navigate('/create-tournament')
      }}
    >
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-medium text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-headline-lg text-lg sm:text-xl font-black text-on-background">Organizers</h1>
            <p className="font-body-sm text-[11px] text-on-surface-variant">{organizers.length} approved organizer{organizers.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={fetchOrganizers}
            disabled={loading}
            className="px-4 min-h-[44px] bg-surface border border-outline-variant/30 hover:bg-surface-variant text-on-background rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">refresh</span> Refresh
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm text-on-surface-variant">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or org..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface border border-outline-variant/30 text-xs text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-surface-variant/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary mb-3">
              <span className="material-symbols-outlined text-2xl">group</span>
            </div>
            <p className="text-sm font-medium text-on-surface-variant">
              {searchQuery ? 'No organizers match your search.' : 'No organizers found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((org) => (
              <div
                key={org.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface border border-outline-variant/15 hover:bg-surface-variant/20 transition-colors"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {org.avatar ? (
                    <img src={org.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-sm text-primary">person</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-on-background truncate">{org.orgName || org.name || '—'}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">{org.email}</p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block text-right">
                    <p className="text-[10px] text-on-surface-variant">{org.tier || 'Free'} Plan</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    org.orgApplicationStatus === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {org.orgApplicationStatus || 'pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
