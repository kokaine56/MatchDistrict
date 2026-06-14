import React, { createContext, useContext, useState, useEffect, useRef } from 'react'

const ThemeContext = createContext()

// Apply theme class immediately to <html> — called before React renders anything
function applyThemeToDocument(theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
}

export function ThemeProvider({ children }) {
  // 1. Start from cached localStorage so there is zero flash on page load
  const [theme, setThemeState] = useState(() => {
    const cached = localStorage.getItem('matchdistrict_theme') || 'dark'
    applyThemeToDocument(cached)
    return cached
  })

  // Keep a ref to avoid stale-closure issues in the polling interval
  const themeRef = useRef(theme)

  const setTheme = (newTheme) => {
    themeRef.current = newTheme
    setThemeState(newTheme)
    applyThemeToDocument(newTheme)
    localStorage.setItem('matchdistrict_theme', newTheme)
  }

  // 2. Fetch the authoritative theme from the database on mount (and every 60 s)
  const fetchThemeFromDb = async () => {
    try {
      const res = await fetch('/api/settings/theme')
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.theme && data.theme !== themeRef.current) {
        console.log(`🎨 [THEME] Global theme synced from DB: ${data.theme}`)
        setTheme(data.theme)
      }
    } catch (err) {
      // Silent fail — fall back to cached localStorage value
      console.warn('[THEME] Could not fetch global theme from DB, using cache.', err.message)
    }
  }

  useEffect(() => {
    // Fetch immediately on mount
    fetchThemeFromDb()

    // Poll every 60 seconds to pick up any admin changes while the tab is open
    const interval = setInterval(fetchThemeFromDb, 60_000)

    // Listen for cross-tab storage changes (e.g. another tab opened and synced DB)
    const handleStorageChange = (e) => {
      if (e.key === 'matchdistrict_theme' && e.newValue && e.newValue !== themeRef.current) {
        setTheme(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
