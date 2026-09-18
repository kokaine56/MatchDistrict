import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../ThemeContext.jsx'
import Logo from '../Logo.jsx'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'monitoring' },
  { id: 'kyc', label: 'Organizer KYC', icon: 'how_to_reg', badgeKey: 'kyc' },
  { id: 'organizers', label: 'Organizers', icon: 'group', route: '/admin/organizers' },
  { id: 'upgrades', label: 'Plan Upgrades', icon: 'upgrade', badgeKey: 'upgrades' },
  { id: 'users', label: 'User Governance', icon: 'supervised_user_circle' },
  { id: 'tournaments', label: 'Tournaments', icon: 'stadium' },
  { id: 'devices', label: 'Payment Verifier', icon: 'qr_code_scanner' },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { id: 'sponsorships', label: 'Sponsorships', icon: 'volunteer_activism', route: '/admin/sponsorships', badgeKey: 'sponsors' },
]

export default function AdminLayout({
  activeTab,
  onTabChange,
  onNavigate,
  currentUser,
  badges,
  activeTournament,
  onBackTournament,
  children,
}) {
  const { theme } = useTheme()
  const navigate = useNavigate()
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
    if (item.id === 'kyc') return badges.kyc
    if (item.id === 'upgrades') return badges.upgrades
    if (item.id === 'sponsorships') return badges.sponsors
    return null
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#0B1020] text-on-background transition-colors duration-300">
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
          fixed lg:relative inset-y-0 left-0 z-50
          w-60 bg-white dark:bg-[#0F1729] border-r border-slate-200 dark:border-outline-variant/20
          flex flex-col h-full flex-shrink-0 transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${!sidebarOpen && !mobileOpen ? 'lg:w-16' : ''}
        `}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-outline-variant/20 shrink-0 gap-3">
          <button
            onClick={() => onNavigate && onNavigate('home')}
            className="flex items-center gap-3 min-w-0"
          >
            <div className="shrink-0">
              <Logo showText={false} size="sm" />
            </div>
            {(sidebarOpen || mobileOpen) && (
              <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight truncate">
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
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 custom-scrollbar">
          {NAV_ITEMS.map((item) => {
            const badgeCount = getBadgeCount(item)
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.route) {
                    navigate(item.route)
                  } else {
                    onTabChange(item.id)
                  }
                  setMobileOpen(false)
                }}
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
            <div className="space-y-2">
              <button
                onClick={() => navigate('/admin/security/authenticator')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-white/60 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-400 transition-all"
              >
                <span className="material-symbols-outlined text-xl shrink-0">security</span>
                <span className="truncate">Authenticator</span>
              </button>
              <button
                onClick={() => navigate('/admin/profile')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-white/60 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-400 transition-all"
              >
                <span className="material-symbols-outlined text-xl shrink-0">person</span>
                <span className="truncate">Profile</span>
              </button>
              <div className="flex items-center gap-2 px-1">
                <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-rose-500">admin_panel_settings</span>
                </div>
                <div className="overflow-hidden">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-white/70 truncate leading-tight">Admin Panel</p>
                  <p className="text-[9px] text-slate-500 dark:text-white/30 truncate leading-tight">v1.4</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top utility bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between w-full h-16 px-4 sm:px-6 bg-white dark:bg-[#0F1729] border-b border-slate-200 dark:border-outline-variant/20 shrink-0 font-sans antialiased tracking-tight">
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/60 transition-all"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>

            {/* Breadcrumb */}
            <nav className="hidden sm:flex items-center text-sm">
              <span className="font-medium text-slate-500 dark:text-white/40">Admin</span>
              <span className="material-symbols-outlined mx-1.5 text-sm text-slate-300 dark:text-white/20">chevron_right</span>
              {activeTab === 'tournaments' && activeTournament ? (
                <div className="flex items-center">
                  <button
                    onClick={onBackTournament}
                    className="font-medium text-slate-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
                  >
                    Tournaments
                  </button>
                  <span className="material-symbols-outlined mx-1.5 text-sm text-slate-300 dark:text-white/20">chevron_right</span>
                  <span className="font-semibold text-slate-900 dark:text-white capitalize">
                    Registration
                  </span>
                </div>
              ) : (
                <span className="font-semibold text-slate-900 dark:text-white capitalize">
                  {NAV_ITEMS.find(n => n.id === activeTab)?.label || activeTab}
                </span>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => onNavigate && onNavigate('create-tournament')}
              className="flex items-center justify-center h-10 px-3 sm:px-4 text-sm font-semibold text-white transition-colors bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
            >
              <span className="material-symbols-outlined text-lg leading-none sm:mr-2">add_circle</span>
              <span className="hidden sm:inline">Host Event</span>
            </button>
            <button
              onClick={() => navigate('/admin/profile')}
              className="flex items-center justify-center h-10 px-3 sm:px-4 text-sm font-semibold transition-colors bg-white border rounded-lg shadow-sm text-slate-700 dark:text-white/70 border-slate-200 dark:border-outline-variant/20 hover:bg-slate-50 dark:hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-lg leading-none sm:mr-2 text-slate-500 dark:text-white/40">account_circle</span>
              <span className="hidden sm:inline">Profile Hub</span>
            </button>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
