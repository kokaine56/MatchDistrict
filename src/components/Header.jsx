import React, { useState, useEffect, useCallback, useRef } from 'react'
import SafeImage from './SafeImage.jsx'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'
import { usePolling } from '../hooks/usePolling.js'
import { supabase } from '../utils/supabaseClient'
import { hasRole, getUserRoles } from '../utils/iamRoles.js'

function Header({ activePage, onNavigate }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { currentUser, signOut } = useUser()
  const [alerts, setAlerts] = useState([])
  const [isAlertsOpen, setIsAlertsOpen] = useState(false)
  const alertsRef = useRef(null)

  useEffect(() => {
    if (!isAlertsOpen) return
    const handleClickOutside = (e) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target)) {
        setIsAlertsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAlertsOpen])

  const fetchAlerts = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setAlerts([])
      return
    }
    fetch('/api/alerts', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.alerts)) {
          setAlerts(data.alerts)
        }
      })
      .catch(() => {})
  }, [])

  const markAlertsAsRead = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
        }
      })
      .catch(() => {})
  }

  useEffect(() => { fetchAlerts() }, [fetchAlerts])
  usePolling(fetchAlerts, 10000)

  const unreadCount = alerts.filter(a => !a.is_read).length

  const handleSignOut = async () => {
    await signOut()
  }

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'archive', label: 'Archive' },
    { id: 'my-tournaments', label: 'My Tournaments' },
    { id: 'about', label: 'About' },
    { id: 'help-support', label: 'Help & Support' },
    { id: 'privacy-policy', label: 'Privacy' },
    { id: 'terms-service', label: 'Terms' },
  ]

  return (
    <>
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsMenuOpen(false)}></div>
      )}

      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-surface-container/80 dark:bg-surface-container/80 backdrop-blur-xl border-b border-outline-variant shadow-sm">
        <div className="flex justify-between items-center px-3 sm:px-sm md:px-lg h-11 md:h-14 w-full max-w-container-max mx-auto relative">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate && onNavigate('home')}
              className="flex items-center gap-2 shrink-0"
            >
              <img
                src="/logo.png"
                alt="Match District"
                className="h-7 md:h-9 w-auto drop-shadow-[0_0_10px_rgba(99,102,241,0.4)] hover:drop-shadow-[0_0_16px_rgba(99,102,241,0.7)] transition-all duration-300"
              />
              <span className="font-headline-md text-[18px] md:text-headline-md font-extrabold text-primary dark:text-primary tracking-tight">
                Match District
              </span>
            </motion.button>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10">
            {navLinks.map((link) => {
              const isActive = activePage === link.id
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate && onNavigate(link.id)}
                  className={`font-headline-md text-[15px] font-semibold transition-colors relative py-1.5 ${
                    isActive ? 'text-primary' : 'text-black dark:text-white hover:text-primary'
                  }`}
                >
                  <span className="relative z-10">{link.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeHeaderTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full z-0"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-2 sm:gap-sm shrink-0">
            {/* Notifications Bell with Dropdown */}
            <div className="relative" ref={alertsRef}>
              <button 
                onClick={() => {
                  setIsAlertsOpen(!isAlertsOpen);
                  if (!isAlertsOpen && unreadCount > 0) {
                    markAlertsAsRead();
                  }
                }}
                className="material-symbols-outlined text-primary text-[22px] flex items-center justify-center p-1.5 rounded-xl hover:bg-indigo-500/10 transition-colors relative" 
                data-icon="notifications"
              >
                notifications
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-surface-container" />
                )}
              </button>

              <AnimatePresence>
                {isAlertsOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-[#0f111a] border border-outline-variant rounded-2xl shadow-xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-50 overflow-hidden"
                    >
                      <div className="p-3 border-b border-outline-variant flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-black dark:text-white">Alerts Inbox</h4>
                        {unreadCount > 0 && (
                          <span className="text-[9px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                            {unreadCount} New
                          </span>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto no-scrollbar divide-y divide-outline-variant/30">
                        {alerts.length > 0 ? (
                          alerts.map(alert => (
                            <div 
                              key={alert.id}
                              onClick={() => {
                                setIsAlertsOpen(false);
                                if (alert.tournament_id) {
                                  onNavigate && onNavigate('tournament-detail', alert.tournament_id);
                                }
                              }}
                              className={`p-3 text-left cursor-pointer transition-colors hover:bg-indigo-500/5 ${!alert.is_read ? 'bg-indigo-500/[0.02]' : ''}`}
                            >
                              <h5 className="font-bold text-[11px] sm:text-xs text-black dark:text-white truncate flex items-center gap-1.5">
                                {!alert.is_read && <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />}
                                {alert.title}
                              </h5>
                              <p className="text-[10px] text-slate-500 dark:text-white/50 leading-relaxed mt-0.5 line-clamp-2">
                                {alert.message}
                              </p>
                              <span className="text-[8px] text-slate-400 dark:text-white/30 block mt-1 font-mono">
                                {new Date(alert.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center text-slate-400 dark:text-white/30 flex flex-col items-center gap-1">
                            <span className="material-symbols-outlined text-2xl">mail_outline</span>
                            <span className="text-[10px]">No alerts yet.</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {currentUser ? (
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-outline-variant/40 ml-1">
                {hasRole(getUserRoles(currentUser), 'admin') ? (
                  <button 
                    onClick={() => onNavigate && onNavigate('admin')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-headline-md text-xs font-bold tracking-wide border border-rose-500/35 transition-all shadow-sm shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                    <span>Admin Panel</span>
                  </button>
                ) : hasRole(getUserRoles(currentUser), 'organiser') ? (
                  <button 
                    onClick={() => onNavigate && onNavigate('create-tournament')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-primary font-headline-md text-xs font-bold tracking-wide border border-primary/30 transition-all shadow-sm shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">add_circle</span>
                    <span>Host Event</span>
                  </button>
                ) : null}
                <div 
                  onClick={() => onNavigate && onNavigate('profile')} 
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-headline-md text-[10px] md:text-xs font-bold text-primary uppercase overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all shadow-sm"
                  title={`${currentUser.name || currentUser.gamerTag || 'User Profile'} (Click to view dashboard)`}
                >
                  <SafeImage 
                    src={currentUser.avatar} 
                    alt="avatar" 
                    className="avatar-img" 
                  />
                </div>
                <button 
                  onClick={handleSignOut} 
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-highest hover:bg-surface-variant text-black dark:text-white font-headline-md text-xs font-bold tracking-wide border border-outline-variant transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">logout</span> 
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="hidden lg:flex items-center pl-2 border-l border-outline-variant/40 ml-1">
                <button 
                  onClick={() => onNavigate && onNavigate('login')} 
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/20 hover:bg-indigo-500/20 dark:hover:bg-indigo-400/30 text-primary font-headline-md text-xs font-bold tracking-wide border border-primary/30 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">login</span> 
                  <span>Sign In</span>
                </button>
              </div>
            )}

            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="lg:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-surface-container-highest flex items-center justify-center hover:bg-indigo-500/10 dark:hover:bg-white/10 hover:text-primary transition-all text-black dark:text-white border border-outline-variant shrink-0 ml-1 relative z-50"
              aria-label="Toggle navigation menu"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                {isMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>

          {/* Mobile Overlay Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-full right-3 sm:right-sm md:right-lg mt-2 w-52 bg-white dark:bg-[#07080C]/95 backdrop-blur-2xl p-3 rounded-2xl border border-outline-variant/50 shadow-md dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-50"
              >
                <div className="flex flex-col gap-0.5">
                  {currentUser && (
                    <div 
                      onClick={() => { setIsMenuOpen(false); onNavigate && onNavigate('profile'); }}
                      className="px-2 py-1 mb-2 flex items-center gap-2.5 border-b border-outline-variant/30 pb-2.5 cursor-pointer hover:bg-primary/10 rounded-xl transition-all"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-headline-md text-xs font-bold text-primary uppercase overflow-hidden shrink-0">
                        <SafeImage 
                          src={currentUser.avatar} 
                          alt="avatar" 
                          className="avatar-img" 
                        />
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-headline-md text-xs font-bold text-black dark:text-white truncate">
                          {currentUser.name || currentUser.gamerTag}
                        </div>
                      </div>
                    </div>
                  )}
                  {hasRole(getUserRoles(currentUser), 'admin') ? (
                    <button
                      onClick={() => { setIsMenuOpen(false); onNavigate && onNavigate('admin'); }}
                      className="px-3 py-2 rounded-xl text-[13px] font-bold tracking-wide text-left transition-all hover:bg-rose-500/10 hover:text-rose-500 text-rose-500 flex items-center gap-1.5 mb-2 border border-rose-500/20 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                      <span>Admin Panel</span>
                    </button>
                  ) : null}
                  
                  {navLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => { setIsMenuOpen(false); onNavigate && onNavigate(link.id); }}
                      className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold tracking-wide text-left transition-all ${
                        activePage === link.id 
                          ? 'bg-primary text-white font-bold' 
                          : 'hover:bg-indigo-500/10 dark:hover:bg-white/10 hover:text-primary text-black dark:text-white'
                      }`}
                    >
                      {link.label}
                    </button>
                  ))}

                  {currentUser ? (
                    <button 
                      onClick={() => { setIsMenuOpen(false); handleSignOut(); }} 
                      className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-surface-container-highest hover:bg-gray-200 dark:hover:bg-surface-variant text-black dark:text-on-surface font-headline-md text-[14px] font-bold tracking-wide text-left transition-all border border-outline-variant flex items-center gap-2 mt-1"
                    >
                      <span className="material-symbols-outlined text-base">logout</span> Sign Out
                    </button>
                  ) : (
                    <button 
                      onClick={() => { setIsMenuOpen(false); onNavigate && onNavigate('login'); }} 
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/20 hover:bg-indigo-500/20 dark:hover:bg-indigo-400/30 text-primary font-headline-md text-[14px] font-bold tracking-wide text-left transition-all border border-primary/30 flex items-center gap-2 mt-1"
                    >
                      <span className="material-symbols-outlined text-base">login</span> Sign In
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
    </>
  )
}

export default Header
