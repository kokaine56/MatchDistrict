import React, { useState, useEffect } from 'react'
import { formatDate } from '../utils/timeFormat'

export default function OrganizerAnalyticsSection({ subscriptionApi, tier }) {
  const [data, setData] = useState(null)
  const [revenueData, setRevenueData] = useState(null)
  const [growthData, setGrowthData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [analyticsTab, setAnalyticsTab] = useState('overview')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await subscriptionApi.getOrganizerAnalytics()
        if (res.success) setData(res)
        else setError(res.message)
      } catch (e) { setError('Failed to load analytics') }

      try {
        const revRes = await subscriptionApi.getRevenueAnalytics()
        if (revRes.success) setRevenueData(revRes)
      } catch (e) {}
      try {
        const grRes = await subscriptionApi.getGrowthAnalytics()
        if (grRes.success) setGrowthData(grRes)
      } catch (e) {}
      finally { setLoading(false) }
    })()
  }, [subscriptionApi])

  if (loading) {
    return (
      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
        <p className="text-xs text-on-surface-variant text-center py-4">Loading analytics...</p>
      </div>
    )
  }

  if (error || !data) return null

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'growth', label: 'Growth' },
  ]

  return (
    <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4">
      <div className="border-b border-outline-variant/30 pb-3 flex items-center justify-between">
        <h3 className="font-headline-md text-sm sm:text-base font-bold flex items-center gap-2 text-on-background tracking-tight">
          <span className="material-symbols-outlined text-primary text-xl">analytics</span>
          Analytics ({tier})
        </h3>
        <div className="flex gap-1 bg-surface-container p-0.5 rounded-lg">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setAnalyticsTab(t.id)}
              className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${analyticsTab === t.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-background'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {analyticsTab === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
            <p className="text-[10px] text-on-surface-variant font-medium">Total Registrations</p>
            <p className="text-lg font-bold text-on-surface">{data.registrations || 0}</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
            <p className="text-[10px] text-on-surface-variant font-medium">Slot Fill Rate</p>
            <p className="text-lg font-bold text-on-surface">{data.slotFillRate || 0}%</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
            <p className="text-[10px] text-on-surface-variant font-medium">Growth (30d)</p>
            <p className="text-lg font-bold text-on-surface">{data.participantGrowth || 0}%</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
            <p className="text-[10px] text-on-surface-variant font-medium">Revenue</p>
            <p className="text-lg font-bold text-on-surface">₹{(data.revenue || 0).toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {analyticsTab === 'revenue' && revenueData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Total Revenue</p>
              <p className="text-lg font-bold text-emerald-400">₹{(revenueData.totalRevenue || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Registration Revenue</p>
              <p className="text-lg font-bold text-on-surface">₹{(revenueData.registrationRevenue || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Prize Pool Commitment</p>
              <p className="text-lg font-bold text-rose-400">₹{(revenueData.prizePoolCommitment || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
          {revenueData.revenueTrends?.length > 0 && (
            <div>
              <p className="text-[10px] text-on-surface-variant font-medium mb-2">Revenue Trends</p>
              <div className="space-y-1.5">
                {revenueData.revenueTrends.map((m, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-container-highest/20 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] text-on-surface-variant">{m.month}</span>
                    <span className="text-[10px] font-semibold text-on-surface">₹{(m.amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {analyticsTab === 'revenue' && !revenueData && (
        <p className="text-xs text-on-surface-variant text-center py-4">Revenue analytics available after you host tournaments with entry fees.</p>
      )}

      {analyticsTab === 'growth' && growthData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Tournament Growth (30d)</p>
              <p className={`text-lg font-bold ${(growthData.tournamentGrowth30d || 0) >= 0 ? 'text-emerald-400' : 'text-error'}`}>
                {(growthData.tournamentGrowth30d || 0) >= 0 ? '+' : ''}{growthData.tournamentGrowth30d || 0}%
              </p>
            </div>
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Registration Growth (30d)</p>
              <p className={`text-lg font-bold ${(growthData.registrationGrowth30d || 0) >= 0 ? 'text-emerald-400' : 'text-error'}`}>
                {(growthData.registrationGrowth30d || 0) >= 0 ? '+' : ''}{growthData.registrationGrowth30d || 0}%
              </p>
            </div>
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Current Period</p>
              <p className="text-lg font-bold text-on-surface">{growthData.currentPeriod?.tournaments || 0} tourneys</p>
            </div>
            <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-3">
              <p className="text-[10px] text-on-surface-variant font-medium">Previous Period</p>
              <p className="text-lg font-bold text-on-surface">{growthData.previousPeriod?.tournaments || 0} tourneys</p>
            </div>
          </div>

          {growthData.monthlyTournaments?.length > 0 && (
            <div>
              <p className="text-[10px] text-on-surface-variant font-medium mb-2">Monthly Tournaments (12 months)</p>
              <div className="flex items-end gap-1.5 h-20">
                {growthData.monthlyTournaments.map((m, i) => {
                  const maxCount = Math.max(...growthData.monthlyTournaments.map(x => x.count), 1)
                  const height = (m.count / maxCount) * 100
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[8px] text-on-surface-variant font-mono">{m.count}</span>
                      <div className="w-full bg-primary/60 rounded-t-md transition-all duration-500" style={{ height: `${Math.max(height, 4)}%` }} />
                      <span className="text-[6px] text-on-surface-variant/60">{m.month.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {growthData.monthlyRegistrations?.length > 0 && (
            <div>
              <p className="text-[10px] text-on-surface-variant font-medium mb-2">Monthly Registrations (6 months)</p>
              <div className="flex items-end gap-1.5 h-20">
                {growthData.monthlyRegistrations.map((m, i) => {
                  const maxCount = Math.max(...growthData.monthlyRegistrations.map(x => x.count), 1)
                  const height = (m.count / maxCount) * 100
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[8px] text-on-surface-variant font-mono">{m.count}</span>
                      <div className="w-full bg-secondary/60 rounded-t-md transition-all duration-500" style={{ height: `${Math.max(height, 4)}%` }} />
                      <span className="text-[6px] text-on-surface-variant/60">{m.month.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {analyticsTab === 'growth' && !growthData && (
        <p className="text-xs text-on-surface-variant text-center py-4">Growth analytics will populate as you host more tournaments.</p>
      )}

      {data.recentActivity?.length > 0 && (
        <div>
          <p className="text-[10px] text-on-surface-variant font-medium mb-2">Recent Activity</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.recentActivity.slice(0, 5).map((ev, i) => (
              <div key={ev.id || i} className="flex items-center justify-between bg-surface-container-highest/20 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-on-surface-variant capitalize">{ev.event_type?.replace(/_/g, ' ')}</span>
                <span className="text-[8px] text-on-surface-variant/60">{formatDate(ev.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}