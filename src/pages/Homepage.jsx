import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import HeroBannerCarousel from '../components/HeroBannerCarousel'
import { useUser } from '../UserContext.jsx'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { supabase } from '../utils/supabaseClient'
import OrganizerShowcase from '../components/OrganizerShowcase'
import TournamentCard from '../components/TournamentCard'
import { hasOrganizerRights, isSystemAdmin } from '../utils/iamRoles.js'
import { DEFAULT_AVATAR, DEFAULT_BANNER } from '../utils/defaults.js'
import sponsorAsus from '../assets/sponsors/sponsor_asus.png'
import sponsorLenovo from '../assets/sponsors/sponsor_lenovo.png'
import sponsorNvidia from '../assets/sponsors/sponsor_nvidia.png'
import sponsorValorant from '../assets/sponsors/sponsor_valorant.png'
import SupportedGames from '../components/SupportedGames'
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle'


function Homepage({ onNavigate }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isFeedbackPaused, setIsFeedbackPaused] = useState(false)
  const { currentUser, signOut } = useUser()
  const [tournamentsList, setTournamentsList] = useState([])
  const [now, setNow] = useState(new Date())
  const pauseTimeoutRef = useRef(null)

  // Gentle clock tick — 60s is enough for lifecycle transitions; Realtime handles data changes
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const loadTournaments = useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments')
    if (ok && data?.success && data.tournaments) {
      const filtered = data.tournaments.filter(t => !t.isDraft)
      setTournamentsList(filtered)
    }
  }, [])

  useEffect(() => {
    loadTournaments()
  }, [loadTournaments])

  useRefetchOnFocus(loadTournaments)

  useEffect(() => {
    loadTournaments()

    const channel = supabase
      .channel('homepage-tournaments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        () => { loadTournaments() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadTournaments])

  const handleSignOut = async () => {
    await signOut()
  }

  const handleBecomeOrganizer = () => {
    if (!currentUser) {
      onNavigate && onNavigate('login')
      return
    }

    if (isSystemAdmin(currentUser)) {
      onNavigate && onNavigate('admin')
      return
    }

    if (hasOrganizerRights(currentUser)) {
      onNavigate && onNavigate('org-management')
      return
    }

    onNavigate && onNavigate('become-organizer')
  }

  // Filter lists based on real-time state machine transitions
  const liveMatches = useMemo(() => {
    return tournamentsList.filter(t => getTournamentLifecycleStatus(t, now) === 'live').slice(0, 10)
  }, [tournamentsList, now])

  const getPopularityScore = useCallback((t) => {
    const prize = parseInt(String(t.prize_pool_amount || t.totalPrize || '').replace(/[^0-9]/g, ''), 10) || 0
    const slotsTotal = parseInt(t.slotsTotal, 10) || 1
    const slotsFilled = parseInt(t.slotsFilled, 10) || 0
    const fillRate = slotsFilled / slotsTotal
    const isFeatured = t.featured ? 1 : 0
    const hasSponsors = (t.hasApprovedSponsors || t.sponsors_enabled) ? 1 : 0
    const orgTier = (t.orgTier || '').toLowerCase()
    const isTopOrg = orgTier === 'pro' || orgTier === 'elite' ? 1 : 0
    return prize * 0.4 + fillRate * 30 + isFeatured * 25 + hasSponsors * 15 + isTopOrg * 10
  }, [])

  const plazaTournaments = useMemo(() => {
    return tournamentsList.filter(t => {
      const s = getTournamentLifecycleStatus(t, now)
      return s === 'upcoming' || s === 'open' || s === 'closed'
    }).sort((a, b) => getPopularityScore(b) - getPopularityScore(a)).slice(0, 10)
  }, [tournamentsList, now, getPopularityScore])


  const renderFeedbacksMarquee = (containerClassName) => {
    const testimonials = [
      { id: 'USR-rohit-bgmi', name: 'Rohit', role: 'BGMI Squad Leader', text: 'We found our regular scrims squad through Match District. The registration flow is smooth and room credentials always arrive on time.', rating: '4.8' },
      { id: 'USR-aman-valorant', name: 'Aman Kumar', role: 'Valorant Player', text: 'Clean UI, no hidden fees, and real prize pools. I have been playing here every weekend since the platform launched.', rating: '5.0' },
      { id: 'USR-hemant-ff', name: 'Hemant Kumar', role: 'Free Fire Organizer', text: 'Running tournaments was a headache before this. Match District handles registrations, slots, and payments — I just focus on the game.', rating: '4.9' },
      { id: 'USR-ravi-codm', name: 'Ravi Srivastava', role: 'COD Mobile Player', text: 'Finally a platform that actually pays out on time. Won ₹2,500 last month and it was in my account the same day.', rating: '5.0' },
    ]

    const handleTestimonialClick = (testimonial) => {
      onNavigate && onNavigate('profile', { id: testimonial.id, name: testimonial.name, role: 'gamer' })
    }

    return (
    <div className={containerClassName}>
      <div className="relative w-full overflow-hidden py-4 hardware-clip">
        <div
          className="flex w-max animate-marquee gap-4 md:hover:[animation-play-state:paused]"
          style={{ animationPlayState: isFeedbackPaused ? 'paused' : undefined }}
        >
          {[...testimonials, ...testimonials].map((fb, idx) => (
            <div
              key={idx}
              onClick={() => handleTestimonialClick(fb)}
              className="testimonial-card p-4 sm:p-5 rounded-2xl w-[280px] sm:w-[320px] flex-shrink-0 flex flex-col justify-between space-y-3 transition-all duration-300 cursor-pointer bg-surface-container-low/60 hover:bg-surface-container-low/80"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="material-symbols-outlined text-[14px]" data-icon="star" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                  <span className="font-body-sm text-xs text-on-surface-variant ml-1">{fb.rating}</span>
                </div>
                <p className="font-body-md text-xs sm:text-sm text-on-surface-variant italic leading-relaxed">"{fb.text}"</p>
                              <img alt={fb.name} className="w-9 h-9 rounded-full object-cover border border-primary/30" src={DEFAULT_AVATAR} />
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
  }

  return (
    <>
      <HeroBannerCarousel onNavigate={onNavigate} />
      <main className="w-full">
        {/* Main Content Area */}
        <section className="max-w-container-max mx-auto px-4 sm:px-sm md:px-lg py-8 sm:py-10 md:py-12 grid grid-cols-12 gap-4 sm:gap-5 md:gap-6 overflow-visible">
          {/* Left 8 Columns */}
          <div className="col-span-12 lg:col-span-8 flex flex-col justify-between space-y-4 sm:space-y-6 md:space-y-8 overflow-visible">
            <div className="space-y-4 sm:space-y-6 md:space-y-8 overflow-visible">
              {/* Tournament Plaza */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4 overflow-visible"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-headline-lg text-base sm:text-xl md:text-2xl flex items-center gap-2 sm:gap-2.5 font-bold text-white tracking-tight">
                    <span className="w-1 h-5 sm:h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.5)]"></span>
                    Tournament Plaza
                  </h2>
                  <button onClick={() => onNavigate && onNavigate('tournaments')} className="text-primary font-label-caps text-xs hover:underline flex items-center gap-1 font-bold">View All <span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                </div>
                <div className="pt-1 overflow-visible">
                  {plazaTournaments.length === 0 ? (
                    <div className="glass-card p-8 sm:p-10 text-center rounded-2xl space-y-3 w-full max-w-2xl mx-auto my-4 shadow-xl bg-surface-container-low/40 backdrop-blur-md animate-in fade-in duration-300">
                      <span className="material-symbols-outlined text-4xl text-primary animate-pulse" data-icon="stadium">stadium</span>
                      <h3 className="font-display-lg text-xl sm:text-2xl font-bold text-white tracking-tight">No Tournaments Available</h3>
                      <p className="font-body-md text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
                        No upcoming, registration-open, or registration-closed tournaments right now. Check back later or browse the archive for past events.
                      </p>
                    </div>
                  ) : (
                    <div className="-mx-4 sm:-mx-sm md:-mx-lg" style={{ overflowY: 'visible' }}>
                      <div
                        className="pb-8 pt-4 scrollbar-hide scroll-pl-1 md:scroll-pl-2 !touch-auto"
                        style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', width: '100%' }}
                      >
                        <div className="flex flex-row gap-4 sm:gap-6 snap-x snap-mandatory pl-4 sm:pl-sm md:pl-lg" style={{ width: 'max-content' }}>
                          {plazaTournaments.map((t) => (
                            <div key={t.id} className="snap-start first:ml-3" style={{ flexShrink: 0, minWidth: '150px' }}>
                              <TournamentCard
                                id={t.id} title={t.title} game={t.game} status={t.status}
                                badgeTextColor="text-white"
                                imgSrc={t.cover_image_url || t.bannerUrl || DEFAULT_BANNER}
                                imgAlt={t.title} prizePool={t.prize} entryFee={t.entry}
                                matchType={t.match_type || t.matchType || 'Squad'} perspective={t.perspective || 'TPP'}
                                slotsTotal={t.slotsTotal} slotsFilled={t.slotsFilled} entryFeeAmount={t.entry_fee_amount}
                                orgName={t.orgName || "Match District Organizer"}
                                orgTier={['pro', 'elite', 'basic'].includes((t.orgTier || '').toLowerCase()) ? t.orgTier : 'Pro'}
                                onNavigate={onNavigate} hasSponsors={t.hasApprovedSponsors || false}
                                registrationOpenDate={t.registrationOpenDate} registrationCloseDate={t.registrationCloseDate} startDate={t.startDate}
                                cardColor={t.card_color || t.cardColor || t.theme || 'white'}
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
              <SupportedGames />

              {/* Player Feedbacks Marquee (Desktop View) */}
              {renderFeedbacksMarquee("hidden lg:block overflow-hidden pt-1 hardware-clip")}

              {/* Live Matches */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="space-y-3 sm:space-y-4"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-headline-md text-base sm:text-lg flex items-center gap-1 font-bold text-on-background tracking-tight">
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
                  <div className="glass-card p-6 sm:p-8 text-center rounded-2xl space-y-2.5 bg-surface-container-low/40 backdrop-blur-md shadow-sm">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant animate-pulse" data-icon="sensors">sensors</span>
                    <h3 className="font-headline-md text-sm sm:text-base text-on-background font-bold">No Live Matches Currently in Progress</h3>
                    <p className="font-body-sm text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">
                      Tournaments scheduled by verified organizers will automatically appear here once their start time begins.
                    </p>
                  </div>
                ) : (
                  <div className="-mx-4 sm:-mx-sm md:-mx-lg" style={{ overflowY: 'visible' }}>
                    <div
                      className="pb-8 pt-4 scrollbar-hide scroll-pl-1 md:scroll-pl-2 !touch-auto"
                      style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', width: '100%' }}
                    >
                      <div className="flex flex-row gap-4 sm:gap-6 snap-x snap-mandatory pl-4 sm:pl-sm md:pl-lg" style={{ width: 'max-content' }}>
                        {liveMatches.map((match) => (
                          <div key={match.id} className="snap-start first:ml-3" style={{ flexShrink: 0, minWidth: '150px' }}>
                            <TournamentCard
                              id={match.id}
                              title={match.title}
                              game={match.game}
                              status={match.status}
                              badgeTextColor="text-white"
                              imgSrc={match.cover_image_url || match.bannerUrl || DEFAULT_BANNER}
                              imgAlt={match.title}
                              prizePool={match.prize}
                              entryFee={match.entry}
                              matchType={match.match_type || match.matchType || 'Squad'}
                              perspective={match.perspective || 'TPP'}
                              slotsTotal={match.slotsTotal}
                              slotsFilled={match.slotsFilled}
                              entryFeeAmount={match.entry_fee_amount}
                              orgName={match.orgName || 'Match District Organizer'}
                              orgTier={['pro', 'elite', 'basic'].includes((match.orgTier || '').toLowerCase()) ? match.orgTier : 'Pro'}
                              onNavigate={onNavigate}
                              hasSponsors={match.hasApprovedSponsors || false}
                              registrationOpenDate={match.registrationOpenDate}
                              registrationCloseDate={match.registrationCloseDate}
                              startDate={match.startDate}
                              cardColor={match.card_color || match.cardColor || match.theme || 'white'}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
              {/* Player Feedbacks Marquee (Mobile View) */}
              {renderFeedbacksMarquee("block lg:hidden overflow-hidden pt-1 hardware-clip")}
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
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="shield">shield</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">FAIR PLAY</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Advanced anti-cheat &amp; secure tournament system.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="bolt">bolt</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">EASY TO USE</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Simple registration &amp; smooth platform experience.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm shadow-sm">
              <div className="p-2.5 lg:p-3 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20 shadow-inner">
                <span className="material-symbols-outlined text-2xl lg:text-3xl" data-icon="redeem">redeem</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline-md text-sm lg:text-base text-white font-bold tracking-tight">REAL REWARDS</h4>
                <p className="font-body-sm text-xs text-on-surface-variant/80 leading-relaxed">Huge prize pools &amp; exciting rewards for winners.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 lg:gap-4 glass-card p-5 lg:p-6 rounded-2xl bg-surface-container-low/20 backdrop-blur-sm shadow-sm">
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
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="shield">shield</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">FAIR PLAY</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Advanced anti-cheat &amp; secure tournament system.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="bolt">bolt</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">EASY TO USE</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Simple registration &amp; smooth platform experience.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="redeem">redeem</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">REAL REWARDS</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Huge prize pools &amp; exciting rewards for winners.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
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
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="shield">shield</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">FAIR PLAY</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Advanced anti-cheat &amp; secure tournament system.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="bolt">bolt</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">EASY TO USE</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Simple registration &amp; smooth platform experience.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
                  <div className="p-1.5 sm:p-2 bg-surface-container-high rounded-xl text-primary flex-shrink-0 border border-primary/20">
                    <span className="material-symbols-outlined text-xl sm:text-2xl" data-icon="redeem">redeem</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs sm:text-sm text-white font-bold tracking-tight">REAL REWARDS</h4>
                    <p className="font-body-sm text-[10px] sm:text-[12px] text-on-surface-variant/80 leading-tight">Huge prize pools &amp; exciting rewards for winners.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 glass-card p-3 sm:p-3.5 rounded-xl sm:rounded-2xl min-w-[240px] sm:min-w-[260px] shadow-md bg-surface-container-low/40 backdrop-blur-md">
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
          <OrganizerShowcase onNavigate={onNavigate} />
        </section>
      </main>

      {/* Footer Area */}
      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant py-6 px-4 mt-20">
        <div className="w-full max-w-container-max mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-5 border-b border-outline-variant/20 pb-4">
            <button onClick={() => onNavigate && onNavigate('terms-service')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Terms</button>
            <button onClick={() => onNavigate && onNavigate('privacy-policy')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Privacy</button>
            <button onClick={() => onNavigate && onNavigate('archive')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Archive</button>
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
