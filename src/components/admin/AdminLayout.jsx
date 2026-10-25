import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../ThemeContext.jsx'
import { useUser } from '../../UserContext.jsx'

export const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'payments', label: 'Payment Verifications', icon: 'payments', route: '/admin/payments', badgeKey: 'payments' },
  { id: 'kyc', label: 'Organizer KYC', icon: 'how_to_reg', badgeKey: 'kyc' },
  { id: 'organizers', label: 'Organizers', icon: 'group', route: '/admin/organizers' },
  { id: 'upgrades', label: 'Plan Upgrades', icon: 'upgrade', badgeKey: 'upgrades' },
  { id: 'users', label: 'User Governance', icon: 'supervised_user_circle' },
  { id: 'tournaments', label: 'Tournaments', icon: 'stadium' },
  { id: 'sponsorships', label: 'Sponsorships', icon: 'volunteer_activism', route: '/admin/sponsorships', badgeKey: 'sponsors' },
  { id: 'monitoring', label: 'System Health', icon: 'health_and_safety', route: '/admin/system-health' },
]

export default function AdminLayout({
  activeTab,
  onTabChange,
  onNavigate,
  currentUser: propUser,
  badges,
  activeTournament,
  onBackTournament,
  children,
}) {
  const { theme, setTheme } = useTheme()
  const { currentUser: contextUser } = useUser()
  const currentUser = propUser || contextUser
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
    if (item.badgeKey && badges[item.badgeKey] != null) return badges[item.badgeKey]
    if (item.id === 'kyc') return badges.kyc
    if (item.id === 'upgrades') return badges.upgrades
    if (item.id === 'sponsorships') return badges.sponsors
    if (item.id === 'payments') return badges.payments
    return null
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleNavClick = (item) => {
    if (item.route) {
      navigate(item.route)
    } else if (onTabChange) {
      onTabChange(item.id)
    } else {
      navigate(`/admin?tab=${item.id}`)
    }
    setMobileOpen(false)
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-on-background transition-colors duration-200">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          fixed lg:relative inset-y-0 left-0 z-50
          w-64 bg-surface/95 dark:bg-surface/95 backdrop-blur-md border-r border-outline-variant/30
          flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${!sidebarOpen && !mobileOpen ? 'lg:w-[72px]' : ''}
        `}
      >
        {/* Brand / Logo Area */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-outline-variant/30 shrink-0 gap-2">
          <button
            onClick={() => {
              if (onNavigate) onNavigate('home')
              else navigate('/')
            }}
            className="flex items-center gap-2.5 min-w-0 text-left group"
          >
            <img
              src="/logo.png"
              alt="Match District"
              className="h-8 w-auto shrink-0 drop-shadow-[0_0_10px_rgba(37,99,235,0.35)] transition-transform group-hover:scale-105"
            />
            {(sidebarOpen || mobileOpen) && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-headline-md text-sm font-extrabold text-primary tracking-tight truncate">
                  Match District
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 shrink-0">
                  Admin
                </span>
              </div>
            )}
          </button>
          <button
            onClick={() => { setSidebarOpen(!sidebarOpen); setMobileOpen(false) }}
            className="hidden lg:flex w-7 h-7 rounded-lg bg-surface-variant/40 hover:bg-surface-variant border border-outline-variant/20 items-center justify-center text-on-surface-variant hover:text-on-background transition-all shrink-0"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="material-symbols-outlined text-sm">
              {sidebarOpen ? 'chevron_left' : 'chevron_right'}
            </span>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 custom-scrollbar">
          {(sidebarOpen || mobileOpen) && (
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
              Navigation
            </div>
          )}
          {ADMIN_NAV_ITEMS.map((item) => {
            const badgeCount = getBadgeCount(item)
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all
                  ${isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/20'
                    : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/60'
                  }
                  ${!sidebarOpen && !mobileOpen ? 'justify-center px-2 py-3' : ''}
                `}
                title={!sidebarOpen && !mobileOpen ? item.label : undefined}
              >
                <span className={`material-symbols-outlined text-lg shrink-0 ${isActive ? 'text-white' : 'text-primary'}`}>
                  {item.icon}
                </span>
                {(sidebarOpen || mobileOpen) && (
                  <span className="truncate">{item.label}</span>
                )}
                {(sidebarOpen || mobileOpen) && badgeCount != null && badgeCount > 0 && (
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-outline-variant/30 shrink-0 space-y-1.5 bg-surface/50">
          {(sidebarOpen || mobileOpen) ? (
            <div className="space-y-1">
              <button
                onClick={() => navigate('/admin/security/authenticator')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  activeTab === 'authenticator'
                    ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                    : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/50'
                }`}
              >
                <span className="material-symbols-outlined text-base text-primary shrink-0">security</span>
                <span className="truncate">Authenticator (2FA)</span>
              </button>
              <button
                onClick={() => navigate('/admin/profile')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                    : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/50'
                }`}
              >
                <span className="material-symbols-outlined text-base text-primary shrink-0">account_circle</span>
                <span className="truncate">Admin Profile</span>
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-background hover:bg-surface-variant/50 transition-colors"
              >
                <span className="material-symbols-outlined text-base shrink-0">arrow_back</span>
                <span className="truncate">Back to Match District</span>
              </button>

              <div className="pt-2 px-1 flex items-center justify-between border-t border-outline-variant/20 text-[10px] text-on-surface-variant/70">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Staff Session
                </span>
                <span className="font-mono">v1.4</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                onClick={() => navigate('/admin/security/authenticator')}
                title="Authenticator (2FA)"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-variant text-primary"
              >
                <span className="material-symbols-outlined text-lg">security</span>
              </button>
              <button
                onClick={() => navigate('/admin/profile')}
                title="Admin Profile"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-variant text-primary"
              >
                <span className="material-symbols-outlined text-lg">account_circle</span>
              </button>
              <button
                onClick={() => navigate('/')}
                title="Back to Match District"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-variant text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header / Utility Bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between w-full h-16 px-4 sm:px-6 lg:px-8 bg-surface/80 dark:bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-surface border border-outline-variant/30 hover:bg-surface-variant text-on-background transition-colors"
              aria-label="Open navigation menu"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>

            {/* Breadcrumb Hierarchy */}
            <nav className="flex items-center text-xs sm:text-sm font-medium text-on-surface-variant min-w-0 truncate">
              <span className="text-primary font-bold shrink-0">Admin Portal</span>
              <span className="material-symbols-outlined mx-1.5 text-xs text-on-surface-variant/40 shrink-0">chevron_right</span>
              {activeTab === 'tournaments' && activeTournament ? (
                <div className="flex items-center min-w-0 truncate">
                  <button
                    onClick={onBackTournament}
                    className="hover:text-primary transition-colors truncate"
                  >
                    Tournaments
                  </button>
                  <span className="material-symbols-outlined mx-1.5 text-xs text-on-surface-variant/40 shrink-0">chevron_right</span>
                  <span className="font-bold text-on-background truncate">
                    {activeTournament.title || 'Registrations'}
                  </span>
                </div>
              ) : (
                <span className="font-bold text-on-background capitalize truncate">
                  {ADMIN_NAV_ITEMS.find(n => n.id === activeTab)?.label ||
                    (activeTab === 'authenticator' ? 'Authenticator' : activeTab === 'profile' ? 'Profile' : activeTab)}
                </span>
              )}
            </nav>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Host Event CTA */}
            <button
              onClick={() => {
                if (onNavigate) onNavigate('create-tournament')
                else navigate('/create-tournament')
              }}
              className="px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-sm shadow-primary/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              <span className="hidden sm:inline">Host Event</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl border border-outline-variant/30 bg-surface hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors shadow-2xs"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              <span className="material-symbols-outlined text-lg">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Admin Profile Link */}
            <button
              onClick={() => navigate('/admin/profile')}
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-outline-variant/30 bg-surface hover:bg-surface-variant text-on-background flex items-center gap-2 text-xs font-semibold transition-colors shadow-2xs"
              title="Admin Profile"
            >
              <span className="material-symbols-outlined text-base text-primary">account_circle</span>
              <span className="hidden md:inline max-w-[120px] truncate">
                {currentUser?.name || 'Administrator'}
              </span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  )
}
