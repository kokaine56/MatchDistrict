import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { supabase } from '../utils/supabaseClient'
import { useUser } from '../UserContext.jsx'
import { isSystemAdmin } from '../utils/iamRoles.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { DEFAULT_BANNER } from '../utils/defaults.js'
import TournamentCard from '../components/TournamentCard'
import TournamentPromotionControl from '../components/admin/TournamentPromotionControl.jsx'
import TournamentPromotionModal from '../components/admin/TournamentPromotionModal.jsx'
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle'

const STATUS_OPTIONS = ['All', 'Upcoming', 'Registrations Open', 'Registration Closed', 'Live']
const GAME_OPTIONS = ['All Games', 'BGMI', 'Valorant', 'Free Fire', 'COD Mobile']
const ENTRY_OPTIONS = ['All', 'Free', 'Paid']

const FALLBACK_IMG = DEFAULT_BANNER

// Shared projection from a raw tournament row (listing or promoted payload)
// into the shape consumed by the wallet-pass tournament cards.
function mapTournament(t) {
  return {
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
    coverImage: t.coverImage || '',
    card_color: t.card_color || t.cardColor || t.theme || 'white',
    cardColor: t.card_color || t.cardColor || t.theme || 'white',
    theme: t.theme || t.card_color || t.cardColor || 'white',
    hasApprovedSponsors: t.hasApprovedSponsors || false,
    totalSponsorContributions: t.totalSponsorContributions || 0,
    // Promotion metadata (present only for rows from the promoted endpoint)
    promotion_id: t.promotion_id || null,
    placement: t.placement || null,
    priority: t.priority,
    display_order: t.display_order,
  }
}

// Frontend lifecycle guard mirroring the server filter: hide drafts and any
// tournament that has completed or been archived.
function isDiscoverable(t, now) {
  if (t.isDraft) return false
  const stored = (t.status || '').toLowerCase()
  const lifecycle = getTournamentLifecycleStatus(t, now)
  return lifecycle !== 'completed' && stored !== 'completed' && stored !== 'archived'
}


function Tournaments({ onNavigate }) {
  const { currentUser } = useUser();
  const isAdmin = isSystemAdmin(currentUser);

  const [dbTournaments, setDbTournaments] = useState([]);
  const [promotedTournaments, setPromotedTournaments] = useState([]);
  const [adminPromotions, setAdminPromotions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [managingTournament, setManagingTournament] = useState(null);
  const [managingPromotion, setManagingPromotion] = useState(null);
  const [toast, setToast] = useState('');
  const [showToast, setShowToast] = useState(false);

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

  // Public promoted section (active + within schedule, ordered server-side).
  const loadPromoted = React.useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments/promoted')
    if (ok && data?.success && data.tournaments) {
      setPromotedTournaments(data.tournaments)
    }
  }, [])

  // Admin-only: accurate promotion records (including inactive/scheduled ones).
  const loadAdminPromotions = React.useCallback(async () => {
    if (!isAdmin) {
      setAdminPromotions([])
      return
    }
    const token = await getAuthToken()
    const { ok, data } = await fetchJsonWithRetry('/api/admin/tournament-promotions', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (ok && data?.success) {
      setAdminPromotions(Array.isArray(data.promotions) ? data.promotions : [])
    }
  }, [isAdmin])

  const loadAll = React.useCallback(() => {
    loadTournaments()
    loadPromoted()
    loadAdminPromotions()
  }, [loadTournaments, loadPromoted, loadAdminPromotions])

  useRefetchOnFocus(loadAll)

  useEffect(() => {
    const load = () => {
      setIsLoading(true)
      loadTournaments()
      loadPromoted()
      loadAdminPromotions()
    }
    load()

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

    const promoChannel = supabase
      .channel('promotions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_promotions' },
        () => {
          loadPromoted();
          loadAdminPromotions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(promoChannel);
    };
  }, [loadTournaments, loadPromoted, loadAdminPromotions]);

  const tournaments = useMemo(() => {
    return dbTournaments
      .filter((t) => isDiscoverable(t, now))
      .map(mapTournament);
  }, [dbTournaments, now]);

  // Trending & Featured section — driven entirely by the promotion system.
  const promotedList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of promotedTournaments) {
      if (!isDiscoverable(t, now)) continue;
      const mapped = mapTournament(t);
      if (seen.has(mapped.id)) continue; // never render a tournament twice
      seen.add(mapped.id);
      out.push(mapped);
    }
    return out;
  }, [promotedTournaments, now]);

  const promotionByTournamentId = useMemo(() => {
    const map = new Map();
    for (const p of adminPromotions) map.set(p.tournament_id, p);
    return map;
  }, [adminPromotions]);

  const openPromotionManager = (tournament) => {
    setManagingTournament(tournament);
    setManagingPromotion(promotionByTournamentId.get(tournament.id) || null);
  };

  const triggerToast = (msg) => {
    setToast(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2600);
  };

  const handlePromotionSaved = async (action) => {
    triggerToast(action === 'removed' ? 'Promotion removed' : 'Promotion updated');
    await Promise.all([loadPromoted(), loadAdminPromotions()]);
  };

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
        matchStatus = status === 'upcoming';
      } else if (statusFilter === 'Registrations Open') {
        matchStatus = status === 'open';
      } else if (statusFilter === 'Registration Closed') {
        matchStatus = status === 'closed';
      } else if (statusFilter === 'All') {
        matchStatus = true;
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
      return `${filteredTournaments.length} Active Tournaments`;
    }
    return `Showing: ${parts.join(' + ')} (${filteredTournaments.length})`;
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
    return <LoadingScreen message="Loading tournaments..." />;
  }

  return (
    <div className="min-h-screen bg-background relative text-white pb-16 font-body-lg">
      
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-[-10%] left-[20%] w-[450px] h-[450px] bg-primary/8 rounded-full blur-[130px] pointer-events-none" />
      </div>

      <main className="relative z-10 w-full max-w-container-max mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 space-y-8">
        
        <section className="text-center space-y-3 max-w-2xl mx-auto pt-2">
          <h2 className="font-display-lg text-2xl sm:text-3xl md:text-4xl font-black uppercase text-white tracking-tight leading-none">
            TOURNAMENTS
          </h2>
          <p className="hidden sm:block text-on-surface-variant text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
            Discover and register for premium esports tournaments across BGMI, Valorant, Free Fire, and more.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant text-[10px] font-bold uppercase tracking-widest font-label-caps">
            <span className="material-symbols-outlined text-primary text-sm">filter_list</span>
            {capsuleLabel}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="ml-1 w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center hover:bg-rose-500/30 transition-colors"
              >
                <span className="material-symbols-outlined text-[10px]">close</span>
              </button>
            )}
          </div>
        </section>

        {(promotedList.length > 0 || isAdmin) && (
          <section className="space-y-3 pt-2 overflow-visible">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-sm">local_fire_department</span>
                Trending &amp; Featured Events
              </h3>
              {isAdmin && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">admin_panel_settings</span>
                  Admin controls
                </span>
              )}
            </div>

            {promotedList.length > 0 ? (
              /* ── CAROUSEL: bleed wrapper removes page padding via negative margin ── */
              <div className="-mx-4 sm:-mx-6 lg:-mx-8" style={{ overflowY: 'visible' }}>
                {/* ── SCROLL VIEWPORT: controls the scrollable window, width anchored to 100% ── */}
                <div
                  className="pb-8 pt-4 custom-scrollbar scroll-pl-1 md:scroll-pl-2 !touch-auto"
                  style={{
                    overflowX: 'auto',
                    overflowY: 'visible',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x pan-y',
                    width: '100%',
                  }}
                >
                  {/* ── INNER TRACK: expands to true max-content so browser sees overflow ── */}
                  <div
                    className="flex flex-row gap-4 snap-x snap-mandatory pl-4 sm:pl-6 lg:pl-8"
                    style={{ width: 'max-content' }}
                  >
                    {promotedList.map((t) => (
                      <div
                        key={`promoted-${t.id}`}
                        className="snap-start relative flex items-start first:ml-3"
                        style={{ flexShrink: 0, minWidth: '150px' }}
                      >
                        {isAdmin && (
                          <TournamentPromotionControl
                            promotion={promotionByTournamentId.get(t.id) || null}
                            onManage={() => openPromotionManager(t)}
                          />
                        )}
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
                          hasSponsors={t.hasApprovedSponsors}
                          sponsoredAmount={t.totalSponsorContributions}
                          cardColor={t.card_color || t.cardColor || t.theme || 'white'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container-low/30 px-4 py-6 text-center">
                <span className="material-symbols-outlined text-secondary/70 text-2xl">local_fire_department</span>
                <p className="text-[11px] text-on-surface-variant/70 mt-1">
                  No tournaments are promoted yet. Use the <span className="text-amber-400 font-bold">Promote</span> control on any card below to feature it here.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Desktop: Unified Control Bar */}
        <section className="pt-2 hidden sm:block">
          <div className="sticky top-[55px] z-30 bg-surface/60 backdrop-blur-xl border border-outline-variant/15 p-2.5 rounded-2xl shadow-lg w-full">
            <div className="flex items-center gap-3">

              {/* Search */}
              <div className="relative min-w-[200px] sm:w-[240px] shrink-0">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm select-none">search</span>
                <input 
                  type="text" 
                  placeholder="Search by title, organizer, or game..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background/60 border border-outline-variant/15 rounded-xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:bg-background/80 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-1.5 shrink-0">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0 ${
                      statusFilter === s
                        ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                        : 'bg-surface-container-low/60 text-on-surface-variant/70 hover:bg-surface-container hover:text-white border border-transparent hover:border-outline-variant/20'
                    }`}
                  >
                    {s === 'Registrations Open' ? 'Open' : s === 'Registration Closed' ? 'Closed' : s}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="w-px h-5 bg-outline-variant/20 shrink-0" />

              {/* Game */}
              <div className="flex items-center gap-1.5 shrink-0">
                {GAME_OPTIONS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGameFilter(g)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0 ${
                      gameFilter === g
                        ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                        : 'bg-surface-container-low/60 text-on-surface-variant/70 hover:bg-surface-container hover:text-white border border-transparent hover:border-outline-variant/20'
                    }`}
                  >
                    {g === 'All Games' ? 'All' : g}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="w-px h-5 bg-outline-variant/20 shrink-0" />

              {/* Entry Fee */}
              <div className="flex items-center gap-1.5 shrink-0">
                {ENTRY_OPTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => setEntryTypeFilter(e)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0 ${
                      entryTypeFilter === e
                        ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                        : 'bg-surface-container-low/60 text-on-surface-variant/70 hover:bg-surface-container hover:text-white border border-transparent hover:border-outline-variant/20'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <>
                  <div className="w-px h-5 bg-outline-variant/20 shrink-0" />
                  <button
                    onClick={handleClearFilters}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0 text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                  >
                    Clear
                  </button>
                </>
              )}

            </div>
          </div>
        </section>

        {/* Mobile: Compact control row */}
        <section className="pt-2 sm:hidden">
          <div className="sticky top-[43px] z-30 bg-surface/60 backdrop-blur-xl border border-outline-variant/15 p-2 rounded-2xl shadow-lg w-full">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-sm select-none">search</span>
                <input 
                  type="text" 
                  placeholder="Search tournaments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background/60 border border-outline-variant/15 rounded-xl pl-8 pr-2 py-2.5 text-xs text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 text-on-surface-variant hover:text-white hover:border-primary/30 transition-all shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/>
                  <line x1="8" y1="12" x2="20" y2="12"/>
                  <line x1="12" y1="18" x2="20" y2="18"/>
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-white text-[8px] font-bold flex items-center justify-center">
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
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
                onClick={() => setIsMobileFilterOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-outline-variant/15 rounded-t-2xl shadow-2xl sm:hidden max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-outline-variant/10">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Filters</h3>
                  <button
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="w-7 h-7 rounded-full bg-surface-container-low/60 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Status</span>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => setStatusFilter(s)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                            statusFilter === s
                              ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                              : 'bg-surface-container-low/60 border border-outline-variant/15 text-on-surface-variant/70 hover:bg-surface-container hover:text-white'
                          }`}
                        >
                          {s === 'Registrations Open' ? 'Open' : s === 'Registration Closed' ? 'Closed' : s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Game</span>
                    <div className="flex flex-wrap gap-2">
                      {GAME_OPTIONS.map(g => (
                        <button
                          key={g}
                          onClick={() => setGameFilter(g)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                            gameFilter === g
                              ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                              : 'bg-surface-container-low/60 border border-outline-variant/15 text-on-surface-variant/70 hover:bg-surface-container hover:text-white'
                          }`}
                        >
                          {g === 'All Games' ? 'All' : g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Entry Fee</span>
                    <div className="flex flex-wrap gap-2">
                      {ENTRY_OPTIONS.map(e => (
                        <button
                          key={e}
                          onClick={() => setEntryTypeFilter(e)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                            entryTypeFilter === e
                              ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                              : 'bg-surface-container-low/60 border border-outline-variant/15 text-on-surface-variant/70 hover:bg-surface-container hover:text-white'
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
                      className="w-full py-2.5 rounded-xl border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider hover:bg-rose-500/10 transition-all active:scale-[0.98]"
                    >
                      Clear Filters
                    </button>
                  )}
                  <button
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="w-full py-3 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider shadow-[0_0_16px_rgba(99,102,241,0.25)] hover:bg-primary/90 transition-all active:scale-[0.98]"
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
          <div className="flex justify-between items-center text-xs text-on-surface-variant/60 font-semibold">
            <span>Showing {filteredTournaments.length} tournaments</span>
            {hasActiveFilters && (
              <button onClick={handleClearFilters} className="text-primary/80 hover:text-primary hover:underline flex items-center gap-1 font-bold transition-colors">
                <span className="material-symbols-outlined text-[12px]">filter_alt_off</span>
                Reset
              </button>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {filteredTournaments.length > 0 ? (
              <div className="-mx-4 sm:-mx-6 lg:-mx-8" style={{ overflowY: 'visible' }}>
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
                  <motion.div
                    className="flex flex-row gap-4 sm:gap-6 snap-x snap-mandatory pl-4 sm:pl-6 lg:pl-8"
                    style={{ width: 'max-content' }}
                  >
                    {filteredTournaments.map((t) => (
                      <div
                        key={`explore-${t.id}`}
                        className="snap-start relative first:ml-3"
                        style={{ flexShrink: 0, minWidth: '150px' }}
                      >
                        {isAdmin && (
                          <TournamentPromotionControl
                            promotion={promotionByTournamentId.get(t.id) || null}
                            onManage={() => openPromotionManager(t)}
                          />
                        )}
                        <TournamentCard
                          id={t.id}
                          title={t.title}
                          game={t.game}
                          status={t.status}
                          badgeTextColor="text-white"
                          imgSrc={t.cover_image_url || t.coverImage || t.bannerUrl}
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
                          hasSponsors={t.hasApprovedSponsors}
                          sponsoredAmount={t.totalSponsorContributions}
                          cardColor={t.card_color || t.cardColor || t.theme || 'white'}
                        />
                      </div>
                    ))}
                  </motion.div>
                </div>
              </div>
            ) : (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="bg-surface-container-low/40 p-10 sm:p-12 rounded-2xl text-center space-y-4 max-w-sm mx-auto"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-2xl">sports_esports</span>
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">No Matches Found</h4>
                  <p className="text-[11px] text-on-surface-variant/70 leading-relaxed px-2">
                    No tournaments match your current filters. Try adjusting your search or filter criteria.
                  </p>
                </div>
                <button onClick={handleClearFilters} className="px-5 py-2 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl font-headline-md text-xs font-bold transition-all active:scale-95">
                  Reset Filters
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

      </main>

      {/* Admin promotion manager (keyed so form state resets per tournament) */}
      {isAdmin && managingTournament && (
        <TournamentPromotionModal
          key={managingTournament.id}
          isOpen
          tournament={managingTournament}
          promotion={managingPromotion}
          onClose={() => setManagingTournament(null)}
          onSaved={handlePromotionSaved}
        />
      )}

      {/* Admin toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'rgba(10,11,18,0.95)', border: '1px solid rgba(192,193,255,0.25)', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}
          >
            <span className="material-symbols-outlined text-[14px] align-middle mr-1 text-emerald-400">check_circle</span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

export default Tournaments
