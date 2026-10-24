import { NavLink, useLocation } from 'react-router-dom'
import { useUser } from '../UserContext.jsx'

/**
 * Checks if the browser has an active persistent session to predict
 * authentication status during initial asynchronous hydration, preventing
 * a brief flash of the wrong navigation label.
 */
function hasLikelySession() {
  try {
    if (typeof window === 'undefined') return false
    if (sessionStorage.getItem('md_logged_out') === 'true') return false
    if (localStorage.getItem('md_persistent_session')) return true
    if (localStorage.getItem('currentUser')) return true
    if (sessionStorage.getItem('md_user')) return true
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return true
    }
  } catch {
    return false
  }
}

export default function MobileBottomNav() {
  const { pathname } = useLocation()
  const { currentUser, loading } = useUser()

  // Prioritize resolved user state; during initial load fallback to persistent storage prediction
  const isAuthenticated = Boolean(currentUser) || (loading && hasLikelySession())

  const tabs = [
    { id: 'home', label: 'Home', to: '/', icon: 'home', matches: (path) => path === '/' },
    {
      id: 'tournaments',
      label: isAuthenticated ? 'My Tournaments' : 'Tournaments',
      to: isAuthenticated ? '/my-tournaments' : '/tournaments',
      icon: 'emoji_events',
      matches: (path) =>
        isAuthenticated
          ? path === '/my-tournaments' || path.startsWith('/my-tournaments/')
          : path === '/tournaments' || path.startsWith('/tournaments/'),
    },
    { id: 'help', label: 'Help', to: '/help', icon: 'help', matches: (path) => path === '/help' },
    { id: 'profile', label: 'Profile', to: '/profile', icon: 'person', matches: (path) => path.startsWith('/profile') },
  ]

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      {tabs.map((tab) => {
        const active = tab.matches(pathname)
        return (
          <NavLink
            key={tab.id}
            to={tab.to}
            end={tab.to === '/'}
            className={`mobile-bottom-nav__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="material-symbols-outlined mobile-bottom-nav__icon" aria-hidden="true">{tab.icon}</span>
            <span className="mobile-bottom-nav__label">{tab.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
