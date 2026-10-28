import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useUser } from '../UserContext.jsx';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js';
import { fetchJsonWithRetry, normalizeTournamentRow } from '../utils/api.js';
import { getTournamentLifecycleStatus, getRegistrationButtonState } from '../utils/tournamentLifecycle.js';
import { supabase } from '../utils/supabaseClient';
import { getAuthToken } from '../utils/getAuthToken.js';
import { uploadImage } from '../utils/imagekitUpload.js';
import VerificationBadge from '../components/VerificationBadge.jsx';
import { DEFAULT_CATEGORIES } from '../components/tournament-creation/steps/Step7Rules.jsx';
import { formatDate, formatDateTime } from '../utils/timeFormat';
import SponsorCardItem from '../components/SponsorCardItem.jsx';
import RegisteredTeamsList from '../components/RegisteredTeamsList.jsx';
import { shareTournament } from '../utils/tournamentShare.js';
import TournamentTeamHub from '../components/TournamentTeamHub.jsx';
import { computeSquadCapacity } from '../utils/squadRegistration.js';
import { isSystemAdmin } from '../utils/iamRoles.js';
import { isTournamentOrganizer } from '../utils/tournamentAuth.js';

import gameBgmi from '../assets/supported_games/bgmi.png';
import gameFreeFire from '../assets/supported_games/freefire.png';
import gameCodm from '../assets/supported_games/codm.png';
import gameValorant from '../assets/supported_games/valorant.png';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80';

const GAME_BADGE = {
  bgmi: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'battlegrounds mobile india': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  valorant: 'bg-red-500/20 text-red-400 border-red-500/30',
  codm: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'cod mobile': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'free fire': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cs2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'counter-strike 2': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const GAME_LOGOS = {
  bgmi: gameBgmi,
  'battlegrounds mobile india': gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant
};

function getGameBadge(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_BADGE[key] || 'bg-primary/20 text-primary border-primary/25';
}

// Helper to resolve dynamic class list strings cleanly
const clsx = (...classes) => classes.filter(Boolean).join(' ');

function getGameLogo(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_LOGOS[key] || null;
}

function getDetailPageTheme(themeKey) {
  const config = getThemeConfig(themeKey)
  
  // Use the native glow color but reduce opacity for large auras
  // Example config.glowColor: "rgba(59, 130, 246, 0.15)"
  const aura1 = config.glowColor.replace(/0\.\d+\)/, '0.12)')
  const aura2 = config.glowColor.replace(/0\.\d+\)/, '0.08)')
  
  return {
    bg: config.pageBg || '#07080C',
    auras: [
      `radial-gradient(circle at 15% 15%, ${aura1} 0%, transparent 65%)`,
      `radial-gradient(circle at 85% 65%, ${aura2} 0%, transparent 65%)`
    ],
    gridColor: `rgba(255, 255, 255, 0.03)`
  }
}

function TournamentDetail({ onNavigate, tournamentId }) {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sponsorList, setSponsorList] = useState([]);
  const [totalSponsorAmount, setTotalSponsorAmount] = useState(0);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [showSponsorComingSoon, setShowSponsorComingSoon] = useState(false);
  const [sponsorshipEnabled, setSponsorshipEnabled] = useState(() => import.meta.env.ENABLE_SPONSORSHIP === 'true');
  const [sponsorForm, setSponsorForm] = useState({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' });
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  const [sponsorScreenshot, setSponsorScreenshot] = useState(null);
  const [sponsorScreenshotPreview, setSponsorScreenshotPreview] = useState(null);
  const [sponsorUploading, setSponsorUploading] = useState(false);
  const [sponsorUploadedUrl, setSponsorUploadedUrl] = useState('');
  const [sponsorUploadFailed, setSponsorUploadFailed] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [sponsorStep, setSponsorStep] = useState(1);
  const [sponsorError, setSponsorError] = useState('');
  const [sponsorSuccess, setSponsorSuccess] = useState(false);
  const [mySponsorContribs, setMySponsorContribs] = useState([]);
  const shareInProgressRef = useRef(false);
  const fileInputRef = useRef(null);
  // Tracks when the native file-picker is open so the backdrop click-to-close
  // does NOT fire closeSponsorModal when the picker dialog dismisses.
  const isPickingFile = useRef(false);

  // Custom states for premium sponsors cards interaction
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [frozenCards, setFrozenCards] = useState({});
  const [isNavigatingToRegister, setIsNavigatingToRegister] = useState(false);
  const [discordToast, setDiscordToast] = useState(null);
  const [discordRefreshTrigger, setDiscordRefreshTrigger] = useState(0);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const discordParam = params.get('discord');
      if (discordParam) {
        if (discordParam === 'connected') {
          setDiscordToast({
            type: 'success',
            message: 'Discord account linked successfully!'
          });
          setDiscordRefreshTrigger(prev => prev + 1);
        } else if (discordParam === 'error') {
          const code = params.get('code');
          let message = 'Failed to link Discord account.';
          if (code === 'unauthorized') message = 'Please sign in to link your Discord account.';
          else if (code === 'already_linked') message = 'This Discord account is already linked to another user.';
          else if (code === 'rate_limited') message = 'Too many linking attempts. Please wait a few minutes.';
          else if (code === 'cancelled' || code === 'access_denied') message = 'Discord authorization was cancelled.';
          else if (code === 'csrf_error' || code === 'state_invalid') message = 'Invalid OAuth session. Please try again.';
          else if (code) message = `Discord linking error: ${code.replace(/_/g, ' ')}`;
          setDiscordToast({
            type: 'error',
            message
          });
        }

        params.delete('discord');
        params.delete('code');
        params.delete('retry_after');
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);

        const timer = setTimeout(() => {
          setDiscordToast(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    } catch (err) {
      console.warn('Discord param processing error:', err);
    }
  }, []);

  const getCardType = (amt) => {
    if (amt >= 1000) return 'OBSIDIAN_ELITE';
    if (amt >= 500) return 'DIAMOND_PREFERRED';
    if (amt >= 250) return 'GOLD_ELITE';
    if (amt >= 100) return 'SILVER_PLUS';
    return 'EMERALD_PRESTIGE';
  };

  const getCardTagName = (amt) => {
    if (amt >= 1000) return 'OBSIDIAN ELITE';
    if (amt >= 500) return 'DIAMOND PREFERRED';
    if (amt >= 250) return 'GOLD ELITE';
    if (amt >= 100) return 'SILVER PLUS';
    return 'EMERALD PRESTIGE';
  };

  const handleToggleFreeze = (cardId) => {
    setFrozenCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Seed frozen state demonstration
  useEffect(() => {
    if (sponsorList.length > 0) {
      const initialFrozen = {};
      sponsorList.forEach((s, idx) => {
        const cardId = s.id || `spn-${idx}`;
        if (idx === 1) {
          initialFrozen[cardId] = true;
        }
      });
      setFrozenCards(prev => ({ ...initialFrozen, ...prev }));
    }
  }, [sponsorList]);

  // Search and tabs states
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const teamsPerPage = 6;

  const [hoveredStar, setHoveredStar] = useState(0);
  const [userRating, setUserRating] = useState(0);
  const [hostRating, setHostRating] = useState(4.9);
  const [reviewsCount, setReviewsCount] = useState(42);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [notices, setNotices] = useState([]);
  
  // Secured coordinates credentials state
  const [lobbyCredentials, setLobbyCredentials] = useState(null);
  const [lobbyError, setLobbyError] = useState('');
  const [isLobbyLoading, setIsLobbyLoading] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState('');
  const [revealTimeReached, setRevealTimeReached] = useState(false);

  // Organizer profile & follow state
  const [orgProfile, setOrgProfile] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Countdown state
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [openRule, setOpenRule] = useState(null);

  const [currentUser] = useCurrentUser();
  const { signOut } = useUser();

  // Autofill sponsor form with user profile when modal opens for logged-in users
  useEffect(() => {
    if (!showSponsorForm || !currentUser) return;
    setSponsorForm(prev => ({
      ...prev,
      name: currentUser.name || '',
      email: currentUser.email || ''
    }));
  }, [showSponsorForm, currentUser]);

  const [slotsData, setSlotsData] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(null);
  const [myRegistration, setMyRegistration] = useState(null);

  // Fetch the caller's own registration (+ payment proof status) for the button state.
  // Uses the dedicated /my-registration endpoint that never exposes other users' data.
  const fetchMyRegistration = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const token = await getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/tournaments/${tournamentId}/my-registration`, { headers });
      const data = await res.json();
      if (data.success) setMyRegistration(data.registration || null);
    } catch (_) {}
  }, [tournamentId]);

  // Keep the full registrations list fetch for the organizer registrations tab.
  const fetchRegistrations = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const token = await getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, { headers });
      const data = await res.json();
      // This endpoint is organizer-only; silently ignore 401/403 for regular users.
      if (data.success && data.registrations) setRegistrations(data.registrations);
    } catch (_) {}
  }, [tournamentId]);

  const fetchSlots = useCallback(async () => {
    if (!tournamentId) {
      setSlotsLoading(false);
      return;
    }
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/slots`);
      const data = await res.json();
      if (data.success) {
        setSlotsData(data);
      } else {
        setSlotsError(data.error || 'Failed to fetch slots');
      }
    } catch (err) {
      setSlotsError(err.message || 'Failed to fetch slots');
    } finally {
      setSlotsLoading(false);
    }
  }, [tournamentId]);

  const [tournamentsList, setTournamentsList] = useState([]);
  const [tournamentRow, setTournamentRow] = useState(null);
  const [isTournamentsLoading, setIsTournamentsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) { setIsTournamentsLoading(false); return; }
    setIsTournamentsLoading(true);
    setLoadError(null);
    // Authenticated fetch so the server can grant the organizer (or an eligible
    // registered participant) per-round ID-Pass credentials. Without the JWT the
    // server scrubs credentials and even the organizer would see an empty state.
    const token = await getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const { ok, data, error } = await fetchJsonWithRetry(`/api/tournaments/${tournamentId}`, { headers });
    if (ok && data?.success && data.tournament) setTournamentRow(data.tournament);
    else { setTournamentRow(null); setLoadError(error?.message || data?.message || 'Failed to load tournament'); }
    setIsTournamentsLoading(false);
  }, [tournamentId]);

  const loadTournamentsList = useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments');
    if (ok && data?.success && data.tournaments) setTournamentsList(data.tournaments);
  }, []);

  useEffect(() => { loadTournament(); }, [loadTournament]);
  useEffect(() => { loadTournamentsList(); }, [loadTournamentsList]);

  useEffect(() => {
    fetchMyRegistration();
    fetchRegistrations();
    fetchSlots();
  }, [fetchMyRegistration, fetchRegistrations, fetchSlots]);

  useRefetchOnFocus(loadTournament, !!tournamentId);
  useRefetchOnFocus(loadTournamentsList);
  // Refetch the viewer's own registration on tab focus so approval/rejection updates without a manual reload.
  useRefetchOnFocus(fetchMyRegistration, !!tournamentId);
  useRefetchOnFocus(fetchRegistrations, !!tournamentId);
  useRefetchOnFocus(fetchSlots, !!tournamentId);

  // Fetch approved sponsor data for public wall
  const fetchSponsors = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/sponsors/public`);
      const d = await res.json().catch(() => ({}));
      if (d.success) { setSponsorList(d.sponsors || []); setTotalSponsorAmount(d.totalContributions || 0); }
    } catch { /* non-blocking: public sponsor wall fetch errors are ignored */ }
  }, [tournamentId]);

  useEffect(() => { fetchSponsors(); }, [fetchSponsors]);

  useEffect(() => {
    if (!tournamentId) return;
    const channel = supabase
      .channel(`tournament-detail-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, (payload) => {
        if (payload.eventType === 'INSERT') setTournamentsList(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') {
          if (payload.new.id === tournamentId) { loadTournament(); fetchSponsors(); }
          else setTournamentsList(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        }
        else if (payload.eventType === 'DELETE') setTournamentsList(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_registrations', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setRegistrations(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setRegistrations(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
        else if (payload.eventType === 'DELETE') setRegistrations(prev => prev.filter(r => r.id !== payload.old.id));
        fetch(`/api/tournaments/${tournamentId}/slots`).then(res => res.json()).then(data => { if (data.success) setSlotsData(data); }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_notices', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setNotices(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setNotices(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
        else if (payload.eventType === 'DELETE') setNotices(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_messages', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setChatMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setChatMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        else if (payload.eventType === 'DELETE') setChatMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[REALTIME] Channel tournament-detail-${tournamentId} status:`, status, err);
          fetchRegistrations();
          fetchSlots();
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, fetchRegistrations, fetchSlots, loadTournament, fetchSponsors]);

  const tourney = useMemo(() => normalizeTournamentRow(tournamentRow), [tournamentRow]);
  const isTournamentOwner = useMemo(
    () => isTournamentOrganizer(currentUser, tourney),
    [currentUser, tourney]
  );
  const isSponsorsEnabled = tourney?.sponsors_enabled === true || tourney?.sponsors_enabled === 'true';

  // Fetch organizer profile + follower count when tourney loads
  useEffect(() => {
    if (!tourney || !tourney.orgId) return;
    const orgId = tourney.orgId;
    fetch(`/api/users/${orgId}`, { headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.json()).then(d => { if (d?.user || d?.id) setOrgProfile(d.user || d); }).catch(() => {});
    fetch(`/api/org/followers/${orgId}`)
      .then(r => r.json()).then(d => { if (d?.count !== undefined) setFollowerCount(d.count); }).catch(() => {});
  }, [tourney?.orgId]);

  // Fetch the current user's own submissions for this tournament (status banner)
  useEffect(() => {
    if (!tournamentId || !currentUser) { setMySponsorContribs([]); return; }
    let cancelled = false;
    getAuthToken().then(token => {
      if (!token || cancelled) return;
      fetch(`/api/tournament/${tournamentId}/sponsor/my`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (!cancelled && d.success) setMySponsorContribs(d.contributions || []); }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [tournamentId, currentUser]);

  // Sponsorship availability — follow the server's authoritative feature flag
  useEffect(() => {
    let cancelled = false;
    fetch('/api/sponsorship/status')
      .then(r => r.json())
      .then(d => { if (!cancelled && d && typeof d.enabled === 'boolean') setSponsorshipEnabled(d.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Main countdown timer
  useEffect(() => {
    if (!tourney) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' }); return; }
    let target = null; let label = ''; let type = '';
    const now = new Date();
    const lifecycle = getTournamentLifecycleStatus(tourney, now);
    if (lifecycle === 'archived' || lifecycle === 'completed') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Tournament Ended', active: true, type: 'ended' }); return; }
    if (lifecycle === 'live') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'LIVE NOW', active: true, type: 'live' }); return; }
    const regOpen = tourney.registrationOpenDate ? new Date(tourney.registrationOpenDate) : null;
    const regClose = tourney.registrationCloseDate ? new Date(tourney.registrationCloseDate) : null;
    const startDate = tourney.startDate ? new Date(tourney.startDate) : null;
    if (regOpen && now < regOpen) {
      target = regOpen; label = 'Registration opens in'; type = 'regOpen';
    } else if (regClose && now < regClose) {
      target = regClose; label = 'Registration closes in'; type = 'registration';
    } else if (startDate && now < startDate) {
      target = startDate; label = 'Tournament Starts In'; type = 'start';
    } else { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' }); return; }
    
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Starting Soon', active: true, type: type }); return; }
      setCountdown({ days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), label, active: true, type });
    };
    tick(); const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [tourney]);

  // Coordinates decryption timer logic
  useEffect(() => {
    if (!tourney) return;
    
    const checkReveal = () => {
      if (tourney.reveal_credentials === true || tourney.reveal_credentials === 'true') {
        setRevealTimeReached(true);
        return;
      }
      
      let targetTime = null;
      if (tourney.lobby_start_time) {
        const lTime = new Date(tourney.lobby_start_time);
        if (!isNaN(lTime.getTime())) {
          targetTime = lTime;
        }
      }
      
      if (!targetTime && tourney.startDate) {
        const sTime = new Date(tourney.startDate);
        if (!isNaN(sTime.getTime())) {
          targetTime = new Date(sTime.getTime() - 15 * 60 * 1000);
        }
      }
      
      if (!targetTime) {
        setRevealTimeReached(false);
        setRevealCountdown('');
        return;
      }
      
      const diff = targetTime.getTime() - Date.now();
      if (diff <= 0) {
        setRevealTimeReached(true);
        setRevealCountdown('');
      } else {
        setRevealTimeReached(false);
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        setRevealCountdown(`${mins}m ${secs}s`);
      }
    };
    
    checkReveal();
    const interval = setInterval(checkReveal, 1000);
    return () => clearInterval(interval);
  }, [tourney]);

  const parsedTimeline = useMemo(() => {
    if (!tourney || !tourney.timeline) return { dates: [], roadmap: [] };
    try {
      const parsed = typeof tourney.timeline === 'string' ? JSON.parse(tourney.timeline) : tourney.timeline;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed)) return { dates: parsed, roadmap: [] };
        return { dates: parsed.dates || [], roadmap: parsed.roadmap || [] };
      }
    } catch (e) { console.error('Error parsing tournament timeline:', e); }
    return { dates: [], roadmap: [] };
  }, [tourney]);

  const announcements = useMemo(() => {
    if (notices && notices.length > 0) return notices.map(n => ({ id: n.id, title: n.title, text: n.text, pin: n.pin, time: n.created_at ? formatDate(n.created_at) : 'Today' }));
    return [];
  }, [notices]);

  const allTeams = useMemo(() => {
    return registrations.map(r => {
      let parsedMembers = [];
      try { parsedMembers = typeof r.members === 'string' ? JSON.parse(r.members) : (r.members || []); } catch (e) { parsedMembers = []; }
      return {
        id: r.id, name: r.team_name,
        logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=100&q=80',
        winRate: 'N/A',
        rank: r.status === 'approved' || r.status === 'confirmed' ? 'Active Squad' : r.status === 'waitlisted' ? 'Waitlisted' : 'Pending Verification',
        captain: r.captain.startsWith('@') ? r.captain : `@${r.captain}`,
        verified: r.status === 'approved' || r.status === 'confirmed',
        status: r.status === 'approved' ? 'Approved' : r.status === 'confirmed' ? 'Confirmed' : r.status === 'rejected' ? 'Rejected' : r.status === 'waitlisted' ? 'Waitlisted' : r.status === 'pending_payment' ? 'Pending Payment' : r.status === 'cancelled' ? 'Cancelled' : r.status === 'expired' ? 'Expired' : 'Pending Approval',
        members: parsedMembers, user_id: r.user_id
      };
    });
  }, [registrations]);

  const filteredTeams = useMemo(() => {
    return allTeams.filter(team => {
      const matchSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase()) || team.captain.toLowerCase().includes(searchQuery.toLowerCase());
      if (teamFilter === 'all') return matchSearch;
      if (teamFilter === 'verified') return matchSearch && team.verified;
      if (teamFilter === 'approved') return matchSearch && team.status === 'Approved';
      if (teamFilter === 'pending') return matchSearch && (team.status === 'Pending' || team.status === 'Pending Approval' || team.status === 'Pending Payment');
      if (teamFilter === 'waitlisted') return matchSearch && team.status === 'Waitlisted';
      return matchSearch;
    });
  }, [searchQuery, teamFilter, allTeams]);

  // Sliced teams list based on current page
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * teamsPerPage;
    return filteredTeams.slice(start, start + teamsPerPage);
  }, [filteredTeams, currentPage, teamsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / teamsPerPage));

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, teamFilter]);

  const myRoster = useMemo(() => {
    if (!currentUser || registrations.length === 0) return null;
    // Find the newest registration first by searching from the end of the array
    for (let i = registrations.length - 1; i >= 0; i--) {
      const r = registrations[i];
      const matchUserId = r.user_id === currentUser.id;
      const matchEmail = currentUser.email && r.email && r.email.toLowerCase() === currentUser.email.toLowerCase();
      const captainLower = (r.captain || '').toLowerCase();
      const nm = (currentUser.name || '').toLowerCase();
      const matchCaptain = captainLower === nm;
      
      if (matchUserId || matchEmail || matchCaptain) {
        return r;
      }
    }
    return null;
  }, [currentUser, registrations]);


  // Safe case-insensitive approved check for coordinates access
  const isApprovedRoster = useMemo(() => {
    if (!myRoster) return false;
    const status = (myRoster.status || '').toLowerCase();
    return status === 'approved' || status === 'confirmed';
  }, [myRoster]);

  const triggerToast = useCallback((msg) => { setToastMessage(msg); setShowToast(true); setTimeout(() => setShowToast(false), 4000); }, []);

  const handleSaveRoundCredentials = useCallback(async (roundIndex, roomId, roomPassword, offsetMinutes) => {
    if (!tournamentId || roundIndex == null) return;
    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}/credentials`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ room_id: roomId || '', room_password: roomPassword || '', id_pass_release_offset_minutes: offsetMinutes }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        triggerToast('Room credentials saved');
        setTournamentRow(null);
        loadTournament();
      } else {
        triggerToast(data.message || data.error || 'Could not save room credentials');
      }
    } catch {
      triggerToast('Could not save room credentials');
    }
  }, [tournamentId, loadTournament, triggerToast]);

  const handleRateHost = (ratingValue) => {
    setUserRating(ratingValue);
    const newCount = reviewsCount + (userRating > 0 ? 0 : 1);
    const newAverage = parseFloat(((hostRating * reviewsCount + ratingValue - (userRating > 0 ? userRating : 0)) / newCount).toFixed(1));
    setHostRating(newAverage);
    setReviewsCount(newCount);
    triggerToast(`Thanks for rating this host ${ratingValue} stars!`);
  };

  const validateSponsorScreenshot = (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { setSponsorError('Please upload a JPG, PNG, or WebP image under 10MB.'); return false; }
    if (file.size > 10 * 1024 * 1024) { setSponsorError('Image is too large. Please upload an image under 10MB.'); return false; }
    return true;
  };

  const handleSponsorScreenshotFile = (file) => {
    setSponsorError('');
    if (!file) return;
    if (!validateSponsorScreenshot(file)) return;
    // Selecting a new image replaces the previous File AND resets upload status:
    // the local File must be re-uploaded before Submit becomes valid again.
    setSponsorScreenshot(file);
    setSponsorUploadedUrl('');
    setSponsorUploadFailed(false);
    setSponsorScreenshotPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => setSponsorScreenshotPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Explicit separate upload action — uploads ONLY the selected screenshot.
  // It never submits the sponsorship, never navigates, and never refreshes.
  const uploadSponsorScreenshot = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setSponsorError('');
    if (!sponsorScreenshot) { setSponsorError('Please select a payment screenshot first.'); return; }
    if (!validateSponsorScreenshot(sponsorScreenshot)) return;
    if (sponsorUploading || sponsorSubmitting) return;
    setSponsorUploading(true);
    setSponsorUploadFailed(false);
    try {
      const uploaded = await uploadImage(sponsorScreenshot);
      if (uploaded && typeof uploaded === 'string') {
        setSponsorUploadedUrl(uploaded);
      } else {
        setSponsorUploadFailed(true);
        setSponsorError('Screenshot upload failed. Please try again.');
      }
    } catch {
      setSponsorUploadFailed(true);
      setSponsorError('Screenshot upload failed. Please try again.');
    } finally {
      setSponsorUploading(false);
    }
  };

  const removeSponsorScreenshot = () => {
    setSponsorScreenshot(null);
    setSponsorScreenshotPreview(null);
    setSponsorUploadedUrl('');
    setSponsorUploadFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSponsorError('');
  };

  const handleSponsorContribute = async (e) => {
    e.preventDefault();
    setSponsorError('');
    // Condition 1: a successfully uploaded screenshot URL must exist — a local File is NOT enough.
    if (!sponsorUploadedUrl) {
      if (!sponsorScreenshot) { setSponsorError('Please upload your UPI payment screenshot.'); return; }
      if (sponsorUploadFailed) { setSponsorError('Screenshot upload failed. Please try again.'); return; }
      setSponsorError('Please upload the selected screenshot before submitting.');
      return;
    }
    if (!sponsorForm.transaction_id.trim()) { setSponsorError('Please enter your UPI transaction ID.'); return; }
    if (!sponsorForm.payment_app) { setSponsorError('Please select the payment app you used.'); return; }
    if (!sponsorForm.amount || parseInt(sponsorForm.amount) <= 0) { setSponsorError('Please enter a valid contribution amount.'); return; }
    if (!currentUser) { setSponsorError('Please sign in to submit a sponsorship contribution.'); return; }
    if (!tournamentId) { setSponsorError('This tournament could not be found.'); return; }
    if (sponsorSubmitting) return;
    setSponsorSubmitting(true);
    try {
      // 2) Submit to the server using the already-uploaded screenshot URL (no upload here).
      const token = currentUser ? ((await getAuthToken()) || '') : '';
      const res = await fetch(`/api/tournament/${tournamentId}/sponsor/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          contributor_name: sponsorForm.name.trim(),
          contributor_email: sponsorForm.email.trim() || undefined,
          amount: parseInt(sponsorForm.amount),
          message: sponsorForm.message.trim() || undefined,
          transaction_id: sponsorForm.transaction_id.trim(),
          payment_app: sponsorForm.payment_app,
          screenshot_url: sponsorUploadedUrl
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.status === 'pending') {
        setSponsorSuccess(true);
        fetchSponsors();
        const myToken = await getAuthToken();
        if (myToken && currentUser) {
          fetch(`/api/tournament/${tournamentId}/sponsor/my`, { headers: { Authorization: `Bearer ${myToken}` } })
            .then(r => r.json()).then(d => { if (d.success) setMySponsorContribs(d.contributions || []); }).catch(() => {});
        }
      } else {
        setSponsorError(data.message || 'Contribution could not be submitted. Please try again.');
      }
    } catch {
      setSponsorError('Contribution could not be submitted. Please try again.');
    } finally {
      setSponsorSubmitting(false);
    }
  };

  const closeSponsorModal = () => {
    // If the native file-picker is still active, a pointer/click event that
    // dismissed the picker will bubble up to the backdrop — ignore it so we
    // don't accidentally reset all screenshot state.
    if (isPickingFile.current) return;
    if (sponsorSubmitting) return;
    setShowSponsorForm(false);
    setSponsorSuccess(false);
    setSponsorError('');
    setSponsorForm({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' });
    setSponsorScreenshot(null);
    setSponsorScreenshotPreview(null);
    setSponsorUploadedUrl('');
    setSponsorUploadFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedTier(null);
    setSponsorStep(1);
  };

  // Opens the hidden file input while guarding the backdrop against the
  // pointer event that fires when the native picker dialog closes.
  const openFilePicker = () => {
    isPickingFile.current = true;
    fileInputRef.current?.click();
    // The 'change' / 'cancel' event on the input fires asynchronously after
    // the picker closes; clear the guard shortly after so normal backdrop
    // clicks work again.  600 ms is enough on all tested browsers.
    setTimeout(() => { isPickingFile.current = false; }, 600);
  };

  const handleShare = async () => {
    if (shareInProgressRef.current) return;
    shareInProgressRef.current = true;
    try {
      const result = await shareTournament({
        id: tourney?.id || tournamentId,
        title: tourney?.title || 'Tournament on Match District',
        orgName: orgProfile?.orgName || tourney?.orgName || '',
        prize: prizeDisplay,
        entry: entryDisplay,
        format: `${formatLabel(tourney?.match_type)} · ${(tourney?.perspective || 'TPP').toUpperCase()}`,
        slots: `${slotFilled}/${slotTotal}`,
        url: window.location.href
      });
      if (result === 'copied') triggerToast('Tournament link copied');
      else if (result === 'failed') triggerToast('Could not copy the tournament link.');
    } finally {
      shareInProgressRef.current = false;
    }
  };

  const handleCopyCredentials = (text, type) => { navigator.clipboard.writeText(text); triggerToast(`${type} copied to clipboard!`); };

  const handleFollow = async () => {
    if (!currentUser) { triggerToast('Sign in to follow this organizer.'); return; }
    if (!tourney?.orgId) return;
    setFollowLoading(true);
    const prev = isFollowing;
    const prevCount = followerCount;
    setIsFollowing(!prev);
    setFollowerCount(c => prev ? c - 1 : c + 1);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/org/follow', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ orgId: tourney?.orgId }) });
      const data = await res.json();
      if (!data.success) { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast(data.message || 'Failed to update follow.'); }
      else triggerToast(prev ? 'Unfollowed organizer' : 'Following organizer');
    } catch { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast('Network error.'); }
    finally { setFollowLoading(false); }
  };

  // Decrypted credentials endpoint helper
  const fetchLobbyCredentials = useCallback(async () => {
    if (!tournamentId || !currentUser || !isApprovedRoster) return;
    setIsLobbyLoading(true);
    setLobbyError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/lobby`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLobbyCredentials({ roomID: data.roomID, roomPassword: data.roomPassword });
      } else {
        setLobbyError(data.message || 'Credentials locked.');
      }
    } catch (err) {
      setLobbyError('Failed to load lobby credentials.');
    } finally {
      setIsLobbyLoading(false);
    }
  }, [tournamentId, currentUser, isApprovedRoster]);

  useEffect(() => {
    if (isApprovedRoster && revealTimeReached && !lobbyCredentials && !isLobbyLoading) {
      fetchLobbyCredentials();
    }
  }, [isApprovedRoster, revealTimeReached, lobbyCredentials, isLobbyLoading, fetchLobbyCredentials]);

  // Compute events count from tournament list
  const orgEventsCount = useMemo(() => {
    if (!tourney?.orgId || !tournamentsList.length) return 0;
    return tournamentsList.filter(t => t.orgId === tourney.orgId || t.orgid === tourney.orgId).length;
  }, [tourney?.orgId, tournamentsList]);

  // Formatting utils
  const formatIndianCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    if (isNaN(num) || num === 0) return 'Free';
    return `₹${num.toLocaleString('en-IN')}`;
  };

  const entryFee = parseInt(tourney?.entry_fee_amount, 10) || 0;
  const entryDisplay = entryFee === 0 ? 'Free' : formatIndianCurrency(entryFee);
  const basePrize = parseInt(tourney?.prize_pool_amount || tourney?.basePrize || tourney?.prizePool || 0, 10) || 0;
  const sponsoredAmount = tourney?.totalSponsorContributions || tourney?.sponsorRevenue || 0;
  const totalPrize = basePrize + sponsoredAmount;
  const slotTotal = parseInt(tourney?.slotsTotal || slotsData?.slotsTotal, 10) || 128;

  // Derive canonical filled slot count consistent with Registered Teams tab
  const occupiedFromSlotsArray = Array.isArray(slotsData?.slots)
    ? slotsData.slots.filter(s => s && s.status && s.status !== 'available' && s.registrationId).length
    : 0;

  const validRegistrationsCount = (registrations && registrations.length > 0)
    ? registrations.filter(r => {
        const s = (r.status || '').toLowerCase();
        return !['cancelled', 'expired', 'rejected', 'payment_rejected'].includes(s);
      }).length
    : 0;

  const slotFilled = Math.min(
    slotTotal,
    Math.max(
      Number(slotsData?.slotsFilled) || 0,
      Number(tourney?.slotsFilled) || 0,
      occupiedFromSlotsArray,
      validRegistrationsCount
    )
  );

  const slotAvailable = Math.max(0, slotTotal - slotFilled);
  const fillPercent = Math.min(100, Math.round((slotFilled / slotTotal) * 100));
  const isSlotsFull = slotTotal > 0 && slotFilled >= slotTotal;

  const formatLabel = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

  const startDateStr = tourney?.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? formatDate(startDateStr.toISOString()) : '';
  const formattedTime = '';

  // Generate prize distribution split lists against total prize (base + sponsored)
  const prizeDistributions = useMemo(() => {
    if (!tourney) return [];
    const list = [];
    const pool = totalPrize || parseInt(tourney.prize_pool_amount || tourney.prizePool || tourney.prize, 10) || 0;

    let usedPrizePositions = false;
    try {
      const raw = tourney.prize_positions;
      if (raw) {
        const parsedPositions = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsedPositions) && parsedPositions.length > 0) {
          parsedPositions.forEach((pos) => {
            const pct = parseFloat(pos.percentage);
            const amount = !isNaN(pct) && pool > 0 ? Math.round(pool * pct / 100) : 0;
            list.push({
              position: pos.name || `${list.length + 1} Place`,
              prize: amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : `${pct}%`,
              badge: '',
              badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            });
          });
          usedPrizePositions = true;
        }
      }
    } catch (_) {}

    if (!usedPrizePositions) {
      const firstVal = tourney.prize_split_1st || (pool > 0 ? `₹${Math.round(pool * 0.5).toLocaleString('en-IN')}` : '50%');
      const secondVal = tourney.prize_split_2nd || (pool > 0 ? `₹${Math.round(pool * 0.3).toLocaleString('en-IN')}` : '30%');
      const thirdVal = tourney.prize_split_3rd || (pool > 0 ? `₹${Math.round(pool * 0.2).toLocaleString('en-IN')}` : '20%');

      list.push({ position: 'WWCD', prize: firstVal, badge: '🥇', badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' });
      list.push({ position: '2nd Place', prize: secondVal, badge: '🥈', badgeBg: 'bg-slate-400/20 text-slate-300 border border-slate-400/30' });
      list.push({ position: '3rd Place', prize: thirdVal, badge: '🥉', badgeBg: 'bg-amber-700/20 text-amber-600 border border-amber-700/30' });
    }

    if (tourney.mvp_enabled) {
      list.push({
        position: 'Top Fragger / MVP',
        prize: tourney.prize_split_mvp || (tourney.mvp_amount ? `₹${parseInt(tourney.mvp_amount, 10).toLocaleString('en-IN')}` : 'MVP Award'),
        badge: '🎯',
        badgeBg: 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
      });
    }
    if (tourney.kill_reward_enabled && tourney.kill_reward_per_kill) {
      list.push({
        position: 'Kill Reward',
        prize: `₹${tourney.kill_reward_per_kill} per kill`,
        badge: '💀',
        badgeBg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
      });
    }
    return list;
  }, [tourney, totalPrize]);

  const getParsedRules = (rulesData) => {
    if (!rulesData) return null;

    try {
      const parsed = typeof rulesData === 'string' ? JSON.parse(rulesData) : rulesData;
      
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.selectedDefaultIds || parsed.customRules)) {
        const selectedIds = parsed.selectedDefaultIds || [];
        const customRules = parsed.customRules || [];
        
        const activeCategories = DEFAULT_CATEGORIES.map(cat => {
          const activeItems = cat.items.filter((_, idx) => selectedIds.includes(`${cat.id}-${idx}`));
          return {
            title: cat.title,
            items: activeItems
          };
        }).filter(cat => cat.items.length > 0);
        
        return {
          type: 'structured',
          categories: activeCategories,
          custom: customRules.filter(r => r && r.trim() !== '')
        };
      }

      if (Array.isArray(parsed)) {
        return {
          type: 'flat',
          items: parsed
        };
      }
    } catch (e) {}

    if (typeof rulesData === 'string') {
      const items = rulesData.split('\n').map(r => r.trim()).filter(Boolean);
      if (items.length > 1) {
        return {
          type: 'flat',
          items
        };
      }
    }

    return null;
  };

  const renderRulesContent = () => {
    const parsedRules = getParsedRules(tourney?.rules);
    
    if (!parsedRules) {
      return (
        <div className="text-xs text-white/70 leading-relaxed">
          {tourney?.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.'}
        </div>
      );
    }

    if (parsedRules.type === 'flat') {
      return (
        <ul className="list-disc pl-4 space-y-1.5 text-xs text-white/70">
          {parsedRules.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-4">
        {parsedRules.categories.map((cat, idx) => (
          <div key={idx} className="space-y-1.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">{cat.title}</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-white/60">
              {cat.items.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {parsedRules.custom.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Custom Rules</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-white/60">
              {parsedRules.custom.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const isGoldTheme = ['gold', 'royal_gold', 'royal gold', 'royalgold'].includes((tourney?.card_color || tourney?.cardColor || tourney?.theme || '').toLowerCase().trim());
  const isArcticWhite = !isGoldTheme

  const cardContainerClass = isGoldTheme
    ? 'bg-[#FAF7F0] border border-[#D4A017]/35 rounded-xl p-4 sm:p-5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
    : 'bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm';

  const cardTitleClass = isGoldTheme
    ? 'text-xs font-black text-[#FFFFFF] tracking-widest uppercase mb-2'
    : 'text-xs font-black text-slate-800 tracking-widest uppercase mb-2';

  const cardBodyClass = isGoldTheme
    ? 'text-[13px] sm:text-sm text-[#374151] leading-relaxed whitespace-pre-wrap font-medium'
    : 'text-[13px] sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap';

  if (isTournamentsLoading) return <LoadingScreen message="Loading tournament..." />;

  if (!tourney) {
    return (
      <div className="min-h-screen bg-[#07080C] text-white">
        <Header activePage="tournaments" onNavigate={onNavigate} />
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl" aria-hidden="true">
            🏆
          </div>
          <h1 className="text-2xl font-black sm:text-3xl">Tournament unavailable</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
            This tournament may have been deleted or is no longer available.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate('tournaments') : navigate('/tournaments'))}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
            >
              Browse tournaments
            </button>
            {loadError && (
              <button
                type="button"
                onClick={loadTournament}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/5"
              >
                Try again
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-white relative overflow-x-hidden w-full max-w-[100vw] selection:bg-amber-500/30 selection:text-white transition-colors duration-500 ${
      isGoldTheme ? 'bg-[#0E0C06] royal-gold-theme' : 'bg-[#07080C]'
    }`}>
      {/* Royal Gold Global Background Layers (Auras, Metallic Overlay, Floating Dust) */}
      {isGoldTheme && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
          {/* Layer 1: Warm Metallic Radial Glow Auras */}
          <div 
            className="absolute inset-0 opacity-40 mix-blend-screen"
            style={{
              background: 'radial-gradient(circle at 15% 15%, rgba(255, 224, 130, 0.25) 0%, transparent 65%), radial-gradient(circle at 85% 65%, rgba(212, 160, 23, 0.18) 0%, transparent 65%), radial-gradient(circle at 50% 100%, rgba(122, 82, 0, 0.3) 0%, transparent 60%)'
            }}
          />
          {/* Layer 2: Fine Brushed Metallic Gold Texture Lines */}
          <div 
            className="absolute inset-0 opacity-15 mix-blend-overlay"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 4px)'
            }}
          />
          {/* Layer 3: Slow Floating Gold Dust Particles */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => {
              const size = 1.5 + (i % 3) * 0.8;
              const left = (i * 6.5 + 3) % 96;
              const duration = 6 + (i % 4) * 1.8;
              const delay = (i * 0.4) % 3;
              return (
                <motion.div
                  key={`gold-dust-${i}`}
                  className="absolute rounded-full bg-[#FFE082] shadow-[0_0_8px_1px_rgba(255,224,130,0.8)]"
                  style={{ width: `${size}px`, height: `${size}px`, left: `${left}%`, bottom: '-5%' }}
                  animate={{ y: ['0px', '-105vh'], x: [0, (i % 2 === 0 ? 20 : -20)], opacity: [0, 0.7, 0.7, 0] }}
                  transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
                />
              );
            })}
          </div>
        </div>
      )}

      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="flex-1 flex flex-col items-center w-full px-4 md:px-margin-desktop py-20 md:py-24 touch-scroll max-w-[100vw] relative z-10">
        <div className="w-full max-w-[1280px] space-y-8 pb-32">
          
          {/* Hero Section */}
          <section className="flex flex-col w-full relative">
            <div className={`relative rounded-2xl p-4 sm:p-6 w-full overflow-hidden transition-all duration-300 ${
              isGoldTheme
                ? 'bg-gradient-to-br from-[#3D2800]/95 via-[#8A5C00]/90 to-[#D4A017]/80 border border-[#FFE082]/40 shadow-[0_16px_50px_rgba(122,82,0,0.4)] backdrop-blur-xl'
                : 'bg-white/5 border border-white/10 backdrop-blur-md'
            }`}>
              
              {/* Layer 5: Match District "M" Watermark (3.5% Opacity behind Hero Card) */}
              {isGoldTheme && (
                <div className="absolute top-[-15%] right-[-5%] w-[65%] h-[130%] opacity-[0.035] mix-blend-screen pointer-events-none transform -rotate-12 z-0">
                  <svg viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-[#FFE082]">
                    <path d="M20 180 L70 30 L100 100 L130 30 L180 180 L140 180 L120 100 L100 140 L80 100 L60 180 Z" fill="currentColor" />
                    <path d="M100 10 L190 60 L190 160 L100 210 L10 160 L10 60 Z" stroke="currentColor" strokeWidth="6" fill="none" />
                  </svg>
                </div>
              )}

              {/* Layer 6: Hero Section Contained Ambient Floating Gold Particles */}
              {isGoldTheme && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
                  {Array.from({ length: 14 }).map((_, i) => {
                    const size = 2 + (i % 4) * 1.1;
                    const left = (i * 7.3 + 4) % 94;
                    const duration = 5 + (i % 4) * 1.5;
                    const delay = (i * 0.35) % 2.5;
                    const colors = ['#FFD54F', '#FBC02D', '#FFF8E1', '#FFFFFF'];
                    const color = colors[i % colors.length];
                    return (
                      <motion.div
                        key={`hero-gold-dust-${i}`}
                        className="absolute rounded-full"
                        style={{ 
                          width: `${size}px`, 
                          height: `${size}px`, 
                          left: `${left}%`, 
                          bottom: '-10%',
                          backgroundColor: color,
                          boxShadow: `0 0 8px 1px ${color}80`
                        }}
                        animate={{ 
                          y: ['0px', '-140px'], 
                          x: [0, (i % 2 === 0 ? 15 : -15), (i % 2 === 0 ? -8 : 8), 0], 
                          opacity: [0, 0.45, 0.45, 0] 
                        }}
                        transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Side-by-side: Poster + Top Details */}
              <div className="relative z-10 flex flex-row items-start gap-4 w-full">
                
                {/* Poster Left */}
                <div className="w-[110px] sm:w-[140px] md:w-[220px] lg:w-[280px] shrink-0 rounded-2xl sm:rounded-[22px] md:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                  <img 
                    className="w-full aspect-[3/4] object-cover rounded-2xl sm:rounded-[22px] md:rounded-3xl"
                    src={tourney.cover_image_url || tourney.bannerUrl || FALLBACK_IMG}
                    alt="Tournament Poster"
                  />
                </div>

                {/* Details Right */}
                <div className="flex-1 flex flex-col items-start justify-start md:justify-center text-left min-w-0">
                  
                  {/* Title Row with Share Button */}
                  <div className="flex items-start justify-between gap-2 w-full">
                    <h1 className={`text-lg sm:text-2xl font-black text-[#FFFFFF] !text-white leading-tight line-clamp-2 break-words ${isGoldTheme ? 'royal-gold-title' : ''}`} style={{ color: '#FFFFFF' }}>
                      {tourney.title}
                    </h1>
                    <button
                        onClick={handleShare}
                        aria-label="Share tournament"
                        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
                          isGoldTheme
                            ? 'text-[#FFE082]/60 hover:text-[#FFE082] hover:bg-[#FFE082]/10'
                            : 'text-white/50 hover:text-white/90 hover:bg-white/8'
                        }`}
                      >
                        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </button>
                  </div>

                  {/* Organizer */}
                  <div className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 mt-1.5 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-800'}`}>
                    <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full overflow-hidden shrink-0 bg-white/10 border border-white/20 flex items-center justify-center font-bold text-[6px] sm:text-[7px] text-white">
                      {tourney?.orgLogo || orgProfile?.avatar ? (
                        <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                      ) : (
                        (orgProfile?.orgName || tourney.orgName || 'MD').slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className={`truncate ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>

                  {/* Data Grid - 2x2 unified */}
                  <div className="grid grid-cols-2 gap-y-4 gap-x-4 w-full mt-4">
                    {/* Prize */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>PRIZE</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm sm:text-base font-extrabold ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{prizeDisplay}</span>
                        {sponsoredAmount > 0 && (
                          <svg className="w-4 h-4 text-amber-400 shrink-0 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {/* Entry */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>ENTRY</span>
                      <span className={`text-sm sm:text-base font-extrabold ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{entryDisplay}</span>
                    </div>
                    {/* Format */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>FORMAT</span>
                      <span className={`text-xs sm:text-sm font-bold flex items-center gap-1 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>
                        {formatLabel(tourney.match_type)} &bull; {(tourney.perspective || 'TPP').toUpperCase()}
                      </span>
                    </div>
                    {/* Slots */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>SLOTS</span>
                      <span className={`text-xs sm:text-sm font-bold flex items-center gap-1 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>
                        <svg className={`w-3 sm:w-3.5 h-3 sm:h-3.5 ${isGoldTheme ? 'text-white/90' : 'text-slate-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        {slotsLoading && !tourney?.slotsFilled && !slotsData ? (
                          <span className="animate-pulse opacity-75">...</span>
                        ) : (
                          <span>{slotFilled}/{slotTotal}</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="w-full mt-4 sm:mt-5 pt-4 border-t border-white/10">
                {(() => {
                  // Use the viewer's own registration row (from /my-registration) to drive the CTA.
                  // Fall back to myRoster (organizer-tab enriched data) if the dedicated fetch hasn't run yet.
                  const regSource = myRegistration || myRoster || null;
                  const lifecycle = getTournamentLifecycleStatus(tourney, new Date());
                  const btnState = getRegistrationButtonState(regSource, lifecycle, { slotsFull: isSlotsFull });

                  // Distinct rejected-payment UI separating status message from the action
                  if (btnState.isRejected) {
                    return (
                      <div className="w-full bg-error/10 border border-error/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-sm shadow-sm">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center shrink-0 mt-0.5 text-error shadow-sm">
                            <span className="material-symbols-outlined text-xl leading-none">error</span>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <h4 className="text-sm sm:text-base font-bold text-on-background tracking-tight">Payment Rejected</h4>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              Payment verification failed.{btnState.rejectionReason ? <span className="font-semibold text-error"> Reason: {btnState.rejectionReason}</span> : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isNavigatingToRegister}
                          onClick={() => {
                            if (isNavigatingToRegister) return;
                            setIsNavigatingToRegister(true);
                            navigate(`/tournaments/${tourney.id}/register`);
                          }}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-error hover:bg-error/90 active:bg-error/80 text-on-error font-bold text-sm shadow-md shadow-error/20 hover:shadow-lg hover:shadow-error/30 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-75 disabled:cursor-wait shrink-0 min-h-[44px]"
                        >
                          {isNavigatingToRegister ? (
                            <>
                              <div className="w-4 h-4 border-2 border-on-error border-t-transparent rounded-full animate-spin" />
                              <span>Loading...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-lg leading-none shrink-0">refresh</span>
                              <span>Register Again</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  }

                  // Icon helper
                  const BtnIcon = ({ icon }) => {
                    if (icon === 'check') return (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    );
                    if (icon === 'clock') return (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    );
                    if (icon === 'x') return (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    );
                    return (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    );
                  };

                  // Gold-theme overrides for the registered/join states (never override Slots Full state)
                  let finalClass = btnState.styleClass;
                  if (isGoldTheme && !btnState.isSlotsFull) {
                    if (btnState.action === 'join' && !btnState.disabled) {
                      finalClass = 'bg-gradient-to-r from-[#FFE082] via-[#FFC107] to-[#FFCA28] text-[#3D2500] font-black border border-[#FFF4C2]/70 shadow-[0_4px_16px_rgba(80,50,0,0.5)] hover:shadow-[0_6px_24px_rgba(255,193,7,0.6)]';
                    } else if (btnState.icon === 'check') {
                      finalClass = 'bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-white border border-[#FFE082]/40 shadow-[inset_0_1px_3px_rgba(255,255,255,0.3)] opacity-95 cursor-not-allowed';
                    }
                  }

                  const isButtonDisabled = btnState.disabled || isNavigatingToRegister;

                  return (
                    <div className="flex w-full items-center gap-3">
                      <button
                        type="button"
                        disabled={isButtonDisabled}
                        onClick={() => {
                          if (isButtonDisabled || !btnState.action) return;
                          setIsNavigatingToRegister(true);
                          navigate(`/tournaments/${tourney.id}/register`);
                        }}
                        className={`min-w-0 flex-1 font-bold text-sm px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${finalClass} ${isNavigatingToRegister ? 'opacity-80 cursor-wait' : ''}`}
                      >
                        {isNavigatingToRegister ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <BtnIcon icon={btnState.icon} />
                            <span>{btnState.text}</span>
                          </>
                        )}
                      </button>
                      {getGameLogo(tourney.game) && (
                        <div className="shrink-0">
                          <img 
                            src={getGameLogo(tourney.game)} 
                            alt={tourney.game} 
                            className={`rounded-xl overflow-hidden border object-cover h-[40px] sm:h-[48px] w-[40px] sm:w-[48px] ${
                              isGoldTheme ? 'border-[#FFC107]/40 shadow-md' : 'border-slate-200'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>
          </section>

          {/* Registration Countdown Banner */}
          {countdown.active && countdown.type !== 'ended' && countdown.type !== 'live' && (
            <div className={`mt-4 border shadow-sm p-3.5 flex items-center justify-between w-full relative overflow-hidden transition-all duration-300 ${
              isGoldTheme
                ? 'bg-gradient-to-r from-[#C29215]/95 via-[#D4A017]/95 to-[#A67B10]/95 border-[#FFE082]/50 shadow-[0_8px_24px_rgba(184,134,11,0.3)] rounded-2xl backdrop-blur-xl'
                : countdown.type === 'regOpen' ? 'bg-emerald-50 border-emerald-200 rounded-xl' :
                  countdown.type === 'registration' ? 'bg-blue-50 border-blue-200 rounded-xl' :
                  'bg-white border-slate-100 rounded-xl'
            }`}>
              {/* Brushed texture overlay for Royal Gold */}
              {isGoldTheme && (
                <div 
                  className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none z-0"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 4px)'
                  }}
                />
              )}

              {/* Contained Ambient Floating Gold Particles for Countdown Section */}
              {isGoldTheme && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const size = 2 + (i % 3) * 1.2;
                    const left = (i * 13 + 6) % 92;
                    const duration = 4.5 + (i % 3) * 1.2;
                    const delay = (i * 0.4) % 2;
                    const colors = ['#FFD54F', '#FBC02D', '#FFF8E1', '#FFFFFF'];
                    const color = colors[i % colors.length];
                    return (
                      <motion.div
                        key={`countdown-gold-dust-${i}`}
                        className="absolute rounded-full"
                        style={{ 
                          width: `${size}px`, 
                          height: `${size}px`, 
                          left: `${left}%`, 
                          bottom: '-15%',
                          backgroundColor: color,
                          boxShadow: `0 0 6px 1px ${color}80`
                        }}
                        animate={{ 
                          y: ['0px', '-75px'], 
                          x: [0, (i % 2 === 0 ? 10 : -10), 0], 
                          opacity: [0, 0.4, 0.4, 0] 
                        }}
                        transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
                      />
                    );
                  })}
                </div>
              )}

              <span className={`text-xs sm:text-sm relative z-10 ${
                isGoldTheme
                  ? 'font-bold text-white'
                  : countdown.type === 'regOpen' ? 'font-black tracking-widest text-emerald-600' :
                    countdown.type === 'registration' ? 'font-black tracking-widest text-blue-600' :
                    'font-black tracking-widest text-slate-500'
              }`}>{countdown.label}</span>

              <div className={`text-sm sm:text-base font-black px-3.5 py-1.5 rounded-xl whitespace-nowrap border relative z-10 ${
                isGoldTheme
                  ? 'text-white bg-[#8A5C00]/40 border-[#FFE082]/40 shadow-inner'
                  : countdown.type === 'regOpen' ? 'text-emerald-700 bg-emerald-100/50 border-emerald-200' :
                    countdown.type === 'registration' ? 'text-blue-700 bg-blue-100/50 border-blue-200' :
                    'text-slate-700 bg-slate-100/50 border-slate-200'
              }`}>
                {countdown.days > 0 ? `${countdown.days}d ` : ''}
                {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Tabs */}
          <div className={`mt-8 border-b w-full overflow-hidden ${isGoldTheme ? 'border-[#D4A017]/30' : 'border-slate-200'}`}>
            <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap pb-3 scrollbar-hide touch-pan-x">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'prize', label: 'Prize Pool' },
                ...(currentUser ? [{ id: 'my_team', label: 'My Team' }] : []),
                { id: 'rules', label: 'Rules & Regulations' },
                { id: 'teams', label: 'Registered Teams' },

                { id: 'sponsors', label: 'Sponsors' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    activeTab === tab.id
                      ? isGoldTheme
                        ? 'text-[#D4A017] font-black border-b-2 border-[#D4A017] pb-2 whitespace-nowrap text-sm sm:text-base py-1'
                        : 'text-blue-600 font-bold border-b-2 border-blue-600 pb-2 whitespace-nowrap text-sm sm:text-base py-1'
                      : isGoldTheme
                        ? 'text-[#9CA3AF] hover:text-[#D4A017] font-medium pb-2 cursor-pointer whitespace-nowrap transition-colors text-sm sm:text-base py-1'
                        : 'text-slate-400 hover:text-slate-600 pb-2 cursor-pointer whitespace-nowrap text-sm sm:text-base py-1'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Area */}
          <div className="mt-6 w-full pb-20 min-h-[120px]">
            {activeTab === 'overview' && (
              <div className="flex flex-col lg:flex-row gap-6 w-full">

                {/* Left Column: Descriptions */}
                <div className="flex-1 space-y-4">
                  <div className={cardContainerClass}>
                    <h3 className={cardTitleClass}>About Tournament</h3>
                    <p className={cardBodyClass}>{tourney?.description || 'No description provided for this tournament.'}</p>
                  </div>
                  <div className={cardContainerClass}>
                    <h3 className={cardTitleClass}>About Organizer</h3>
                    <p className={cardBodyClass}>{orgProfile?.orgBio || orgProfile?.experience || orgProfile?.bio || tourney?.orgBio || 'No description provided for this organizer.'}</p>
                  </div>
                </div>

                {/* Right Column: Organizer Profile Card */}
                <div className="w-full lg:w-[320px] shrink-0">
                  <div className={`${cardContainerClass} flex flex-col gap-4`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full overflow-hidden shrink-0 border flex items-center justify-center font-bold text-xs ${
                        isGoldTheme ? 'bg-[#F5F0E1] border-[#D4A017]/40 text-[#1F2937]' : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}>
                        {tourney?.orgLogo || orgProfile?.avatar ? (
                          <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                          (orgProfile?.orgName || tourney?.orgName || 'MD').slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold truncate ${isGoldTheme ? 'text-[#1F2937] font-black' : 'text-slate-900'}`}>{orgProfile?.orgName || tourney?.orgName || orgProfile?.name || 'Organizer'}</span>
                          <VerificationBadge tier={orgProfile?.tier || tourney?.orgTier} size="xs" />
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {[1,2,3,4,5].map(star => (
                            <svg key={star} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                          <span className={`text-sm font-bold ml-1 ${isGoldTheme ? 'text-[#374151]' : 'text-slate-700'}`}>4.8 <span className={isGoldTheme ? 'text-slate-500 font-medium' : 'text-slate-400 font-medium'}>(120 reviews)</span></span>
                        </div>
                        <div className={`flex items-center gap-4 mt-2 text-xs font-bold ${isGoldTheme ? 'text-[#4B5563]' : 'text-slate-500'}`}>
                          <span>🎮 {orgProfile?.totalTournaments || tourney?.orgTotalHosted || 12} Tournaments Hosted</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`w-full font-bold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                        isGoldTheme
                          ? 'bg-gradient-to-r from-[#FFE082] via-[#FFC107] to-[#FFCA28] text-[#3D2500] font-black border border-[#FFF4C2]/70 shadow-md hover:brightness-105'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Following
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Follow Organizer
                        </>
                      )}
                    </button>
                    {followerCount > 0 && (
                      <p className="text-xs text-slate-500 text-center -mt-2">{followerCount.toLocaleString()} follower{followerCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>

              </div>
            )}
            {activeTab === 'prize' && (
              isGoldTheme ? (
                <div className="flex flex-col gap-4 w-full max-w-2xl select-none">
                  {/* Sleek, Compact Total Prize Pool Card */}
                  <div className="relative overflow-hidden rounded-xl p-4 sm:p-5 bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border border-[#FFF4C2]/80 shadow-[0_6px_20px_rgba(212,160,23,0.35)] backdrop-blur-md">
                    <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#FFF4C2_1px,transparent_1px)] [background-size:16px_16px]" />

                    <div className="relative z-10 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-[#FFFFFF]">
                          Total Prize Pool
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-black text-[#FFFFFF] tracking-tight text-right">
                          {formatIndianCurrency(totalPrize)}
                        </h2>
                      </div>

                      {sponsoredAmount > 0 && (
                        <div className="pt-2 border-t border-[#FFF4C2]/30 flex items-center justify-between gap-2 text-xs text-[#FFFFFF]">
                          <span className="font-bold text-[#FFFFFF]">Base Prize: {formatIndianCurrency(basePrize)}</span>
                          <span className="font-bold text-[#FFFFFF] bg-[#8A5A00]/40 border border-[#FFF4C2]/40 px-2 py-0.5 rounded-md text-[11px]">
                            + Sponsored: {formatIndianCurrency(sponsoredAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sleek Royal Gold Prize Distribution Board */}
                  {prizeDistributions.length > 0 ? (
                    <div className="space-y-2.5">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFFFFF] pl-1">
                        Prize Distribution
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {prizeDistributions.map((row, i) => {
                          const isWWCD = i === 0 || /wwcd|1st|champion/i.test(row.position);
                          const isSecond = i === 1 || /2nd/i.test(row.position);
                          const isThird = i === 2 || /3rd/i.test(row.position);

                          const getCleanRankTitle = (idx, rawPos) => {
                            if (idx === 0 || /wwcd|1st|champion/i.test(rawPos)) return 'WWCD / CHAMPION';
                            if (idx === 1 || /2nd/i.test(rawPos)) return '2nd Place';
                            if (idx === 2 || /3rd/i.test(rawPos)) return '3rd Place';
                            if (idx === 3 || /4th/i.test(rawPos)) return '4th Place';
                            if (idx === 4 || /5th/i.test(rawPos)) return '5th Place';
                            if (idx === 5 || /6th/i.test(rawPos)) return '6th Place';
                            if (idx === 6 || /7th/i.test(rawPos)) return '7th Place';
                            if (idx === 7 || /8th/i.test(rawPos)) return '8th Place';
                            if (idx === 8 || /9th/i.test(rawPos)) return '9th Place';
                            if (idx === 9 || /10th/i.test(rawPos)) return '10th Place';
                            if (/place|rank|mvp|fragger|kill/i.test(rawPos)) return rawPos;
                            return `${idx + 1}th Place`;
                          };

                          const positionTitle = getCleanRankTitle(i, row.position);
                          const subtitle = isWWCD ? 'Winning Team' : isSecond ? 'Runner-up' : isThird ? 'Third-place finish' : '';

                          if (isWWCD) {
                            return (
                              <div
                                key={i}
                                className="md:col-span-2 relative overflow-hidden rounded-xl p-3.5 sm:p-4 bg-gradient-to-br from-[#FFE082] via-[#E6B93C] to-[#B8860B] border border-[#FFF4C2] shadow-[0_6px_20px_rgba(255,216,106,0.5)] flex items-center justify-between gap-3"
                              >
                                <div>
                                  <h4 className="text-base sm:text-lg font-black text-[#FFFFFF] tracking-wide">
                                    {positionTitle}
                                  </h4>
                                  {subtitle && (
                                    <p className="text-xs sm:text-sm font-bold text-[#FFFFFF] mt-0.5">
                                      {subtitle}
                                    </p>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xl sm:text-2xl font-black text-[#FFFFFF] tracking-tight">
                                    {row.prize}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (isSecond || isThird) {
                            return (
                              <div
                                key={i}
                                className={`relative overflow-hidden rounded-xl p-3 border flex items-center justify-between gap-2.5 ${
                                  isSecond
                                    ? 'bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#A67B10] border-[#FFF4C2]/80 shadow-[0_4px_14px_rgba(212,160,23,0.35)]'
                                    : 'bg-gradient-to-br from-[#D4A017] via-[#C29215] to-[#8A5A00] border-[#FFE082]/70 shadow-[0_3px_12px_rgba(184,134,11,0.3)]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <h4 className="text-xs sm:text-sm font-black text-[#FFFFFF] truncate">
                                    {positionTitle}
                                  </h4>
                                  {subtitle && (
                                    <p className="text-xs font-bold text-[#FFFFFF] truncate mt-0.5">
                                      {subtitle}
                                    </p>
                                  )}
                                </div>

                                <span className="text-base sm:text-lg font-black text-[#FFFFFF] shrink-0 ml-2">
                                  {row.prize}
                                </span>
                              </div>
                            );
                          }

                          // Ranks 4+
                          return (
                            <div
                              key={i}
                              className="bg-gradient-to-r from-[#C29215] to-[#9E740E] border border-[#FFE082]/40 rounded-lg p-2.5 px-3 flex items-center justify-between shadow-sm"
                            >
                              <span className="font-bold text-xs text-[#FFFFFF] truncate">
                                {positionTitle}
                              </span>
                              <span className="font-black text-xs sm:text-sm text-[#FFFFFF] shrink-0 ml-2">
                                {row.prize}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl text-xs border bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border-[#FFF4C2] text-[#FFFFFF] font-bold">
                      No prize distribution data available.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-5 max-w-2xl">
                  {/* Prize Pool Breakdown Summary */}
                  <div className="relative overflow-hidden rounded-2xl p-6 bg-white border border-slate-200 shadow-lg">
                    {sponsoredAmount > 0 ? (
                      <>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-5 relative z-10 text-slate-400">Prize Pool Breakdown</h4>

                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-sm font-medium text-slate-600">Base Prize</span>
                          <span className="text-sm font-bold text-slate-800">{formatIndianCurrency(basePrize)}</span>
                        </div>

                        <div className="flex items-center justify-between mt-4 relative z-10">
                          <span className="text-sm font-medium flex items-center gap-1.5 text-slate-600">
                            Sponsored Contributions
                            <svg className="w-4 h-4 shrink-0 aspect-square text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.644 1.59a.5.5 0 01.712 0l4.203 4.26a.5.5 0 00.337.164l6.02.526a.5.5 0 01.285.873l-4.47 4.208a.5.5 0 00-.167.472l1.297 5.928a.5.5 0 01-.743.542L12 15.579a.5.5 0 00-.488 0l-5.53 2.988a.5.5 0 01-.743-.542l1.297-5.928a.5.5 0 00-.167-.472l-4.47-4.208a.5.5 0 01.285-.873l6.02-.526a.5.5 0 00.337-.164L11.644 1.59z" />
                            </svg>
                          </span>
                          <span className="text-sm font-bold text-amber-400">+{formatIndianCurrency(sponsoredAmount)}</span>
                        </div>

                        <div className="my-4 relative z-10 border-t border-slate-100" />

                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Prize Pool</span>
                          <span className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                            {formatIndianCurrency(totalPrize)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Prize Pool</span>
                        <span className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                          {formatIndianCurrency(totalPrize)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Prize Distribution Cards */}
                  {prizeDistributions.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] pl-1 text-slate-400">Prize Distribution</h5>
                      {prizeDistributions.slice(0, 15).map((row, i) => {
                        const medalSvgs = [
                          <svg key="g" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(245,158,11,0.45)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#FEF3C7" />
                          </svg>,
                          <svg key="s" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(148,163,184,0.35)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#F1F5F9" />
                          </svg>,
                          <svg key="b" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(217,119,6,0.35)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#D97706" stroke="#B45309" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#D97706" stroke="#B45309" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#FED7AA" />
                          </svg>
                        ];

                        const displayName = i === 0 && row.position !== 'WWCD' && /1st/i.test(row.position) ? 'WWCD' : row.position;

                        return (
                          <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3.5 shadow-sm border bg-white border-slate-200">
                            <div className="flex items-center gap-3 min-w-0">
                              {i <= 2 ? (
                                medalSvgs[i]
                              ) : (
                                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 bg-slate-100 border-slate-200 text-slate-500">
                                  {i + 1}
                                </span>
                              )}
                              <span className="font-extrabold text-sm leading-tight truncate text-slate-900">
                                {i <= 2 ? displayName : `Rank ${i + 1}`}
                              </span>
                            </div>
                            <span className="font-black text-sm sm:text-base shrink-0 ml-3 text-green-700">{row.prize}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl text-sm border bg-slate-50 border-slate-100 text-slate-500">No prize distribution data available.</div>
                  )}
                </div>
              )
            )}
            {activeTab === 'my_team' && currentUser && (
              <TournamentTeamHub
                tournamentId={tourney.id}
                tournamentTitle={tourney.title}
                maxTeamSize={computeSquadCapacity(null, tourney)}
              />
            )}
            {activeTab === 'rules' && (
              <div className="max-w-2xl space-y-3">
                {(() => {
                  const parsedRules = getParsedRules(tourney?.rules);
                  const categories = [];

                  if (!parsedRules) {
                    categories.push({
                      title: 'Rules',
                      items: [tourney?.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.']
                    });
                  } else if (parsedRules.type === 'flat') {
                    categories.push({ title: 'Rules', items: parsedRules.items });
                  } else {
                    parsedRules.categories.forEach(c => categories.push({ title: c.title, items: c.items }));
                    if (parsedRules.custom.length > 0) {
                      categories.push({ title: 'Custom Rules', items: parsedRules.custom, custom: true });
                    }
                  }

                  return categories.map((cat, idx) => (
                    <div key={idx} className={`rounded-xl overflow-hidden shadow-sm border ${
                      isGoldTheme ? 'border-[#D4A017]/35 bg-[#FAF7F0]' : 'border-slate-200 bg-white'
                    }`}>
                      <button
                        onClick={() => setOpenRule(openRule === idx ? null : idx)}
                        className={`w-full flex items-center justify-between p-4 transition-colors font-bold text-left ${
                          isGoldTheme
                            ? 'bg-[#F5F0E1] hover:bg-[#EDE5D0] text-[#1F2937]'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <span className={`text-sm uppercase tracking-wider ${cat.custom ? (isGoldTheme ? 'text-[#B8860B]' : 'text-blue-600') : (isGoldTheme ? 'text-[#1F2937]' : 'text-slate-700')}`}>{cat.title}</span>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${isGoldTheme ? 'text-[#D4A017]' : 'text-slate-400'} ${openRule === idx ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openRule === idx && (
                        <div className={`p-4 text-sm leading-relaxed whitespace-pre-wrap space-y-1.5 border-t ${
                          isGoldTheme ? 'border-[#D4A017]/25 text-[#374151]' : 'border-slate-100 text-slate-600'
                        }`}>
                          {cat.items.map((item, i) => (
                            <p key={i} className="flex items-start gap-2">
                              <span className={isGoldTheme ? 'text-[#D4A017] mt-0.5' : 'text-slate-300 mt-0.5'}>•</span>
                              <span>{item}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
            {activeTab === 'teams' && (
              <RegisteredTeamsList
                tournamentId={tourney?.id || tournamentId}
                slotsData={slotsData}
                isGoldTheme={isGoldTheme}
                refreshTrigger={discordRefreshTrigger}
              />
            )}
            {activeTab === 'sponsors' && (
              <div className="w-full max-w-7xl">
                <div className="flex flex-col sm:flex-row sm:items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-4 mb-6">
                  <div className="text-left">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Tournament Sponsors</h3>
                      {sponsorshipEnabled === false && (
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 whitespace-nowrap">
                          <span className="text-[10px] font-bold tracking-widest uppercase text-blue-500">Coming Soon</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Premium corporate and community contributions directly backing the prize pool.</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ y: -2 }}
                    onClick={() => {
                      if (sponsorshipEnabled === false) {
                        setShowSponsorComingSoon(true);
                        return;
                      }
                      setSponsorSuccess(false); setSponsorError(''); setShowSponsorForm(true);
                    }}
                    className="group inline-flex items-center justify-center gap-2 self-start sm:self-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-xs tracking-wide px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/25 transition-all min-h-[44px]"
                    aria-label="Become a sponsor of this tournament">
                    <span className="material-symbols-outlined text-[16px]">volunteer_activism</span>
                    Become a Sponsor
                    <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:translate-x-0.5">chevron_right</span>
                  </motion.button>
                </div>

                {/* Current user's own submission status */}
                {mySponsorContribs.length > 0 && (
                  <div className="mb-5 space-y-2">
                    {mySponsorContribs.map(c => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div>
                          <p className="text-xs font-bold text-white">Your contribution — ₹{Number(c.amount).toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.transaction_id ? `Txn: ${c.transaction_id}` : 'Submitted via UPI'}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${c.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : c.status === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                          {c.status === 'pending' ? 'Pending verification' : c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sponsorList.length > 0 ? (
                  <div className="w-full max-w-7xl">
                    {(() => {
                      // Already sorted by amount DESC from server endpoint
                      const totalVolume = sponsorList.reduce((sum, item) => sum + Number(item.balance || item.amount || 0), 0);
                      return (
                        <>
                          <div className="mt-2 mb-6 bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between max-w-xs shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sponsoring Volume</span>
                              <span className="text-xl font-black text-slate-950 mt-0.5">
                                ₹{totalVolume.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 w-full max-w-7xl mx-auto px-2">
                            {sponsorList.map((item, idx) => {
                              const amt = Number(item.balance || item.amount || 0);
                              const cardId = `spn-${(item.name || 'sponsor').replace(/\s+/g, '-')}-${idx}`;
                              const card = {
                                id: cardId,
                                type: getCardType(amt),
                                tagName: getCardTagName(amt),
                                balance: amt,
                                cardmemberName: item.cardmemberName || item.name || 'Anonymous Sponsor',
                                isFrozen: !!frozenCards[cardId]
                              };
                              return (
                                <SponsorCardItem
                                  key={card.id}
                                  card={card}
                                  isSelected={selectedCardId === cardId}
                                  onSelect={() => setSelectedCardId(cardId)}
                                  onToggleFreeze={() => handleToggleFreeze(cardId)}
                                />
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="px-6 py-10 bg-white/5 border border-dashed border-white/15 rounded-2xl text-center flex flex-col items-center gap-3">
                    <span className="material-symbols-outlined text-4xl text-slate-500">handshake</span>
                    <p className="text-sm text-slate-300 font-semibold">
                      {sponsorshipEnabled === false
                        ? 'Sponsorships are coming soon.'
                        : 'No sponsors yet for this tournament.'}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                      {sponsorshipEnabled === false
                        ? 'Support this tournament through sponsorship. Sponsorships are coming soon.'
                        : 'Be the first backer — every contribution goes straight into the prize pool.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Content */}
          <div className="space-y-6">

            {/* Public Announcements / Notices */}
            {announcements.length > 0 && (
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
                <h4 className="font-bold text-base text-white tracking-wider uppercase flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400">campaign</span>
                  Public Notices
                </h4>
                <div className="space-y-3">
                  {announcements.map((notice) => (
                    <div key={notice.id} className="p-4 bg-black/35 border border-white/5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                          {notice.pin && <span className="material-symbols-outlined text-xs text-primary">push_pin</span>}
                          {notice.title}
                        </h5>
                        <span className="text-[8px] text-white/40 font-mono">{notice.time}</span>
                      </div>
                      <p className="text-[11px] text-white/70 leading-relaxed whitespace-pre-line">{notice.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      </main>

      {/* TOAST */}
      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ duration: 0.2 }}
            className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 bg-surface border border-primary/30 text-on-background px-3.5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-[300px] text-xs font-bold">
            <span className="material-symbols-outlined text-primary text-base shrink-0">check_circle</span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      {/* SPONSOR FORM MODAL */}
      <AnimatePresence>
        {showSponsorForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4"
            onClick={closeSponsorModal}
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
            <motion.div initial={{ y: 48, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 48, opacity: 0, scale: 0.98 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md flex flex-col max-h-[94vh] sm:max-h-[92vh] shadow-2xl"
              onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Sponsor this tournament">

              {sponsorSuccess ? (
                /* SUCCESS STATE */
                <div className="flex flex-col items-center text-center gap-4 px-6 sm:px-8 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-600 text-[32px]">verified</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Contribution Submitted</h3>
                    <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                      Your sponsorship contribution has been submitted for admin verification.
                    </p>
                  </div>
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-center gap-2.5 text-left">
                    <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">schedule</span>
                    <p className="text-xs font-bold text-amber-800">Status: Pending Verification</p>
                  </div>
                  <button type="button" onClick={closeSponsorModal}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all min-h-[44px]">
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 leading-tight">Sponsor This Tournament</h3>
                        <p className="text-[10px] text-slate-500 pt-0.5">Step {sponsorStep} of 3</p>
                      </div>
                    </div>
                    <button onClick={closeSponsorModal}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>

                  {/* Step pills + label */}
                  <div className="px-4 sm:px-5 pt-4">
                    <div className="flex gap-1.5">
                      {[
                        { n: 1, label: 'Your Details' },
                        { n: 2, label: 'UPI Payment' },
                        { n: 3, label: 'Proof & Submit' }
                      ].map(s => (
                        <div key={s.n} className="flex-1">
                          <div className={`h-1 rounded-full transition-colors ${sponsorStep >= s.n ? 'bg-blue-600' : 'bg-slate-200'}`} />
                          <p className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${sponsorStep >= s.n ? 'text-blue-600' : 'text-slate-400'}`}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
                    {/* STEP 1: Your Details */}
                    {sponsorStep === 1 && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Your Name *</label>
                          <input type="text" value={sponsorForm.name}
                            onChange={e => { if (!currentUser) setSponsorForm(f => ({ ...f, name: e.target.value })); }}
                            readOnly={!!currentUser}
                            placeholder="Enter your name"
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400 ${currentUser ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-900'}`} />
                          {currentUser && <p className="text-[10px] text-blue-600 font-medium mt-1">Autofilled from your account</p>}
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Contribution Amount (₹) *</label>
                          <div className="grid grid-cols-4 gap-2 mb-2">
                            {['50', '100', '250', '500'].map(t => (
                              <button key={t} type="button"
                                onClick={() => setSponsorForm(f => ({ ...f, amount: t }))}
                                className={`py-2 rounded-lg text-xs font-bold border transition-all ${sponsorForm.amount === t ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600'}`}>
                                ₹{t}
                              </button>
                            ))}
                          </div>
                          <input type="number" min="1" value={sponsorForm.amount} onChange={e => setSponsorForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="Or enter a custom amount"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Message (optional)</label>
                          <textarea value={sponsorForm.message} onChange={e => setSponsorForm(f => ({ ...f, message: e.target.value }))}
                            placeholder="Write a message for the tournament..."
                            rows={2}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400 resize-none" />
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Your contribution goes directly into the tournament prize pool and appears on the public sponsor wall once verified.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* STEP 2: UPI Payment */}
                    {sponsorStep === 2 && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2.5">
                          <p className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">qr_code</span> Pay via UPI
                          </p>
                          <p className="text-sm text-slate-700">
                            Send <span className="font-black text-slate-900">₹{parseInt(sponsorForm.amount || 0).toLocaleString('en-IN')}</span> to:
                          </p>
                          <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2">
                            <span className="text-sm font-mono font-bold text-slate-900 truncate">matchdistrict@upi</span>
                            <button type="button" onClick={() => { navigator.clipboard.writeText('matchdistrict@upi').catch(() => {}); triggerToast('UPI ID copied!'); }}
                              className="shrink-0 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition-colors">
                              Copy
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500">Account Holder: Match District</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">info</span>
                          <p className="text-[11px] text-amber-800 font-semibold leading-relaxed">
                            After payment, proceed to upload your transaction screenshot and ID for verification.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* STEP 3: Proof & Submit */}
                    {sponsorStep === 3 && (
                      <div className="space-y-4">
                        {/* Single consolidated error alert — no duplicate */}
                        {sponsorError && (
                          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
                            <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-px">error</span>
                            <p className="text-xs font-semibold text-red-700 leading-snug min-w-0">{sponsorError}</p>
                          </div>
                        )}

                        {/* ── PAYMENT SCREENSHOT CARD ── */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Payment Screenshot</label>

                          {!sponsorScreenshot ? (
                            /* STATE 1 — EMPTY: tap to open file picker */
                            <button
                              type="button"
                              id="sponsor-select-screenshot-btn"
                              onClick={openFilePicker}
                              className="w-full border-2 border-dashed border-slate-300 rounded-xl px-4 py-8 text-center hover:border-blue-400 hover:bg-blue-50/40 active:scale-[0.99] transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-4xl text-slate-300 block mx-auto mb-1">add_photo_alternate</span>
                              <p className="text-xs font-semibold text-slate-600 mt-1">Select payment screenshot</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG or WebP · max 10 MB</p>
                            </button>
                          ) : (
                            /* STATES 2-5: preview card */
                            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                              {/* Preview image */}
                              <div className="relative bg-slate-50">
                                <img
                                  src={sponsorScreenshotPreview || ''}
                                  alt="Payment screenshot preview"
                                  className="max-h-40 w-full object-contain"
                                />
                                {/* Change image pill — top-right corner */}
                                {!sponsorUploading && !sponsorSubmitting && (
                                  <button
                                    type="button"
                                    id="sponsor-change-screenshot-btn"
                                    onClick={openFilePicker}
                                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors"
                                  >
                                    Change
                                  </button>
                                )}
                              </div>

                              {/* Status row */}
                              <div className="px-3.5 py-3">
                                {/* File name + actions */}
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-[11px] text-slate-500 truncate min-w-0">{sponsorScreenshot?.name || 'Screenshot'}</p>
                                  <button
                                    type="button"
                                    id="sponsor-remove-screenshot-btn"
                                    onClick={removeSponsorScreenshot}
                                    disabled={sponsorUploading || sponsorSubmitting}
                                    className="shrink-0 text-[11px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                </div>

                                {sponsorUploading ? (
                                  /* STATE 3 — UPLOADING */
                                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                                    <span className="w-4 h-4 shrink-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-[11px] font-semibold text-blue-700">Uploading screenshot…</p>
                                  </div>
                                ) : sponsorUploadedUrl ? (
                                  /* STATE 4 — UPLOADED ✓ */
                                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                                    <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check_circle</span>
                                    <p className="text-[11px] font-bold text-emerald-700">Screenshot uploaded successfully</p>
                                  </div>
                                ) : sponsorUploadFailed ? (
                                  /* STATE 5 — FAILED */
                                  <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0">error_outline</span>
                                      <p className="text-[11px] font-semibold text-red-700">Upload failed. Please retry.</p>
                                    </div>
                                    <button
                                      type="button"
                                      id="sponsor-retry-upload-btn"
                                      onClick={uploadSponsorScreenshot}
                                      className="shrink-0 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                ) : (
                                  /* STATE 2 — SELECTED, not yet uploaded */
                                  <button
                                    type="button"
                                    id="sponsor-upload-screenshot-btn"
                                    onClick={uploadSponsorScreenshot}
                                    disabled={sponsorUploading || sponsorSubmitting}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white text-[13px] font-bold py-2.5 rounded-lg shadow-sm transition-all min-h-[44px]"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                                    Upload Screenshot
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Hidden native file input — never triggers form submit */}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={e => {
                              // Capture the file BEFORE resetting the input value
                              const f = e.target.files?.[0];
                              // Reset so the same file can be re-selected if needed
                              e.target.value = '';
                              // Clear the isPickingFile guard now that we have the result
                              isPickingFile.current = false;
                              handleSponsorScreenshotFile(f);
                            }}
                          />
                        </div>

                        {/* ── UPI TRANSACTION ID ── */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">UPI Transaction ID *</label>
                          <input
                            type="text"
                            value={sponsorForm.transaction_id}
                            onChange={e => setSponsorForm(f => ({ ...f, transaction_id: e.target.value }))}
                            placeholder="e.g. UPI0123456789"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400"
                          />
                        </div>

                        {/* ── PAYMENT APP ── */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Payment App</label>
                          <select
                            value={sponsorForm.payment_app}
                            onChange={e => setSponsorForm(f => ({ ...f, payment_app: e.target.value }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                          >
                            <option value="">Select app</option>
                            <option value="Google Pay">Google Pay</option>
                            <option value="PhonePe">PhonePe</option>
                            <option value="Paytm">Paytm</option>
                            <option value="BHIM">BHIM</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sticky footer — always reachable on mobile */}
                  <div className="sticky bottom-0 z-10 bg-white border-t border-slate-200 px-4 sm:px-5 py-3 rounded-b-2xl">
                    {sponsorStep === 1 && (
                      <button type="button" onClick={() => {
                        setSponsorError('');
                        if (!sponsorForm.name.trim()) { triggerToast('Please enter your name.'); return; }
                        if (!sponsorForm.amount || parseInt(sponsorForm.amount) <= 0) { triggerToast('Please enter a valid amount.'); return; }
                        setSponsorStep(2);
                      }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all min-h-[44px]">
                        Next — Payment
                      </button>
                    )}
                    {sponsorStep === 2 && (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setSponsorStep(1)}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors min-h-[44px]">
                          Back
                        </button>
                        <button type="button" onClick={() => { setSponsorError(''); setSponsorStep(3); }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all min-h-[44px]">
                          I've Paid — Next
                        </button>
                      </div>
                    )}
                    {sponsorStep === 3 && (
                      <div className="space-y-2.5">
                        {/* Helper hint when not all preconditions are met */}
                        {!(sponsorUploadedUrl && sponsorForm.transaction_id.trim() && sponsorForm.payment_app) && !sponsorSubmitting && (
                          <p className="text-[10px] text-slate-400 text-center leading-snug">
                            {!sponsorUploadedUrl
                              ? (sponsorUploadFailed ? 'Upload failed — retry before submitting.' : !sponsorScreenshot ? 'Select & upload your payment screenshot to continue.' : 'Upload your screenshot before submitting.')
                              : !sponsorForm.transaction_id.trim()
                                ? 'Enter your UPI transaction ID to continue.'
                                : 'Select the payment app you used to continue.'}
                          </p>
                        )}
                        {/*
                          Footer action row:
                          • Back button: fixed compact width, secondary style
                          • Submit Contribution: grows to fill remaining space, primary CTA
                          At ≤340px the row wraps so Submit sits above Back.
                        */}
                        <div className="flex flex-wrap-reverse gap-2.5">
                          <button
                            type="button"
                            id="sponsor-back-btn-step3"
                            onClick={() => setSponsorStep(2)}
                            disabled={sponsorSubmitting}
                            className="flex-1 min-w-[80px] max-w-[100px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors min-h-[48px] disabled:opacity-60"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            id="sponsor-submit-contribution-btn"
                            onClick={handleSponsorContribute}
                            disabled={sponsorSubmitting || sponsorUploading || !sponsorUploadedUrl || !sponsorForm.transaction_id.trim() || !sponsorForm.payment_app}
                            className="flex-[3] min-w-[160px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-xl text-sm transition-all min-h-[48px] shadow-md shadow-blue-600/20 disabled:shadow-none"
                          >
                            {sponsorSubmitting ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                Submitting…
                              </span>
                            ) : 'Submit Contribution'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMING SOON MODAL */}
      <AnimatePresence>
        {showSponsorComingSoon && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-5"
            onClick={() => setShowSponsorComingSoon(false)}
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-[400px] shadow-xl relative overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sponsor-coming-soon-title"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowSponsorComingSoon(false)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close modal"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>

              <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-[28px] text-blue-600">volunteer_activism</span>
                </div>

                {/* Content */}
                <h3 id="sponsor-coming-soon-title" className="text-lg font-black text-slate-900 mb-2.5">
                  Sponsorship Coming Soon
                </h3>
                <p className="text-[13px] text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                  We're preparing the sponsorship feature for Match District. You'll soon be able to support tournaments and contribute directly to their prize pools.
                </p>

                {/* Primary Button */}
                <button
                  onClick={() => setShowSponsorComingSoon(false)}
                  className="w-full mt-7 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl text-sm transition-all"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discord Account Linking Toast Notification */}
      <AnimatePresence>
        {discordToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-md text-sm font-semibold max-w-md ${
              discordToast.type === 'error'
                ? 'bg-red-950/90 text-red-100 border-red-700/60 shadow-red-950/40'
                : 'bg-emerald-950/90 text-emerald-100 border-emerald-600/50 shadow-emerald-950/40'
            }`}
          >
            {discordToast.type === 'error' ? (
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            )}
            <span className="leading-tight">{discordToast.message}</span>
            <button
              type="button"
              onClick={() => setDiscordToast(null)}
              className="ml-auto text-xs opacity-60 hover:opacity-100 transition-opacity p-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TournamentDetail;
