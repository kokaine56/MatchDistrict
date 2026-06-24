import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../ThemeContext.jsx'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'monitoring' },
  { id: 'kyc', label: 'Organizer KYC', icon: 'how_to_reg', badgeKey: 'kyc' },
  { id: 'upgrades', label: 'Plan Upgrades', icon: 'upgrade', badgeKey: 'upgrades' },
  { id: 'users', label: 'User Governance', icon: 'supervised_user_circle' },
  { id: 'tournaments', label: 'Tournaments', icon: 'stadium' },
  { id: 'registrations', label: 'Registrations', icon: 'assignment' },
  { id: 'payments', label: 'Payments', icon: 'payments' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'credit_card' },
  { id: 'activity', label: 'System Logs', icon: 'list_alt' },
  { id: 'rolemanagement', label: 'Role Management', icon: 'admin_panel_settings' },
  { id: 'bulk-approvals', label: 'Bulk Approvals', icon: 'how_to_reg' },
  { id: 'abusefilter', label: 'Abuse Filter', icon: 'security' },
  { id: 'sponsor', label: 'Sponsorships', icon: 'sponsor' },
  { id: 'verify', label: 'Verify Sponsor', icon: 'verified' },
  { id: 'featureflags', label: 'Feature Flags', icon: 'flag' },
]

export default function AdminLayout({
  activeTab,
  onTabChange,
  onNavigate,
  currentUser,
  badges,
  children,
}) {
  const { theme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const sidebarRef = useRef(null)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false)
      } else {
        setSidebarOpen(true)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getBadgeCount = (item) => {
    if (!badges) return null
    if (item.id === 'kyc') return badges.kycPending
    if (item.id === 'upgrades') return badges.upgradePending
    if (item.id === 'abusefilter') return badges.badWordsCount
    return null
  }

  return (
    <div className="admin-layout min-h-screen bg-slate-50 dark:bg-[#0B1020] text-on-background relative transition-colors duration-300 flex">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-60 bg-white dark:bg-[#0F1729] border-r border-slate-200 dark:border-outline-variant/20
          flex flex-col transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${!sidebarOpen && !mobileOpen ? 'lg:w-16' : ''}
        `}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-outline-variant/20 shrink-0">
          <button
            onClick={() => onNavigate && onNavigate('home')}
            className="flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
              MD
            </div>
            {(sidebarOpen || mobileOpen) && (
              <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
                Match District
              </span>
            )}
          </button>
          <button
            onClick={() => { setSidebarOpen(!sidebarOpen); setMobileOpen(false) }}
            className="hidden lg:flex w-6 h-6 rounded-md bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 items-center justify-center text-slate-500 dark:text-white/40 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-sm">
              {sidebarOpen ? 'chevron_left' : 'chevron_right'}
            </span>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const badgeCount = getBadgeCount(item)
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); setMobileOpen(false) }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-semibold'
                    : 'text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }
                  ${!sidebarOpen && !mobileOpen ? 'justify-center px-2' : ''}
                `}
                title={!sidebarOpen && !mobileOpen ? item.label : undefined}
              >
                <span className="material-symbols-outlined text-xl shrink-0">{item.icon}</span>
                {(sidebarOpen || mobileOpen) && (
                  <span className="truncate">{item.label}</span>
                )}
                {(sidebarOpen || mobileOpen) && badgeCount != null && badgeCount > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-bold min-w-[18px] text-center leading-none">
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-slate-200 dark:border-outline-variant/20 shrink-0">
          {(sidebarOpen || mobileOpen) && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[12px] text-rose-500">admin_panel_settings</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-white/70 truncate leading-tight">Admin Panel</p>
                <p className="text-[9px] text-slate-500 dark:text-white/30 truncate leading-tight">v1.4</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top utility bar */}
        <header className="h-14 bg-white/80 dark:bg-[#0F1729]/80 backdrop-blur-md border-b border-slate-200 dark:border-outline-variant/20 flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/40">
              <button
                onClick={() => onNavigate && onNavigate('home')}
                className="hover:text-slate-700 dark:hover:text-white/70 transition-colors"
              >
                Home
              </button>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-slate-800 dark:text-white/80 font-medium">Admin</span>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold capitalize">
                {NAV_ITEMS.find(n => n.id === activeTab)?.label || activeTab}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate && onNavigate('create-tournament')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">add_circle</span>
              <span>Host Event</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate('profile')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white/70 rounded-lg text-xs font-semibold transition-all border border-slate-200 dark:border-outline-variant/20"
            >
              <span className="material-symbols-outlined text-sm">account_circle</span>
              <span>Profile Hub</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
