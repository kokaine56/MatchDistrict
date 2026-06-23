import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import HeroBannerCarousel from '../components/HeroBannerCarousel'
import { useUser } from '../UserContext.jsx'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import OrganizerShowcase from '../components/OrganizerShowcase'
import TournamentCard from '../components/TournamentCard'
import SponsoredStar from '../components/SponsoredStar'
import VerificationBadge from '../components/VerificationBadge'
import sponsorAsus from '../assets/sponsors/sponsor_asus.png'
import sponsorLenovo from '../assets/sponsors/sponsor_lenovo.png'
import sponsorNvidia from '../assets/sponsors/sponsor_nvidia.png'
import sponsorValorant from '../assets/sponsors/sponsor_valorant.png'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle'

const formatINR = (val) => {
  const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? (val || 'TBA') : `₹${n.toLocaleString('en-IN')}`
}

const GAME_ICON_MAP = {
  bgmi: gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant,
}

function Homepage({ onNavigate }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isFeedbackPaused, setIsFeedbackPaused] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(null)
  const { currentUser, signOut } = useUser()
  const [tournamentsList, setTournamentsList] = useState([])
  const [organisersList, setOrganisersList] = useState([])
  const [now, setNow] = useState(new Date())
  const pauseTimeoutRef = useRef(null)

  // Real-time observer tick pipeline
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const loadTournaments = useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments')
    if (ok && data?.success && data.tournaments) {
      const filtered = data.tournaments.filter(t => !t.isDraft)
      setTournamentsList(filtered)
    }
    try {
      const r = await fetch('/api/organisers')
      const orgData = await r.json()
      if (orgData.success && Array.isArray(orgData.users)) {
        setOrganisersList(orgData.users)
      }
    } catch (e) {
      console.warn('Failed to load dynamic organizers on homepage:', e)
    }
  }, [])

  useEffect(() => {
    loadTournaments()
  }, [loadTournaments])

  useRefetchOnFocus(loadTournaments)

  const handleSignOut = async () => {
    await signOut()
  }

  const handleBecomeOrganizer = () => {
    if (!currentUser) {
      onNavigate && onNavigate('login')
      return
    }

    if (currentUser.role === 'organiser' || currentUser.role === 'Verified Organizer') {
      onNavigate && onNavigate('profile')
      return
    }

    onNavigate && onNavigate('become-organizer')
  }

  const handleFeedbackTap = (idx) => {
    setIsFeedbackPaused(true)
    setActiveCardIndex(idx)
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current)
    }
    pauseTimeoutRef.current = setTimeout(() => {
      setIsFeedbackPaused(false)
      setActiveCardIndex(null)
      pauseTimeoutRef.current = null
    }, 5000)
  }

  // Filter lists based on real-time state machine transitions
  const liveMatches = useMemo(() => {
    return tournamentsList.filter(t => getTournamentLifecycleStatus(t, now) === 'live').slice(0, 10)
  }, [tournamentsList, now])

  const featuredTournaments = useMemo(() => {
    return tournamentsList.filter(t => getTournamentLifecycleStatus(t, now) !== 'live').slice(0, 10)
  }, [tournamentsList, now])


  const renderFeedbacksMarquee = (containerClassName) => (
    <div className={containerClassName}>
      <div className="relative w-full overflow-hidden py-1 hardware-clip">
        <div
          className="flex w-max animate-marquee gap-4 md:hover:[animation-play-state:paused]"
          style={{ animationPlayState: isFeedbackPaused ? 'paused' : undefined }}
        >
          {[
            { name: 'Alex "Viper" M.', role: 'Valorant Pro', text: 'Match District made finding and registering for scrims incredibly seamless. Best platform out against top teams!', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDv0OzxOfUaB2hXNkydMvdpH32DDlEKUu2Pq89__7Qiu1hDQmLZM4aJFJafuh6_tXDRx7vzxEOrZIuvMP2P6pUGiosCeAWuYgmllTAYTILpyJsA4x7xXqhu13_vzbSWkNr2YQKQURVO_nDKwVOMNTEEhQJSzFFjRavQjx-frgdFOzC2Fuh5UZmmprLmdGEYzBwp7EYc3U.9nxezA3uSIdCPJ7UF9FKK22phVmpeY3L5Q1FNLcMdKdRNVihao9JkQLQMnCQZe' },
            { name: 'Sarah "Blade" K.', role: 'BGMI Challenger', text: 'The automated bracket updates and instant prize payouts are a game changer for our squad.', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCxEta33zD9aumAA6Tfb0yViR_NkghqyXH4gkbA84UG0oUfc_r-2K2DU0hbk3uIOjz-7KOu15nxTFBSwPJgJchDvbfCnHkTz2A9ScGUk01EvpBTlStc9yQECzv4go13-hrNjqtkbKAVUaexkErixmi9HEeHJjLydGIR1rqmgs3vsGv_896zUnS1VZ9csKEsebeWfYJxQqAG7gYc3U.9nxezA3uSIdCPJ7UF9FKK22phVmpeY3L5Q1FNLcMdKdRNVihao9JkQLQMnCQZe' },
            { name: 'Marcus "NEXUS" T.', role: 'CS2 Team Captain', text: 'Flawless UI and zero lag during live tournament check-ins. Highly recommend to all organizers.', rating: '4.9', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCltRYtZXs0eQQftKxZWFJBxC2xlFdc31iqZEA9jk6XQrofgRuPyVnkDvGtIMHnaxR0yn_7Ye7w2_HalQDD-Wjbbxbq9CrNXdpFiwodqneUlHvHGA9yGUiGaQRlXXjeO0AICKCgmh_hncG9rbUrG2xA_ycy7mRFsN4mBHHRZKxK2MYoEaq6HC4HW07EYtZMdmPmYGFujQsin0AI4Vg6LdskpHk89NmzVdaHEbwPyUz3zkEzhNgRPxceYPuSAGRKHIjsyf64wDLrE8xR' },
            { name: 'Elena "Valkyrie" R.', role: 'Free Fire Solo', text: 'Real rewards and super active community feed. I play tournaments here every single weekend!', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBxmOU8QDiR3jOTE6CQPLiPaY0eWAFqdNb3Z9AK0ww0J2fXzWhIicLx7wRJ_iG6GzwQ1Eq7GxLoNyZn-vTy21lhY_1KXBSN7xZP1_-TxoQJ1NTrqpYGbCasCcXx7A3whlCs7ejSrdhmnEPs4RsrIubh1zTah01sumg_jqROq3QjmLek2hpakTlIf2Amc14aEYoD0K35FweZh7nLeV-y4446xC4QuuzWfEYyr3Z27gQawtyIJnLADhr_0E9rbSK2zP0cQT8t5Re_YZdU' },
            // Duplicated set for seamless infinite marquee loop
            { name: 'Alex "Viper" M.', role: 'Valorant Pro', text: 'Match District made finding and registering for scrims incredibly seamless. Best platform out against top teams!', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDv0OzxOfUaB2hXNkydMvdpH32DDlEKUu2Pq89__7Qiu1hDQmLZM4aJFJafuh6_tXDRx7vzxEOrZIuvMP2P6pUGiosCeAWuYgmllTAYTILpyJsA4x7xXqhu13_vzbSWkNr2YQKQURVO_nDKwVOMNTEEhQJSzFFjRavQjx-frgdFOzC2Fuh5UZmmprLmdGEYzBwp7EYc3U.9nxezA3uSIdCPJ7UF9FKK22phVmpeY3L5Q1FNLcMdKdRNVihao9JkQLQMnCQZe' },
            { name: 'Sarah "Blade" K.', role: 'BGMI Challenger', text: 'The automated bracket updates and instant prize payouts are a game changer for our squad.', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCxEta33zD9aumAA6Tfb0yViR_NkghqyXH4gkbA84UG0oUfc_r-2K2DU0hbk3uIOjz-7KOu15nxTFBSwPJgJchDvbfCnHkTz2A9ScGUk01EvpBTlStc9yQECzv4go13-hrNjqtkbKAVUaexkErixmi9HEeHJjLydGIR1rqmgs3vsGv_896zUnS1VZ9csKEsebeWfYJxQqAG7gYc3U.9nxezA3uSIdCPJ7UF9FKK22phVmpeY3L5Q1FNLcMdKdRNVihao9JkQLQMnCQZe' },
            { name: 'Marcus "NEXUS" T.', role: 'CS2 Team Captain', text: 'Flawless UI and zero lag during live tournament check-ins. Highly recommend to all organizers.', rating: '4.9', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCltRYtZXs0eQQftKxZWFJBxC2xlFdc31iqZEA9jk6XQrofgRuPyVnkDvGtIMHnaxR0yn_7Ye7w2_HalQDD-Wjbbxbq9CrNXdpFiwodqneUlHvHGA9yGUiGaQRlXXjeO0AICKCgmh_hncG9rbUrG2xA_ycy7mRFsN4mBHHRZKxK2MYoEaq6HC4HW07EYtZMdmPmYGFujQsin0AI4Vg6LdskpHk89NmzVdaHEbwPyUz3zkEzhNgRPxceYPuSAGRKHIjsyf64wDLrE8xR' },
            { name: 'Elena "Valkyrie" R.', role: 'Free Fire Solo', text: 'Real rewards and super active community feed. I play tournaments here every single weekend!', rating: '5.0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBxmOU8QDiR3jOTE6CQPLiPaY0eWAFqdNb3Z9AK0ww0J2fXzWhIicLx7wRJ_iG6GzwQ1Eq7GxLoNyZn-vTy21lhY_1KXBSN7xZP1_-TxoQJ1NTrqpYGbCasCcXx7A3whlCs7ejSrdhmnEPs4RsrIubh1zTah01sumg_jqROq3QjmLek2hpakTlIf2Amc14aEYoD0K35FweZh7nLeV-y4446xC4QuuzWfEYyr3Z27gQawtyIJnLADhr_0E9rbSK2zP0cQT8t5Re_YZdU' },
          ].map((fb, idx) => (
            <div
              key={idx}
              onClick={() => handleFeedbackTap(idx)}
              className={`testimonial-card p-4 sm:p-5 rounded-2xl w-[280px] sm:w-[320px] flex-shrink-0 flex flex-col justify-between space-y-3 border transition-all duration-300 cursor-pointer ${activeCardIndex === idx ? 'border-primary/80' : 'border-outline-variant/20 hover:border-primary/40'}`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="material-symbols-outlined text-[14px]" data-icon="star" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                  <span className="font-body-sm text-xs text-on-surface-variant ml-1">{fb.rating}</span>
                </div>
                <p className="font-body-md text-xs sm:text-sm text-on-surface-variant italic leading-relaxed">"{fb.text}"</p>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-outline-variant/20">
                <img alt={fb.name} className="w-9 h-9 rounded-full object-cover border border-primary/30" src={fb.img} />
                <div>
                  <h4 className="font-headline-md text-xs sm:text-sm text-white">{fb.name}</h4>
                  <p className="font-label-caps text-[10px] text-primary">{fb.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <HeroBannerCarousel onNavigate={onNavigate} />
      <main className="w-full">
        {/* Main Content Area */}
        <section className="max-w-container-max mx-auto px-4 sm:px-sm md:px-lg py-8 sm:py-10 md:py-12 grid grid-cols-12 gap-4 sm:gap-5 md:gap-6 overflow-visible">
          {/* Left 8 Columns */}
          <div className="col-span-12 lg:col-span-8 flex flex-col justify-between space-y-4 sm:space-y-6 md:space-y-8 overflow-visible">
            <div className="space-y-4 sm:space-y-6 md:space-y-8 overflow-visible">
              {/* Featured Tournaments */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4 overflow-visible"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl uppercase flex items-center gap-2 sm:gap-2.5 font-bold text-white tracking-tight">
                    <span className="w-1 h-5 sm:h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.5)]"></span>
Tournaments
                  </h2>
                  <button onClick={() => onNavigate && onNavigate('tournaments')} className="text-primary font-label-caps text-xs hover:underline flex items-center gap-1 font-bold">View All <span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                </div>
                <div className="pt-1 overflow-visible">
                  {featuredTournaments.length === 0 ? (
                    <div className="glass-card p-8 sm:p-10 text-center rounded-2xl border border-outline-variant/30 space-y-3 w-full max-w-2xl mx-auto my-4 shadow-xl bg-surface-container-low/40 backdrop-blur-md animate-in fade-in duration-300">
                      <span className="material-symbols-outlined text-4xl text-primary animate-pulse" data-icon="stadium">stadium</span>
                      <h3 className="font-display-lg text-xl sm:text-2xl font-bold text-white tracking-tight">No Active Tournaments</h3>
                      <p className="font-body-md text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
                        Tournaments can only be hosted by verified organizers who have registered and been approved. Are you an esports organization?
                      </p>
                      <button onClick={() => onNavigate && onNavigate('become-organizer')} className="px-5 py-2.5 sm:px-6 sm:py-3 bg-primary hover:bg-primary/95 text-white rounded-xl font-headline-md text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(192,193,255,0.4)] transition-all">
                        Apply to Become an Organizer
                      </button>
                    </div>
                  ) : (
                    <div className="-mx-4 sm:-mx-sm md:-mx-lg" style={{ overflowY: 'visible' }}>
                      {/* ── SCROLL VIEWPORT: width anchored to 100%, scrolls horizontally ── */}
                      <div
                        className="pb-8 pt-4 scrollbar-hide scroll-pl-1 md:scroll-pl-2 !touch-auto"
                        style={{
                          overflowX: 'auto',
                          overflowY: 'visible',
                          WebkitOverflowScrolling: 'touch',
                          touchAction: 'pan-x pan-y',
                          width: '100%',
                        }}
                      >
                        {/* ── INNER TRACK: expands to true max-content ── */}
                        <div
                          className="flex flex-row gap-4 sm:gap-6 snap-x snap-mandatory pl-4 sm:pl-sm md:pl-lg"
                          style={{ width: 'max-content' }}
                        >
                          {featuredTournaments.map((t, idx) => (
                            <div
                              key={t.id}
                              className="snap-start first:ml-3"
                              style={{ flexShrink: 0, minWidth: '150px' }}
                            >
                              <TournamentCard
                                id={t.id}
                                title={t.title}
                                game={t.game}
                                status={t.status}
                                badgeTextColor="text-white"
                                imgSrc={t.cover_image_url || t.bannerUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80"}
                                imgAlt={t.title}
                                prizePool={t.prize}
                                entryFee={t.entry}
                                matchType={t.match_type || t.matchType || 'Squad'}
                                perspective={t.perspective || 'TPP'}
                                slotsTotal={t.slotsTotal}
                                slotsFilled={t.slotsFilled}
                                entryFeeAmount={t.entry_fee_amount}
                                orgName={t.orgName || "Match District Organizer"}
                                orgTier={['pro', 'elite', 'basic'].includes((t.orgTier || '').toLowerCase()) ? t.orgTier : 'Pro'}
                                onNavigate={onNavigate}
                                hasSponsors={t.hasApprovedSponsors || false}
                                registrationOpenDate={t.registrationOpenDate}
                                registrationCloseDate={t.registrationCloseDate}
                                startDate={t.startDate}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
              {/* Supported Games Grid */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4"
              >
                <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl uppercase flex items-center gap-2 sm:gap-2.5 font-bold text-white tracking-tight">
                  <span className="w-1 h-5 sm:h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.5)]"></span>
                  Supported Games
                </h2>
                 <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                    <motion.div whileHover={{ y: -3 }} className="glass-card no-transition p-2 sm:p-2.5 rounded-xl text-center space-y-1 hover:border-primary/40 transition-colors cursor-pointer group bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/20 shadow-md">
                       <div className="max-md:aspect-square max-md:h-auto md:h-40 rounded-lg overflow-hidden mb-3 bg-surface-container-highest">
                         <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="BGMI" src={gameBgmi} />
                       </div>
                      <div className="font-label-caps text-[10px] sm:text-xs text-white font-bold tracking-wider">BGMI</div>
                      <div className="font-body-sm text-[9px] sm:text-[10px] text-on-surface-variant/80">8.7K Tourneys</div>
                    </motion.div>
                    <motion.div className="glass-card no-transition p-2 sm:p-2.5 rounded-xl text-center space-y-1 bg-surface-container-low/10 border border-dashed border-outline-variant/20 shadow-md">
                        <div className="max-md:aspect-square max-md:h-auto md:h-40 rounded-lg overflow-hidden mb-3 bg-surface-container-highest">
                          <img className="w-full h-full object-cover opacity-40" alt="Free Fire" src={gameFreeFire} />
                        </div>
                       <div className="font-label-caps text-[10px] sm:text-xs text-on-surface-variant font-bold tracking-wider">COMING SOON</div>
                     </motion.div>
                     <motion.div className="glass-card no-transition p-2 sm:p-2.5 rounded-xl text-center space-y-1 bg-surface-container-low/10 border border-dashed border-outline-variant/20 shadow-md">
                        <div className="max-md:aspect-square max-md:h-auto md:h-40 rounded-lg overflow-hidden mb-3 bg-surface-container-highest">
                          <img className="w-full h-full object-cover opacity-40" alt="COD Mobile" src={gameCodm} />
                        </div>
                       <div className="font-label-caps text-[10px] sm:text-xs text-on-surface-variant font-bold tracking-wider">COMING SOON</div>
                     </motion.div>
                     <motion.div className="glass-card no-transition p-2 sm:p-2.5 rounded-xl text-center space-y-1 bg-surface-container-low/10 border border-dashed border-outline-variant/20 shadow-md">
                        <div className="max-md:aspect-square max-md:h-auto md:h-40 rounded-lg overflow-hidden mb-3 bg-surface-container-highest">
                          <img className="w-full h-full object-cover opacity-40" alt="Valorant" src={gameValorant} />
                        </div>
                       <div className="font-label-caps text-[10px] sm:text-xs text-on-surface-variant font-bold tracking-wider">COMING SOON</div>
                     </motion.div>
                     <motion.div className="glass-card no-transition p-2 sm:p-2.5 rounded-xl text-center space-y-1 bg-surface-container-low/10 border border-dashed border-outline-variant/20 shadow-md">
                        <div className="max-md:aspect-square max-md:h-auto md:h-40 rounded-lg overflow-hidden mb-3 bg-surface-container-highest">
                          <img className="w-full h-full object-cover opacity-40" alt="Free Fire" src={gameFreeFire} />
                        </div>
                       <div className="font-label-caps text-[10px] sm:text-xs text-on-surface-variant font-bold tracking-wider">COMING SOON</div>
                     </motion.div>
                  </div>
               </motion.div>
               {/* Player Feedbacks Marquee (Desktop View) */}
               {renderFeedbacksMarquee("hidden lg:block overflow-hidden pt-1 hardware-clip")}
             </div>
          </div>
          {/* Right 4 Columns (Sidebar) */}
          <div className="col-span-12 lg:col-span-4 flex flex-col justify-between space-y-6 sm:space-y-8 md:space-y-10">
            <div className="space-y-6 sm:space-y-8 md:space-y-10">
              {/* Live Matches */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-headline-md text-base sm:text-lg uppercase flex items-center gap-1 font-bold text-on-background tracking-tight">
                    <span className="material-symbols-outlined text-[#ff0000] text-lg dark:filter dark:drop-shadow-[0_0_8px_rgba(255,0,0,0.5)]" data-icon="sensors">sensors</span>
                    Live Matches
                  </h2>
                  <button onClick={() => onNavigate && onNavigate('tournaments')}
                    className="group flex items-center gap-1 text-primary font-label-caps text-xs font-bold hover:text-primary/80 transition-colors">
                    <span>View All</span>
                    <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform" data-icon="arrow_forward">arrow_forward</span>
                  </button>
                </div>
                {liveMatches.length === 0 ? (
                  <div className="glass-card p-6 sm:p-8 text-center rounded-2xl border border-outline-variant/20 space-y-2.5 bg-surface-container-low/40 backdrop-blur-md shadow-sm">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant animate-pulse" data-icon="sensors">sensors</span>
                    <h3 className="font-headline-md text-sm sm:text-base text-on-background font-bold">No Live Matches Currently in Progress</h3>
                    <p className="font-body-sm text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">
                      Tournaments scheduled by verified organizers will automatically appear here once their start time begins.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-hide !touch-auto" style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}>
                    {liveMatches.map((match, idx) => {
                      const modeLabel = [match.match_type === 'solo' ? 'Solo' : match.match_type === 'duo' ? 'Duo' : 'Squad', match.perspective === 'fpp' ? 'FPP' : 'TPP'].filter(Boolean).join(' • ')
                      return (
                        <motion.div
                          key={idx}
                          onClick={() => onNavigate && onNavigate('tournament-detail', match.id)}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          whileHover={{ y: -2, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className="p-2.5 sm:p-3 rounded-xl flex gap-3 items-center border border-outline-variant/30 shadow-md bg-surface-container-low/60 group hover:bg-surface-container-low hover:border-outline-variant/60 cursor-pointer w-fit shrink-0"
                        >
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 bg-surface-container-high shadow-inner">
                            {(() => {
                              const gameKey = (match.game || '').toLowerCase()
                              const gameIcon = GAME_ICON_MAP[gameKey]
                              return gameIcon ? (
                                <img alt={match.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={gameIcon} />
                              ) : (
                                <img alt={match.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={match.bannerUrl || match.cover_image_url || "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80"} />
                              )
                            })()}
                          </div>

                          <div className="flex flex-col justify-center flex-grow min-w-0 py-0.5 gap-1">
                            <h3 className="text-sm sm:text-base font-bold text-on-background leading-snug line-clamp-2">
                              {match.title}
                            </h3>

                            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-on-surface-variant/80">
                              <span className="truncate max-w-[120px] sm:max-w-[150px]">{match.orgName || 'Match District Organizer'}</span>
                              <VerificationBadge tier={['pro', 'elite', 'basic'].includes((match.orgTier || '').toLowerCase()) ? match.orgTier : 'Pro'} size="sm" />
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-medium">Prize:</span>
                              <span className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">{formatINR(match.prize || match.prizePool)}</span>
                              {(match.hasApprovedSponsors || match.totalSponsorContributions > 0) && <SponsoredStar size={12} />}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse uppercase tracking-wider">
                                LIVE MATCH
                              </span>
                              <span className="text-[10px] text-on-surface-variant/50 font-medium uppercase tracking-wider">
                                {modeLabel}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
              {/* Player Feedbacks Marquee (Mobile View) */}
              {renderFeedbacksMarquee("block lg:hidden overflow-hidden pt-1 hardware-clip")}

              {/* Top Organizations Showcase */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4"
              >
                <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2.5">
                  <h2 className="font-headline-md text-base sm:text-lg uppercase flex items-center gap-1.5 font-bold text-on-background tracking-tight">
                    <span className="material-symbols-outlined text-[#ff0000] text-lg dark:filter dark:drop-shadow-[0_0_8px_rgba(255,0,0,0.5)]" data-icon="military_tech">military_tech</span>
                    Top Organizations
                  </h2>
                  <button
                    onClick={() => onNavigate && onNavigate('explore-organisers')}
                    className="group flex items-center gap-1 text-primary font-label-caps text-xs font-bold hover:text-primary/80 transition-colors"
                  >
                    <span>View All</span>
                    <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform" data-icon="arrow_forward">arrow_forward</span>
                  </button>
                </div>
                {/* Horizontal snap carousel on mobile, 2-col grid on desktop */}
                <div className="flex md:grid md:grid-cols-2 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory no-scrollbar pb-2 md:pb-0 -mx-3 px-3 sm:-mx-4 sm:px-4 !touch-auto" style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}>
                  {organisersList.length > 0 ? (
                    organisersList.slice(0, 4).map((org, idx) => {
                      const formatFollowersLocal = (n) => {
                        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
                        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
                        return String(n);
                      };
                      return (
                        <motion.div
                          key={org.id || idx}
                          onClick={() => onNavigate && onNavigate('explore-organisers')}
                          whileHover={{ y: -3, scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="relative w-[162px] sm:w-[185px] md:w-full flex-shrink-0 snap-start flex flex-col rounded-xl overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-[0_6px_24px_rgba(90,93,250,0.12)] bg-surface-container-low border border-outline-variant"
                        >
                          {/* Rank badge */}
                          <div className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${
                            idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]' :
                            idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900' :
                            idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                            'bg-surface-container-highest text-on-surface-variant border border-outline-variant'
                          }`}>#{idx + 1}</div>

                          {/* Top neon line */}
                          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 group-hover:via-primary/80 to-transparent transition-all duration-500" />

                          <div className="p-3 pt-8">
                            {/* Logo */}
                            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg overflow-hidden mx-auto mb-2 border border-outline-variant bg-surface-container-high group-hover:border-primary/30 transition-colors">
                              {org.orgImage || org.avatar ? (
                                <img alt={org.orgName || org.name} className="avatar-img group-hover:scale-105 transition-transform duration-300" src={org.orgImage || org.avatar} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-surface-container"><span className="material-symbols-outlined text-on-surface-variant text-base">business</span></div>
                              )}
                            </div>
                            <h3 className="font-headline-md text-xs sm:text-sm text-on-background font-bold tracking-tight group-hover:text-primary transition-colors text-center truncate flex items-center justify-center gap-1">
                              <span>{org.orgName || org.name}</span>
                              <VerificationBadge tier={org.tier} size="sm" />
                            </h3>
                            <p className="text-[9px] sm:text-[10px] text-on-surface-variant/60 font-label-caps tracking-wider text-center truncate mt-0.5">{org.orgHandle || org.gamerTag}</p>

                            {/* Stats */}
                            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-2 mb-3 px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant/50 text-[10px] sm:text-[11px]">
                              <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px] text-primary/70">group</span>
                                <span className="font-semibold text-on-background">{formatFollowersLocal(org.followers || 0)}</span>
                              </div>
                              <span className="text-on-surface-variant/30">â€¢</span>
                              <div className="flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[11px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <span className="font-semibold text-on-background">{org.rating || '4.5'}</span>
                              </div>
                            </div>

                            <button className="w-full py-1.5 px-3 rounded-full font-label-caps text-[10px] sm:text-[11px] font-bold tracking-wider border border-primary/30 text-primary bg-primary/5 group-hover:bg-primary group-hover:text-white group-hover:border-primary group-hover:shadow-[0_0_10px_rgba(90,93,250,0.3)] transition-all duration-300">
                              VIEW PROFILE
                            </button>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 w-full text-center py-8 text-xs text-on-surface-variant/50">
                      No organizers registered yet.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </section>
        {/* Platform Values */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-container-max mx-auto px-3 sm:px-sm md:px-lg py-6 sm:py-8 md:py-12 overflow-hidden"
        >
          {/* Desktop View: Grid */}
          <div className="hidden md:grid md:grid-cols-4 gap-6 lg:gap-8">
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm border border-outline-variant/20 shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="shield">shield</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">FAIR PLAY</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Advanced anti-cheat &amp; secure tournament system.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm border border-outline-variant/20 shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="bolt">bolt</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">EASY TO USE</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Simple registration &amp; smooth platform experience.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm border border-outline-variant/20 shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="redeem">redeem</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">REAL REWARDS</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Huge prize pools &amp; exciting rewards for winners.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm border border-outline-variant/20 shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="verified_user">verified_user</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">TRUSTED</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Verified organizers &amp; transparent match reporting.</p>
              </div>
            </div>
          </div>

          {/* Mobile View: Continuous Marquee Loop */}
          <div className="md:hidden w-full overflow-hidden py-1">
            <div className="flex w-max animate-marquee">
              {/* Set 1 */}
              <div className="flex items-center gap-4 pr-4 shrink-0">
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="shield">shield</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">FAIR PLAY</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Advanced anti-cheat &amp; secure tournament system.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="bolt">bolt</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">EASY TO USE</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Simple registration &amp; smooth platform experience.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="redeem">redeem</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">REAL REWARDS</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Huge prize pools &amp; exciting rewards for winners.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="verified_user">verified_user</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">TRUSTED</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Verified organizers &amp; transparent match reporting.</p>
                  </div>
                </div>
              </div>

              {/* Set 2 (Duplicated for seamless loop) */}
              <div className="flex items-center gap-4 pr-4 shrink-0">
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="shield">shield</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">FAIR PLAY</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Advanced anti-cheat &amp; secure tournament system.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="bolt">bolt</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">EASY TO USE</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Simple registration &amp; smooth platform experience.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="redeem">redeem</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">REAL REWARDS</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Huge prize pools &amp; exciting rewards for winners.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] border border-outline-variant/20 shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="verified_user">verified_user</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">TRUSTED</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Verified organizers &amp; transparent match reporting.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Organizer showcase */}
        <section id="organizer-showcase">
          <OrganizerShowcase onBecomeOrganizer={handleBecomeOrganizer} />
        </section>
      </main>

      {/* Footer Area */}
      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant py-6 px-4 mt-20">
        <div className="w-full max-w-container-max mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-5 border-b border-outline-variant/20 pb-4">
            <button onClick={() => onNavigate && onNavigate('terms-service')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Terms</button>
            <button onClick={() => onNavigate && onNavigate('privacy-policy')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Privacy</button>
            <button onClick={() => onNavigate && onNavigate('help-support')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Support</button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <button onClick={() => onNavigate && onNavigate('home')} className="font-headline-md text-[16px] font-extrabold text-primary tracking-tight hover:opacity-85 transition-opacity">
               Match District
            </button>
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">&copy; {new Date().getFullYear()} MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </>
  )
}

export default Homepage
