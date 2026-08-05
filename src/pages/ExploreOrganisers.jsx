import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '../components/Header.jsx'
import { getAuthToken } from '../utils/getAuthToken.js'
import VerificationBadge from '../components/VerificationBadge.jsx'
import { DEFAULT_BANNER } from '../utils/defaults.js'

// --- Ranking Formula ---
function computeRank(org) {
  const rating = parseFloat(org.rating) || 0
  const followers = parseInt(org.followers) || 0
  const disputes = parseInt(org.disputes) || 0
  const tournaments = parseInt(org.tournamentsHosted) || 1
  const disputeRate = Math.min(disputes / Math.max(tournaments, 1), 1)
  return (rating * 20) + (followers / 1000) + ((1 - disputeRate) * 30)
}

const SORT_OPTIONS = [
  { key: 'rank',        label: 'Overall',      icon: 'military_tech' },
  { key: 'rating',      label: 'Rating',       icon: 'star' },
  { key: 'followers',   label: 'Followers',    icon: 'group' },
  { key: 'disputes',    label: 'Clean Record', icon: 'shield' },
  { key: 'tournaments', label: 'Most Events',  icon: 'sports_esports' },
]

const DEMO_ORGS = []

function formatFollowers(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K'
  return String(n)
}

function StarRating({ value }) {
  const stars = parseFloat(value) || 0
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="material-symbols-outlined text-[12px]"
          style={{
            fontVariationSettings: "'FILL' 1",
            color: i <= Math.round(stars) ? '#f59e0b' : 'rgba(128,128,128,0.3)',
          }}
        >star</span>
      ))}
    </span>
  )
}

export default function ExploreOrganisers({ onNavigate }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rank')
  const [search, setSearch] = useState('')
  const [isFollowingActive, setIsFollowingActive] = useState(false)
  const [activeOrgId, setActiveOrgId] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/organisers')
      .then(r => r.json())
      .then(data => {
        let dbOrgs = []
        if (data.success && Array.isArray(data.users)) {
          dbOrgs = data.users.map(u => ({
            id: u.id,
            name: u.orgName || u.name || 'Organiser',
            handle: u.orgHandle || u.gamerTag || '@org',
            avatar: u.orgImage || u.avatar,
            rating: u.rating || '4.5',
            followers: parseInt(u.followers) || 0,
            disputes: parseInt(u.disputes) || 0,
            tournamentsHosted: parseInt(u.tournamentsHosted) || 0,
            tier: u.tier || 'Free',
            verified: !!u.kycVerified,
            bio: u.experience || '',
            games: u.games || [],
            role: 'organiser',
            banner: u.banner || DEFAULT_BANNER,
            email: u.email,
            phone: u.phone,
            socialLinks: u.socialLinks,
          }))
        }
        
        // Merge with DEMO_ORGS avoiding duplicate IDs
        const merged = [...dbOrgs]
        const existingIds = new Set(dbOrgs.map(o => o.id))
        DEMO_ORGS.forEach(demo => {
          if (!existingIds.has(demo.id)) {
            merged.push(demo)
          }
        })
        setOrgs(merged)
      })
      .catch(() => setOrgs(DEMO_ORGS))
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => {
    const filtered = orgs.filter(o =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.handle.toLowerCase().includes(search.toLowerCase())
    )
    const withScore = filtered.map(o => ({ ...o, _score: computeRank(o) }))
    switch (sortBy) {
      case 'rating':      return withScore.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
      case 'followers':   return withScore.sort((a, b) => b.followers - a.followers)
      case 'disputes':    return withScore.sort((a, b) => a.disputes - b.disputes)
      case 'tournaments': return withScore.sort((a, b) => b.tournamentsHosted - a.tournamentsHosted)
      default:            return withScore.sort((a, b) => b._score - a._score)
    }
  }, [orgs, sortBy, search])

  // Sync activeOrgId when search list refreshes
  useEffect(() => {
    if (sorted.length > 0) {
      if (!activeOrgId || !sorted.some(o => o.id === activeOrgId)) {
        setActiveOrgId(sorted[0].id)
      }
    }
  }, [sorted, activeOrgId])

  const activeOrg = useMemo(() => {
    return sorted.find(o => o.id === activeOrgId) || sorted[0] || null
  }, [sorted, activeOrgId])

  // Fetch follow status for active organizer
  useEffect(() => {
    if (!activeOrgId) return
    async function fetchFollowStatus() {
      const token = await getAuthToken()
      if (!token) {
        setIsFollowingActive(false)
        return
      }
      fetch(`/api/organisers/${activeOrgId}/follow-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setIsFollowingActive(data.followed)
          }
        })
        .catch(() => setIsFollowingActive(false))
    }
    fetchFollowStatus()
  }, [activeOrgId])

  const handleFollowToggle = async (orgId) => {
    const token = await getAuthToken()
    if (!token) {
      onNavigate && onNavigate('login')
      return
    }
    try {
      const res = await fetch(`/api/organisers/${orgId}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await res.json()
      if (data.success) {
        setIsFollowingActive(data.followed)
        setOrgs(prevOrgs => prevOrgs.map(o => {
          if (o.id === orgId) {
            return {
              ...o,
              followers: data.followed ? o.followers + 1 : Math.max(0, o.followers - 1)
            }
          }
          return o
        }))
      }
    } catch (err) {
      console.error('Error toggling follow:', err)
    }
  }

  const handleOrganiserClick = (org) => {
    // Map fields so the target profile route can parse them easily
    const profileUser = {
      id: org.id,
      role: 'organiser',
      orgName: org.name,
      name: org.name,
      gamerTag: org.handle,
      email: org.email || `${org.name.toLowerCase().replace(/\s+/g, '')}@matchdistrict.in`,
      phone: org.phone || '+91 99999 99999',
      experience: org.bio,
      avatar: org.avatar,
      banner: org.banner || DEFAULT_BANNER,
      tier: org.tier || 'Free',
      kycVerified: org.verified,
      socialLinks: org.socialLinks || JSON.stringify({ website: org.website || '', discord: org.discord || '', twitter: org.twitter || '' })
    }
    onNavigate && onNavigate('profile', profileUser)
  }

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-30" />
      {/* Glows — dark mode only */}
      <div className="dark:block hidden absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/8 blur-[130px] rounded-full pointer-events-none z-0" />
      <div className="dark:block hidden absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-red-500/5 blur-[100px] rounded-full pointer-events-none z-0" />

      <Header activePage="explore-organisers" onNavigate={onNavigate} />

      <main className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 pt-16 pb-16">

        {/* Page Title */}
        <div className="pt-6 sm:pt-8 pb-4 sm:pb-6">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[#ff0000] text-xl sm:text-3xl dark:filter dark:drop-shadow-[0_0_10px_rgba(255,0,0,0.6)]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >military_tech</span>
            <h1 className="font-black text-xl sm:text-3xl md:text-4xl text-on-background tracking-tight uppercase leading-tight">
              Explore Organisers
            </h1>
          </div>
          <p className="text-on-surface-variant text-xs sm:text-sm max-w-xl leading-relaxed mt-1.5 opacity-70">
            Ranked by rating, followers &amp; dispute-free hosting record.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 sm:mb-8 space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-lg pointer-events-none">search</span>
            <input
              type="text"
              placeholder="Search organisers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant rounded-xl pl-9 pr-4 py-2.5 text-on-background text-sm placeholder:text-on-surface-variant/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          {/* Sort pills */}
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-3 px-3 sm:-mx-6 sm:px-6">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-bold tracking-wide uppercase shrink-0 transition-all duration-200 active:scale-95 ${
                  sortBy === opt.key
                    ? 'bg-primary text-white shadow-[0_0_14px_rgba(74,76,216,0.35)]'
                    : 'bg-surface-container text-on-surface-variant border border-outline-variant hover:border-primary/40 hover:text-on-background'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-2xl bg-surface-container border border-outline-variant/40 h-56 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">group_off</span>
            <p className="text-on-surface-variant text-sm">No organisers found.</p>
          </div>
        )}

        {/* Content */}
        {!loading && sorted.length > 0 && (
          <>
            {/* Split layout: List on Left, Active details card on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: List of Organisers */}
              <div className="col-span-1 lg:col-span-7 space-y-2.5">
                <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-widest font-bold block mb-1">
                  Organizer Registry ({sorted.length})
                </p>
                <div className="space-y-2">
                  {sorted.map((org, idx) => {
                    const rank = idx + 1
                    const isActive = activeOrgId === org.id
                    return (
                      <motion.div
                        key={org.id}
                        onClick={() => {
                          setActiveOrgId(org.id)
                          // Mobile immediate navigation to profile page
                          if (window.innerWidth < 1024) {
                            handleOrganiserClick(org)
                          }
                        }}
                        whileHover={{ scale: 1.025, x: 6 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className={`group p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all duration-300 relative overflow-hidden ${
                          isActive
                            ? 'bg-primary/8 border-primary/50 shadow-[0_4px_20px_rgba(99,102,241,0.15)]'
                            : 'bg-surface-container-low border-outline-variant/60 hover:border-primary/40 hover:bg-surface-container hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                        }`}
                      >
                        {/* Left Edge Neon Indicator */}
                        <div className={`absolute left-0 top-0 bottom-0 w-[4px] transition-all duration-300 origin-center ${
                          isActive 
                            ? 'bg-primary shadow-[0_0_12px_#4a4cd8]' 
                            : 'bg-transparent group-hover:bg-primary/50 scale-y-0 group-hover:scale-y-100'
                        }`} />

                        {/* Glossy Skew Shine */}
                        <div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/10 to-transparent card-shine-sweep pointer-events-none" />

                        {/* Rank Badge */}
                        <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0 ${
                          rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]' :
                          rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900' :
                          rank === 3 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                          'bg-surface-container-highest text-on-surface-variant border border-outline-variant'
                        }`}>
                          #{rank}
                        </div>

                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-outline-variant bg-surface-container-high transition-transform duration-300 group-hover:scale-105">
                          {org.orgImage || org.avatar
                            ? <img src={org.orgImage || org.avatar} alt={org.orgName || org.name} className="avatar-img" />
                            : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-on-surface-variant text-base">business</span></div>}
                        </div>

                        {/* Identity */}
                        <div className="min-w-0 flex-grow">
                          <h4 className="font-bold text-xs sm:text-sm text-on-background truncate flex items-center gap-1 group-hover:text-primary transition-colors">
                            <span>{org.name}</span>
                            <VerificationBadge tier={org.tier} size="sm" />
                          </h4>
                          <p className="text-[9px] sm:text-[10px] text-on-surface-variant/50 font-mono tracking-tight truncate leading-none mt-0.5">{org.handle}</p>
                        </div>

                        {/* Mini Stats (Hidden on mobile) */}
                        <div className="hidden sm:flex items-center gap-3 shrink-0 text-[10px] font-bold text-on-surface-variant/80">
                          <div className="flex items-center gap-0.5 transition-colors group-hover:text-primary">
                            <span className="material-symbols-outlined text-[12px] text-primary/70">group</span>
                            <span>{formatFollowers(org.followers)}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            <span>{org.rating}</span>
                          </div>
                        </div>

                        {/* Chevron Indicator */}
                        <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-primary/95 group-hover:translate-x-1 filter group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-all duration-300 text-base shrink-0 select-none">
                          {window.innerWidth < 1024 ? 'arrow_forward' : 'chevron_right'}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* Right Column: Dynamic Organizer Details Card (Desktop view only) */}
              <div className="col-span-1 lg:col-span-5 hidden lg:block sticky top-24">
                <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-widest font-bold block mb-1">
                  Organizer Details Card
                </p>
                <AnimatePresence mode="wait">
                  {activeOrg && (
                    <motion.div
                      key={activeOrg.id}
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -15, scale: 0.98 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="relative rounded-2xl overflow-hidden bg-surface-container-low border border-outline-variant shadow-lg"
                    >
                      {/* Glowing Top Divider */}
                      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_8px_rgba(74,76,216,0.3)]" />

                      {/* Card Banner */}
                      <div className="h-20 w-full relative overflow-hidden bg-surface-container-high border-b border-outline-variant/30">
                        <img src={activeOrg.banner || DEFAULT_BANNER} className="w-full h-full object-cover" alt="Organizer Banner" />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-transparent opacity-90" />
                      </div>

                      {/* Content Area */}
                      <div className="px-4 pb-4 pt-0 relative -mt-6">
                        <div className="flex items-end gap-3 mb-2.5">
                          <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-surface-container-low bg-surface-container bg-surface-container-highest shadow-md shrink-0">
                            {activeOrg.orgImage || activeOrg.avatar
                              ? <img src={activeOrg.orgImage || activeOrg.avatar} alt={activeOrg.orgName || activeOrg.name} className="avatar-img" />
                              : <div className="w-full h-full flex items-center justify-center bg-surface-container"><span className="material-symbols-outlined text-on-surface-variant text-xl">business</span></div>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-on-background font-bold text-sm sm:text-base truncate flex items-center gap-1.5 leading-none mb-1">
                              <span>{activeOrg.name}</span>
                              <VerificationBadge tier={activeOrg.tier} size="sm" />
                            </h3>
                            <p className="text-on-surface-variant text-[10px] sm:text-[11px] truncate opacity-55 leading-none">{activeOrg.handle}</p>
                          </div>
                        </div>

                        {/* Bio */}
                        <p className="text-on-surface-variant text-[11px] leading-relaxed mb-3 opacity-70 bg-surface-container/30 border border-outline-variant/30 p-2.5 rounded-lg min-h-[54px] line-clamp-3">
                          {activeOrg.bio || "No organizer description available."}
                        </p>

                        {/* Rating and Tier */}
                        <div className="flex items-center justify-between gap-2.5 mb-3 bg-surface-container/50 border border-outline-variant/30 p-2 rounded-lg">
                          <div className="flex items-center gap-1">
                            <StarRating value={activeOrg.rating} />
                            <span className="text-[10px] text-on-surface-variant font-bold ml-0.5">{activeOrg.rating}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                            activeOrg.tier === 'Elite' ? 'text-primary border-primary/30 bg-primary/8' :
                            activeOrg.tier === 'Pro'   ? 'text-secondary border-secondary/30 bg-secondary/8' :
                            activeOrg.tier === 'Basic' ? 'text-amber-500 border-amber-500/30 bg-amber-500/8' :
                            'text-on-surface-variant border-outline-variant bg-surface-container-high'
                          }`}>{activeOrg.tier || 'Free'}</span>
                        </div>

                        {/* Statistics Grid */}
                        <div className="grid grid-cols-3 gap-1.5 mb-3">
                          {[
                            { label: 'Followers', value: formatFollowers(activeOrg.followers), disputeStyled: false },
                            { label: 'Events',    value: activeOrg.tournamentsHosted,         disputeStyled: false },
                            { label: 'Disputes',  value: activeOrg.disputes,                  disputeStyled: true },
                          ].map(s => {
                            const disputeRate = activeOrg.disputes / Math.max(activeOrg.tournamentsHosted, 1)
                            const disputeColor = disputeRate < 0.05 ? '#22c55e' : disputeRate < 0.15 ? '#f59e0b' : '#ef4444'
                            return (
                              <div key={s.label} className="rounded-xl px-1 py-1.5 text-center bg-surface-container border border-outline-variant/60">
                                <div className="font-bold text-[11px] text-on-background" style={s.disputeStyled ? { color: disputeColor } : {}}>{s.value}</div>
                                <div className="text-on-surface-variant text-[8px] font-bold uppercase tracking-wider mt-0.5 opacity-45">{s.label}</div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Dispute Health bar */}
                        <div className="mb-3.5 bg-surface-container/30 border border-outline-variant/20 p-2 rounded-lg">
                          {(() => {
                            const disputeRate = activeOrg.disputes / Math.max(activeOrg.tournamentsHosted, 1)
                            const disputeColor = disputeRate < 0.05 ? '#22c55e' : disputeRate < 0.15 ? '#f59e0b' : '#ef4444'
                            const healthPct = Math.round((1 - Math.min(disputeRate, 1)) * 100)
                            return (
                              <>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[8px] text-on-surface-variant uppercase font-bold tracking-wider opacity-45">Dispute Health</span>
                                  <span className="text-[8px] font-bold" style={{ color: disputeColor }}>
                                    {disputeRate < 0.05 ? 'Excellent' : disputeRate < 0.15 ? 'Good' : 'Needs Review'}
                                  </span>
                                </div>
                                <div className="h-1 rounded-full bg-surface-container-high overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${healthPct}%`, background: disputeColor }}
                                  />
                                </div>
                              </>
                            )
                          })()}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOrganiserClick(activeOrg)}
                            className="flex-grow py-2 rounded-xl bg-primary text-white font-headline-md text-xs font-bold transition-all duration-300 hover:brightness-95 active:scale-95 shadow-[0_4px_14px_rgba(74,76,216,0.25)] text-center flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            Open Page
                          </button>
                          <button
                            onClick={() => handleFollowToggle(activeOrg.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border flex items-center gap-1 shrink-0 ${
                              isFollowingActive
                                ? 'bg-surface-container-high border-outline-variant text-on-background'
                                : 'border-[#ff0000]/40 text-[#ff0000] bg-[#ff0000]/5 hover:bg-[#ff0000] hover:text-white hover:border-[#ff0000]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {isFollowingActive ? 'check' : 'add'}
                            </span>
                            {isFollowingActive ? 'Following' : 'Follow'}
                          </button>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </>
        )}
      </main>
    </div>
  )
}
