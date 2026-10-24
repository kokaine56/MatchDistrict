import { NavLink, useLocation } from 'react-router-dom'

const tabs = [
  { label: 'Home', to: '/', icon: 'home', matches: (path) => path === '/' },
  {
    label: 'My Tournaments',
    to: '/my-tournaments',
    icon: 'emoji_events',
    matches: (path) => path === '/my-tournaments' || path.startsWith('/tournaments/'),
  },
  { label: 'Help', to: '/help', icon: 'help', matches: (path) => path === '/help' },
  { label: 'Profile', to: '/profile', icon: 'person', matches: (path) => path.startsWith('/profile') },
]

export default function MobileBottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      {tabs.map((tab) => {
        const active = tab.matches(pathname)
        return (
          <NavLink
            key={tab.label}
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
