import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { supabase } from '../utils/supabaseClient'
import TournamentCard from '../components/TournamentCard'
import VerificationBadge from '../components/VerificationBadge'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle'

const STATUS_OPTIONS = ['All', 'Registrations Open', 'Upcoming', 'Live']
const GAME_OPTIONS = ['All Games', 'BGMI']
const ENTRY_OPTIONS = ['All', 'Free', 'Paid']

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'

const formatINR = (val) => {
  const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? (val || 'TBA') : `\u20B9${n.toLocaleString('en-IN')}`
}

const GAME_ICON_MAP = {
  bgmi: gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant,
}

function Tournaments({ onNavigate }) {
  const [dbTournaments, setDbTournaments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [gameFilter, setGameFilter] = useState('All Games');
  const [entryTypeFilter, setEntryTypeFilter] = useState('All');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [now, setNow] = useState(new Date())

  // Real-time observer tick pipeline
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const loadTournaments = React.useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments')
    if (ok && data?.success && data.tournaments) {
      setDbTournaments(data.tournaments)
    }
    setIsLoading(false)
  }, [])

  useRefetchOnFocus(loadTournaments)

  useEffect(() => {
    setIsLoading(true)
    loadTournaments()

    const channel = supabase
      .channel('tournaments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        (payload) => {
          console.log('Realtime update received for tournaments:', payload);
          if (payload.eventType === 'INSERT') {
            setDbTournaments((prev) => {
              if (prev.some((t) => t.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setDbTournaments((prev) =>
              prev.map((t) => (t.id === payload.new.id ? payload.new : t))
            );
          } else if (payload.eventType === 'DELETE') {
            setDbTournaments((prev) =>
              prev.filter((t) => t.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTournaments]);

  const tournaments = useMemo(() => {
    const processedDb = dbTournaments
      .filter(t => !t.isDraft)
      .map(t => ({
        id: t.id,
        title: t.title,
        game: t.game,
        status: t.status || 'upcoming',
        startDate: t.startDate || t.date || null,
        registrationOpenDate: t.registrationOpenDate || t.registration_open_date || null,
        registrationCloseDate: t.registrationCloseDate || t.registration_close_date || null,
        badgeBg: '',
        badgeText: '',
        date: t.startDate || t.date || new Date().toISOString(),
        prize: t.prize,
        entry: t.entry,
        entryFeeAmount: parseInt(t.entry_fee_amount) || 0,
        orgName: t.orgName || 'Match District Arena',
        slotsTotal: parseInt(t.slotsTotal) || 100,
        slotsFilled: parseInt(t.slotsFilled) || 0,
        cover_image_url: t.cover_image_url || '',
        bannerUrl: t.cover_image_url || t.bannerUrl || FALLBACK_IMG,
        logoUrl: t.logoUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=100&q=80',
        featured: t.featured || false,
        region: t.region || 'Online',
        format: t.format || 'Squad',
        match_type: t.match_type || t.matchType || 'squad',
        perspective: t.perspective || 'tpp',
        orgTier: ['pro', 'elite', 'basic'].includes((t.orgTier || '').toLowerCase()) ? t.orgTier : 'Pro',
        coverImage: t.coverImage || ''
      }));

    return processedDb;
  }, [dbTournaments]);

  const featuredTournaments = useMemo(() => {
    return tournaments.filter(t => t.featured && getTournamentLifecycleStatus(t, now) !== 'live');
  }, [tournaments, now]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter(t => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = searchQuery === '' ||
        t.title.toLowerCase().includes(searchLower) || 
        t.orgName.toLowerCase().includes(searchLower) ||
        t.game.toLowerCase().includes(searchLower);

      const status = getTournamentLifecycleStatus(t, now);

      let matchStatus = true;
      if (statusFilter === 'Live') {
        matchStatus = status === 'live';
      } else if (statusFilter === 'Upcoming') {
        matchStatus = status === 'upcoming' || status === 'closed';
      } else if (statusFilter === 'Registrations Open') {
        matchStatus = status === 'open';
      } else if (statusFilter === 'All') {
        matchStatus = status !== 'live';
      }

      const matchGame = gameFilter === 'All Games' || t.game.toLowerCase() === gameFilter.toLowerCase();

      let matchEntry = true;
      if (entryTypeFilter === 'Free') matchEntry = parseInt(t.entryFeeAmount) === 0;
      else if (entryTypeFilter === 'Paid') matchEntry = parseInt(t.entryFeeAmount) > 0;

      return matchSearch && matchStatus && matchGame && matchEntry;
    });
  }, [tournaments, searchQuery, statusFilter, gameFilter, entryTypeFilter, now]);

  const capsuleLabel = useMemo(() => {
    const parts = [];
    if (statusFilter !== 'All') parts.push(statusFilter);
    if (entryTypeFilter !== 'All') parts.push(entryTypeFilter);
    if (gameFilter !== 'All Games') parts.push(gameFilter);
    if (parts.length === 0) {
      return `${filteredTournaments.length} Tournaments Live Right Now`;
    }
    return `Showing: ${parts.join(' ')} (${filteredTournaments.length})`;
  }, [statusFilter, entryTypeFilter, gameFilter, filteredTournaments.length]);

  const hasActiveFilters = statusFilter !== 'All' || gameFilter !== 'All Games' || entryTypeFilter !== 'All' || searchQuery !== '';

  const activeFilterCount = [statusFilter !== 'All', gameFilter !== 'All Games', entryTypeFilter !== 'All'].filter(Boolean).length;

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setGameFilter('All Games');
    setEntryTypeFilter('All');
  };

  if (isLoading) {
    return <LoadingScreen message="Loading Tournaments..." />;
  }

  return (
    <div className="min-h-screen bg-[#07080C] relative text-white pb-16 font-body-lg">
      
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-[-10%] left-[20%] w-[450px] h-[450px] bg-primary/10 rounded-full blur-[130px] pointer-events-none" />
      </div>

      <main className="relative z-10 w-full max-w-container-max mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 space-y-8">
        
        <section className="text-center space-y-4 max-w-2xl mx-auto pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-extrabold uppercase tracking-widest font-label-caps shadow-sm">
            <span className="material-symbols-outlined text-sm">visibility</span>
            {capsuleLabel}
          </div>

          <h2 className="font-display-lg text-2xl sm:text-4xl font-black uppercase text-white tracking-tight leading-none">
            TOURNAMENTS
          </h2>
          <p className="hidden sm:block text-on-surface-variant text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
            Assemble your squad, lock in match coordinates, and showcase your skill inside premium esports prize pools.
          </p>
        </section>

        {featuredTournaments.length > 0 && (
          <section className="space-y-3 pt-2 overflow-visible">
            <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-sm">local_fire_department</span>
              Trending &amp; Featured Events
            </h3>

            {/* ── CAROUSEL: bleed wrapper removes page padding via negative margin ── */}
            <div className="-mx-4 sm:-mx-6 lg:-mx-8" style={{ overflowY: 'visible' }}>
              {/* ── SCROLL VIEWPORT: controls the scrollable window, width anchored to 100% ── */}
              <div
                className="pb-8 pt-4 custom-scrollbar scroll-pl-1 md:scroll-pl-2 !touch-pan-x"
                style={{
                  overflowX: 'auto',
                  overflowY: 'visible',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-x',
                  width: '100%',
                }}
              >
                {/* ── INNER TRACK: expands to true max-content so browser sees overflow ── */}
                <div
                  className="flex flex-row gap-4 snap-x snap-mandatory pl-4 sm:pl-6 lg:pl-8"
                  style={{ width: 'max-content' }}
                >
                  {featuredTournaments.map((t, idx) => (
                    <div
                      key={`featured-${t.id}`}
                      className="snap-start flex items-start first:ml-3"
                      style={{ flexShrink: 0, minWidth: '150px' }}
                    >
                      <TournamentCard
                        id={t.id}
                        title={t.title}
                        game={t.game}
                        status={t.status}
                        badgeTextColor="text-white"
                        imgSrc={t.cover_image_url || t.coverImage || FALLBACK_IMG}
                        imgAlt={t.title}
                        prizePool={t.prize}
                        entryFee={t.entry}
                        matchType={t.match_type}
                        perspective={t.perspective}
                        slotsTotal={t.slotsTotal}
                        slotsFilled={t.slotsFilled}
                        entryFeeAmount={t.entryFeeAmount}
                        orgName={t.orgName}
                        orgTier={t.orgTier}
                        onNavigate={onNavigate}
                        registrationOpenDate={t.registrationOpenDate}
                        registrationCloseDate={t.registrationCloseDate}
                        startDate={t.startDate}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Desktop: Unified Control Bar */}
        <section className="pt-2 hidden sm:block">
          <div className="sticky top-[55px] z-30 bg-surface/40 backdrop-blur-md border border-outline-variant/20 p-3 rounded-2xl shadow-lg w-full">
            <div className="flex items-center gap-4 overflow-x-auto snap-x" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

              <div className="relative min-w-[200px] sm:w-[220px] shrink-0 snap-start">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm select-none">
                  search
                </span>
                <input 
                  type="text" 
                  placeholder="Search tournaments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background/50 border border-outline-variant/10 rounded-xl pl-8 pr-3 py-2 text-[11px] text-white placeholder-on-surface-variant/60 focus:outline-none focus:border-primary/60 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>

              <div className="border-l border-outline-variant/20 h-6 shrink-0" />

              <div className="flex items-center gap-2 shrink-0 snap-start">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">STATUS</span>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 ${
                      statusFilter === s
                        ? 'bg-primary text-white border-primary shadow-md'
                        : 'bg-surface border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                    }`}
                  >
                    {s === 'Registrations Open' ? 'Open' : s}
                  </button>
                ))}
              </div>

              <div className="border-l border-outline-variant/20 h-6 shrink-0" />

              <div className="flex items-center gap-2 shrink-0 snap-start">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">GAME</span>
                {GAME_OPTIONS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGameFilter(g)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 ${
                      gameFilter === g
                        ? 'bg-primary text-white border-primary shadow-md'
                        : 'bg-surface border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                    }`}
                  >
                    {g === 'All Games' ? 'All' : g}
                  </button>
                ))}
              </div>

              <div className="border-l border-outline-variant/20 h-6 shrink-0" />

              <div className="flex items-center gap-2 shrink-0 snap-start">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">ENTRY FEE</span>
                {ENTRY_OPTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => setEntryTypeFilter(e)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 ${
                      entryTypeFilter === e
                        ? 'bg-primary text-white border-primary shadow-md'
                        : 'bg-surface border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <>
                  <div className="border-l border-outline-variant/20 h-6 shrink-0" />
                  <button
                    onClick={handleClearFilters}
                    className="px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50"
                  >
                    Clear Filters
                  </button>
                </>
              )}

            </div>
          </div>
        </section>

        {/* Mobile: Compact control row */}
        <section className="pt-2 sm:hidden">
          <div className="sticky top-[43px] z-30 bg-surface/40 backdrop-blur-md border border-outline-variant/20 p-2 rounded-2xl shadow-lg w-full">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm select-none">
                  search
                </span>
                <input 
                  type="text" 
                  placeholder="Search tournaments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background/50 border border-outline-variant/10 rounded-xl pl-8 pr-2 py-2 text-[11px] text-white placeholder-on-surface-variant/60 focus:outline-none focus:border-primary/60 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-outline-variant/20 text-on-surface-variant hover:text-white hover:border-primary/40 transition-all shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/>
                  <line x1="8" y1="12" x2="20" y2="12"/>
                  <line x1="12" y1="18" x2="20" y2="18"/>
                </svg>
                <span className="text-[11px] font-bold uppercase tracking-wider">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 w-5 h-5 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Mobile Filter Drawer — bottom sheet */}
        <AnimatePresence>
          {isMobileFilterOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
                onClick={() => setIsMobileFilterOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-surface border border-outline-variant/20 rounded-t-2xl shadow-2xl sm:hidden max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-outline-variant/10">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Filter Tournaments</h3>
                  <button
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</span>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => setStatusFilter(s)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                            statusFilter === s
                              ? 'bg-primary text-white border-primary shadow-md'
                              : 'bg-background/50 border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                          }`}
                        >
                          {s === 'Registrations Open' ? 'Open' : s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Game</span>
                    <div className="flex flex-wrap gap-2">
                      {GAME_OPTIONS.map(g => (
                        <button
                          key={g}
                          onClick={() => setGameFilter(g)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                            gameFilter === g
                              ? 'bg-primary text-white border-primary shadow-md'
                              : 'bg-background/50 border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                          }`}
                        >
                          {g === 'All Games' ? 'All' : g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Entry Fee</span>
                    <div className="flex flex-wrap gap-2">
                      {ENTRY_OPTIONS.map(e => (
                        <button
                          key={e}
                          onClick={() => setEntryTypeFilter(e)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                            entryTypeFilter === e
                              ? 'bg-primary text-white border-primary shadow-md'
                              : 'bg-background/50 border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container transition-all'
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-outline-variant/10 space-y-2">
                  {hasActiveFilters && (
                    <button
                      onClick={() => { handleClearFilters(); setIsMobileFilterOpen(false); }}
                      className="w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-400 text-xs font-extrabold uppercase tracking-wider hover:bg-rose-500/10 transition-all active:scale-[0.98]"
                    >
                      Clear Filters
                    </button>
                  )}
                  <button
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="w-full py-3 rounded-xl bg-primary text-white text-xs font-extrabold uppercase tracking-wider shadow-[0_0_16px_rgba(99,102,241,0.3)] hover:bg-primary/90 transition-all active:scale-[0.98]"
                  >
                    Show {filteredTournaments.length} Results
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Tournament Grid */}
        <section className="space-y-4 pt-2 overflow-visible">
          <div className="flex justify-between items-center text-xs text-on-surface-variant font-semibold">
            <span>Showing {filteredTournaments.length} esports matches</span>
            {hasActiveFilters && (
              <button onClick={handleClearFilters} className="text-primary hover:underline flex items-center gap-1 font-bold">
                Reset Filters
              </button>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {filteredTournaments.length > 0 ? (
              statusFilter === 'Live' ? (
                <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-hide !touch-pan-x" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
                  {filteredTournaments.map(t => {
                    const modeLabel = [t.match_type === 'solo' ? 'Solo' : t.match_type === 'duo' ? 'Duo' : 'Squad', t.perspective === 'fpp' ? 'FPP' : 'TPP'].filter(Boolean).join(' • ')
                    return (
                      <motion.div
                        key={`live-${t.id}`}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => onNavigate && onNavigate('tournament-detail', t.id)}
                        whileHover={{ y: -2, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className="p-2.5 sm:p-3 rounded-xl flex gap-3 items-center border border-outline-variant/30 shadow-md bg-surface-container-low/60 group hover:bg-surface-container-low hover:border-outline-variant/60 cursor-pointer w-fit shrink-0"
                      >
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 bg-surface-container-high shadow-inner">
                          {(() => {
                            const gameKey = (t.game || '').toLowerCase()
                            const gameIcon = GAME_ICON_MAP[gameKey]
                            return gameIcon ? (
                              <img alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={gameIcon} />
                            ) : (
                              <img alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={t.bannerUrl || t.cover_image_url || FALLBACK_IMG} />
                            )
                          })()}
                        </div>

                        <div className="flex flex-col justify-center flex-grow min-w-0 py-0.5 gap-1">
                          <h3 className="text-sm sm:text-base font-bold text-on-background leading-snug line-clamp-2">
                            {t.title}
                          </h3>

                          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-on-surface-variant/80">
                            <span className="truncate max-w-[120px] sm:max-w-[150px]">{t.orgName || 'Match District Organizer'}</span>
                            <VerificationBadge tier={['pro', 'elite', 'basic'].includes((t.orgTier || '').toLowerCase()) ? t.orgTier : 'Pro'} size="sm" />
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-medium">Prize:</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">{formatINR(t.prize || t.prizePool)}</span>
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
              ) : (
                <div className="-mx-4 sm:-mx-6 lg:-mx-8" style={{ overflowY: 'visible' }}>
                  {/* ── SCROLL VIEWPORT ── */}
                  <div
                  className="pb-8 pt-4 scrollbar-hide scroll-pl-1 md:scroll-pl-2 !touch-pan-x"
                  style={{
                    overflowX: 'auto',
                    overflowY: 'visible',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x',
                    width: '100%',
                  }}
                  >
                    {/* ── INNER TRACK ── */}
                    <motion.div
                      className="flex flex-row gap-4 sm:gap-6 snap-x snap-mandatory pl-4 sm:pl-6 lg:pl-8"
                      style={{ width: 'max-content' }}
                    >
                      {filteredTournaments.map((t, idx) => (
                        <div
                          key={`explore-${t.id}`}
                          className="snap-start first:ml-3"
                          style={{ flexShrink: 0, minWidth: '150px' }}
                        >
                          <TournamentCard
                            id={t.id}
                            title={t.title}
                            game={t.game}
                            status={t.status}
                            badgeTextColor="text-white"
                            imgSrc={t.cover_image_url || t.coverImage || FALLBACK_IMG}
                            imgAlt={t.title}
                            prizePool={t.prize}
                            entryFee={t.entry}
                            matchType={t.match_type}
                            perspective={t.perspective}
                            slotsTotal={t.slotsTotal}
                            slotsFilled={t.slotsFilled}
                            entryFeeAmount={t.entryFeeAmount}
                            orgName={t.orgName}
                            orgTier={t.orgTier}
                            onNavigate={onNavigate}
                            registrationOpenDate={t.registrationOpenDate}
                            registrationCloseDate={t.registrationCloseDate}
                            startDate={t.startDate}
                          />
                        </div>
                      ))}
                    </motion.div>
                  </div>
                </div>
              )
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card bg-[#0C0E13]/60 border border-outline-variant/30 p-10 rounded-3xl text-center space-y-4 max-w-sm mx-auto shadow-xl"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center border border-primary/30 text-primary animate-pulse">
                  <span className="material-symbols-outlined text-2xl">sports_esports</span>
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">No Matches Found</h4>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed px-2">
                    No active tournaments match your current filters. Try resetting search parameters or selecting other filters.
                  </p>
                </div>
                <button onClick={handleClearFilters} className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl font-headline-md text-xs font-bold transition-all active:scale-95">
                  Clear All Filters
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

      </main>

    </div>
  )
}

export default Tournaments
