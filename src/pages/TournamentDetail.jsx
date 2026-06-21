import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useUser } from '../UserContext.jsx';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js';
import { fetchJsonWithRetry, normalizeTournamentRow } from '../utils/api.js';
import { supabase } from '../utils/supabaseClient';
import { getAuthToken } from '../utils/getAuthToken.js';
import { uploadImage } from '../utils/cloudinaryUpload.js';
import VerificationBadge from '../components/VerificationBadge.jsx';
import { DEFAULT_CATEGORIES } from '../components/tournament-creation/steps/Step7Rules.jsx';
import SponsorCardItem from '../components/SponsorCardItem.jsx';

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

function TournamentDetail({ onNavigate, tournamentId }) {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sponsorList, setSponsorList] = useState([]);
  const [totalSponsorAmount, setTotalSponsorAmount] = useState(0);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [sponsorForm, setSponsorForm] = useState({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' });
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  const [sponsorScreenshot, setSponsorScreenshot] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [sponsorStep, setSponsorStep] = useState(1);
  
  // Custom states for premium sponsors cards interaction
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [frozenCards, setFrozenCards] = useState({});

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

  const generateMockCardDetails = (s, index) => {
    const seed = (s.name || '').charCodeAt(0) || index;
    const lastFour = String(1000 + (seed % 9000));
    const middleFour = String(2000 + ((seed * 17) % 8000));
    const firstEight = "4321 8976";
    const cardNumber = `${firstEight} ${middleFour} ${lastFour}`;
    const cvv = String(100 + (seed % 900));
    const expMonth = String(1 + (seed % 12)).padStart(2, '0');
    const expYear = String(26 + (seed % 5));
    const expiry = `${expMonth}/${expYear}`;
    return { cardNumber, cvv, expiry };
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
  const [slotsData, setSlotsData] = useState({ slotsTotal: 100, slotsFilled: 0, slotsAvailable: 100, slots: [] });

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/tournaments/${tournamentId}/registrations`)
      .then(res => res.json())
      .then(data => { if (data.success && data.registrations) setRegistrations(data.registrations); })
      .catch(() => {});

    fetch(`/api/tournaments/${tournamentId}/slots`)
      .then(res => res.json())
      .then(data => { if (data.success) setSlotsData(data); })
      .catch(() => {});
  }, [tournamentId]);

  const [tournamentsList, setTournamentsList] = useState([]);
  const [tournamentRow, setTournamentRow] = useState(null);
  const [isTournamentsLoading, setIsTournamentsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) { setIsTournamentsLoading(false); return; }
    setIsTournamentsLoading(true);
    setLoadError(null);
    const { ok, data, error } = await fetchJsonWithRetry(`/api/tournaments/${tournamentId}`);
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

  useRefetchOnFocus(loadTournament, !!tournamentId);
  useRefetchOnFocus(loadTournamentsList);

  useEffect(() => {
    if (!tournamentId) return;
    const channel = supabase
      .channel(`tournament-detail-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, (payload) => {
        if (payload.eventType === 'INSERT') setTournamentsList(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') { setTournamentsList(prev => prev.map(t => t.id === payload.new.id ? payload.new : t)); if (payload.new.id === tournamentId) setTournamentRow(payload.new); }
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId]);

  const tourney = useMemo(() => normalizeTournamentRow(tournamentRow), [tournamentRow]);
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

  // Fetch approved sponsor data for public wall
  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/tournament/${tournamentId}/sponsors/public`)
      .then(r => r.json()).then(d => {
        if (d.success) { setSponsorList(d.sponsors || []); setTotalSponsorAmount(d.totalContributions || 0); }
      }).catch(() => {});
  }, [tournamentId]);

  // Main countdown timer
  useEffect(() => {
    if (!tourney) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' }); return; }
    let target = null; let label = ''; let type = '';
    const s = (tourney.status || '').toLowerCase();
    if (s === 'completed' || s === 'archived') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Tournament Ended', active: true, type: 'ended' }); return; }
    if (s === 'live') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'LIVE NOW', active: true, type: 'live' }); return; }
    if (tourney.registrationCloseDate && new Date(tourney.registrationCloseDate) > new Date()) {
      target = new Date(tourney.registrationCloseDate); label = 'Registration Closes In'; type = 'registration';
    } else if (tourney.startDate && new Date(tourney.startDate) > new Date()) {
      target = new Date(tourney.startDate); label = 'Tournament Starts In'; type = 'start';
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
    if (notices && notices.length > 0) return notices.map(n => ({ id: n.id, title: n.title, text: n.text, pin: n.pin, time: n.created_at ? new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today' }));
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
    return registrations.find(r => r.user_id === currentUser.id || r.captain.toLowerCase() === currentUser.gamerTag?.toLowerCase() || r.captain.toLowerCase() === `@${currentUser.gamerTag?.toLowerCase()}` || r.captain.toLowerCase() === currentUser.name?.toLowerCase());
  }, [currentUser, registrations]);

  const isRegistered = !!myRoster;

  // Safe case-insensitive approved check for coordinates access
  const isApprovedRoster = useMemo(() => {
    if (!myRoster) return false;
    const status = (myRoster.status || '').toLowerCase();
    return status === 'approved' || status === 'confirmed';
  }, [myRoster]);

  const rosterStatus = myRoster?.status || '';
  const canReRegister = ['Cancelled', 'Expired', 'Rejected', 'PAYMENT_REJECTED'].includes(rosterStatus);
  const isPendingPayment = ['pending_payment', 'PENDING_PAYMENT_VERIFICATION'].includes(rosterStatus);
  const isPendingApproval = rosterStatus === 'pending';

  const getButtonConfig = () => {
    if (!myRoster) return { text: 'Join Now', icon: 'arrow_forward', style: 'primary', disabled: false };
    if (isApprovedRoster) return { text: 'Registered ✓', icon: 'check_circle', style: 'approved', disabled: true };
    if (isPendingPayment) return { text: 'Waiting for Verification', icon: 'hourglass_top', style: 'warning', disabled: true };
    if (isPendingApproval) return { text: 'Waiting for Approval', icon: 'hourglass_top', style: 'warning', disabled: true };
    if (rosterStatus === 'PAYMENT_REJECTED') return { text: 'Payment Rejected — Re-register', icon: 'refresh', style: 'danger', disabled: false };
    if (canReRegister) return { text: 'Join Now', icon: 'arrow_forward', style: 'primary', disabled: false };
    return { text: 'Pending', icon: 'hourglass_top', style: 'warning', disabled: true };
  };

  const btn = getButtonConfig();

  const btnStyles = {
    primary: 'bg-primary hover:bg-primary/95 text-on-primary shadow-lg',
    approved: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed',
    warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-not-allowed',
    danger: 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
  };

  const triggerToast = (msg) => { setToastMessage(msg); setShowToast(true); setTimeout(() => setShowToast(false), 4000); };

  const handleRegister = () => {
    if (!currentUser) { triggerToast('Please sign in to register!'); setTimeout(() => onNavigate && onNavigate('login'), 1200); return; }
    if (isRegistered && !canReRegister) {
      triggerToast('Already registered for this tournament!');
      return;
    }
    navigate(`/tournaments/${tournamentId}/register`);
  };

  const handleRateHost = (ratingValue) => {
    setUserRating(ratingValue);
    const newCount = reviewsCount + (userRating > 0 ? 0 : 1);
    const newAverage = parseFloat(((hostRating * reviewsCount + ratingValue - (userRating > 0 ? userRating : 0)) / newCount).toFixed(1));
    setHostRating(newAverage);
    setReviewsCount(newCount);
    triggerToast(`Thanks for rating this host ${ratingValue} stars!`);
  };

  const handleSponsorContribute = async (e) => {
    e.preventDefault();
    if (!sponsorForm.name.trim() || !sponsorForm.amount || parseInt(sponsorForm.amount) <= 0) { triggerToast('Please enter your name and a valid contribution amount.'); return; }
    if (!sponsorForm.transaction_id.trim()) { triggerToast('Please enter your UPI transaction ID for verification.'); return; }
    setSponsorSubmitting(true);
    try {
      let screenshot_url = '';
      if (sponsorScreenshot) {
        const uploaded = await uploadImage(sponsorScreenshot);
        if (uploaded?.secure_url) screenshot_url = uploaded.secure_url;
      }
      const res = await fetch(`/api/tournament/${tournamentId}/sponsor/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor_name: sponsorForm.name.trim(),
          contributor_email: sponsorForm.email.trim() || undefined,
          amount: parseInt(sponsorForm.amount),
          message: sponsorForm.message.trim() || undefined,
          transaction_id: sponsorForm.transaction_id.trim(),
          payment_app: sponsorForm.payment_app || undefined,
          screenshot_url: screenshot_url || undefined
        })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution submitted for admin review!'); setShowSponsorForm(false); setSponsorForm({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' }); setSponsorScreenshot(null); setSelectedTier(null); setSponsorStep(1); }
      else triggerToast(data.message || 'Failed to submit contribution.');
    } catch (e) { triggerToast('Network error submitting contribution.'); } finally { setSponsorSubmitting(false); }
  };

  const handleShare = () => {
    const sharePrize = prizeDisplay;
    const gameMode = `${(tourney?.perspective || 'TPP').toUpperCase()} - ${formatLabel(tourney?.match_type)}`;
    const deadline = countdown.type === 'registration' ? 'Registration Closing Soon' : countdown.type === 'start' ? 'Tournament Starting Soon' : countdown.type === 'live' ? 'LIVE NOW' : 'Register Now';
    const shareMessage = `Hurry up! Registrations are filling fast.\n\n🏆 Prize Pool: ${sharePrize}\n\n🎮 ${tourney?.game} ${gameMode} Tournament\n\n⏰ ${deadline}\n\nJoin Now:\n${window.location.href}`;
    if (navigator.share) {
      navigator.share({ title: tourney?.title, text: shareMessage, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareMessage); triggerToast('Tournament details copied!');
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
  const prizeDisplay = formatIndianCurrency(tourney?.prize_pool_amount || tourney?.prizePool || tourney?.prize);
  const slotTotal = tourney?.slotsTotal || slotsData?.slotsTotal || 100;
  const slotFilled = slotsData?.slotsFilled ?? (registrations ? registrations.filter(r => !['cancelled','expired','rejected'].includes((r.status || '').toLowerCase())).length : 0);
  const slotAvailable = Math.max(0, slotTotal - slotFilled);
  const fillPercent = Math.min(100, Math.round((slotFilled / slotTotal) * 100));

  const formatLabel = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

  const startDateStr = tourney?.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? startDateStr.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const formattedTime = startDateStr ? startDateStr.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

  // Generate prize distribution split lists
  const prizeDistributions = useMemo(() => {
    if (!tourney) return [];
    const list = [];
    const pool = parseInt(tourney.prize_pool_amount || tourney.prizePool || tourney.prize, 10) || 0;

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

      list.push({ position: '1st Place', prize: firstVal, badge: '🥇', badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' });
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
  }, [tourney]);

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

  if (isTournamentsLoading) return <LoadingScreen message="Loading Tournament Coordinates..." />;

  return (
    <div 
      className="min-h-screen bg-[#07080C] text-white relative overflow-x-hidden w-full max-w-[100vw] selection:bg-primary/30 selection:text-white"
      style={{
        backgroundImage: 'radial-gradient(#1a1c29 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px'
      }}
    >
      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="flex-1 flex flex-col items-center w-full px-4 md:px-margin-desktop py-20 md:py-24 touch-scroll max-w-[100vw]">
        <div className="w-full max-w-[1280px] space-y-8 pb-32">
          
          {/* Hero Section - Side-by-side poster + condensed details */}
          <section className="flex flex-col w-full">
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-slate-200 p-4 sm:p-6 w-full">
              
              {/* Side-by-side: Poster + Top Details */}
              <div className="flex flex-row items-start gap-4 w-full">
                
                {/* Poster Left */}
                <div className="w-[110px] sm:w-[140px] md:w-[220px] lg:w-[280px] shrink-0">
                  <img 
                     className="w-full aspect-[3/4] object-cover rounded-xl shadow-lg"
                    src={tourney.cover_image_url || tourney.bannerUrl || FALLBACK_IMG}
                    alt="Tournament Poster"
                  />
                </div>

                {/* Details Right */}
                <div className="flex-1 flex flex-col items-start justify-start md:justify-center text-left min-w-0">
                  
                  {/* Title */}
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight line-clamp-2 break-words">
                    {tourney.title}
                  </h1>

                  {/* Organizer */}
                  <div className="text-xs sm:text-sm font-bold text-slate-500 flex items-center gap-1 mt-1">
                    <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full overflow-hidden shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-[6px] sm:text-[7px] text-slate-500">
                      {tourney?.orgLogo || orgProfile?.avatar ? (
                        <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                      ) : (
                        (orgProfile?.orgName || tourney.orgName || 'MD').slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="truncate">{orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>

                  {/* Data Grid - 2x2 unified */}
                  <div className="grid grid-cols-2 gap-y-4 gap-x-4 w-full mt-4">
                    {/* Prize */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prize</span>
                      <span className="text-sm sm:text-base font-extrabold text-green-600">{prizeDisplay}</span>
                    </div>
                    {/* Entry */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry</span>
                      <span className="text-sm sm:text-base font-extrabold text-amber-600">{entryDisplay}</span>
                    </div>
                    {/* Format */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FORMAT</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                        {formatLabel(tourney.match_type)} &bull; {(tourney.perspective || 'TPP').toUpperCase()}
                      </span>
                    </div>
                    {/* Slots */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SLOTS</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                        <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{slotFilled}/{slotTotal}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="flex items-center justify-between mt-4 sm:mt-5 pt-4 border-t border-slate-100">
                <button
                  onClick={handleRegister}
                  disabled={btn.disabled}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 sm:py-3 px-5 sm:px-6 rounded-xl flex-1 shadow-sm transition-all text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {btn.text}
                </button>
                {getGameLogo(tourney.game) && (
                  <img 
                    src={getGameLogo(tourney.game)} 
                    alt={tourney.game} 
                    className="shrink-0 rounded-xl overflow-hidden border border-slate-200 object-cover h-[40px] sm:h-[48px] w-[40px] sm:w-[48px] ml-2 sm:ml-3" 
                  />
                )}
              </div>
            </div>
          </section>

          {/* Registration Countdown Banner */}
          {countdown.active && (countdown.type === 'registration' || countdown.type === 'start') && (
            <div className="mt-4 bg-white border border-slate-100 shadow-sm rounded-xl p-3 flex items-center justify-between w-full">
              <span className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-widest">Registration Closes In</span>
              <div className="text-sm sm:text-base font-black text-blue-700 bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
                {countdown.days > 0 ? `${countdown.days}d ` : ''}
                {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Tabs */}
          <div className="mt-8 border-b border-slate-200 w-full overflow-hidden">
            <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap pb-3 scrollbar-hide touch-pan-x">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'prize', label: 'Prize Pool' },
                { id: 'roadmap', label: 'Roadmap' },
                { id: 'rules', label: 'Rules & Regulations' },
                { id: 'teams', label: 'Registered Teams' },
                { id: 'sponsors', label: 'Sponsors' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    activeTab === tab.id
                      ? 'text-blue-600 font-bold border-b-2 border-blue-600 pb-2 whitespace-nowrap'
                      : 'text-slate-400 hover:text-slate-600 pb-2 cursor-pointer whitespace-nowrap'
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
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
                    <h3 className="text-xs font-black text-slate-800 tracking-widest uppercase mb-2">About Tournament</h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{tourney?.description || 'No description provided for this tournament.'}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
                    <h3 className="text-xs font-black text-slate-800 tracking-widest uppercase mb-2">About Organizer</h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{orgProfile?.bio || tourney?.orgBio || 'No description provided for this organizer.'}</p>
                  </div>
                </div>

                {/* Right Column: Organizer Profile Card */}
                <div className="w-full lg:w-[320px] shrink-0">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-500">
                        {tourney?.orgLogo || orgProfile?.avatar ? (
                          <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                          (orgProfile?.orgName || tourney?.orgName || 'MD').slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 truncate">{orgProfile?.orgName || tourney?.orgName || orgProfile?.name || 'Organizer'}</span>
                          <VerificationBadge tier={orgProfile?.tier || tourney?.orgTier} size="xs" />
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {[1,2,3,4,5].map(star => (
                            <svg key={star} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                          <span className="text-sm font-bold text-slate-700 ml-1">4.8 <span className="text-slate-400 font-medium">(120 reviews)</span></span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs font-bold text-slate-500">
                          <span>🎮 {orgProfile?.totalTournaments || tourney?.orgTotalHosted || 12} Tournaments Hosted</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
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
              <div className="flex flex-col gap-3 max-w-2xl">
                {prizeDistributions.length > 0 ? prizeDistributions.map((row, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <span className="text-slate-800 font-bold text-sm">{row.position}</span>
                    <span className="text-green-600 font-black text-sm">{row.prize}</span>
                  </div>
                )) : (
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-sm">No prize distribution data available.</div>
                )}
              </div>
            )}
            {activeTab === 'roadmap' && (
              <div className="flex items-center gap-4 overflow-x-auto pb-4 w-full scrollbar-hide">
                {parsedTimeline.roadmap && parsedTimeline.roadmap.length > 0 ? (
                  parsedTimeline.roadmap.map((round, index) => (
                    <React.Fragment key={round.id || index}>
                      <div className="min-w-[180px] sm:min-w-[220px] bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col shrink-0">
                        <h4 className="font-black text-slate-900 text-base sm:text-lg mb-2">{round.title || `Qualifier ${index + 1}`}</h4>
                        <div className="space-y-1.5 text-xs text-slate-500 font-medium">
                          <p className="flex items-center gap-1.5 sm:gap-2">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{round.date ? new Date(round.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span>
                          </p>
                          <p className="flex items-center gap-1.5 sm:gap-2">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{round.time || 'TBD'}</span>
                          </p>
                          <p className="flex items-center gap-1.5 sm:gap-2">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Map: <span className="font-bold text-slate-700">{round.map || 'TBD'}</span></span>
                          </p>
                        </div>
                        {round.qualified && (
                          <div className="mt-3 sm:mt-4 bg-green-50/80 text-green-700 text-xs font-bold px-2.5 py-1.5 rounded-md border border-green-100 w-fit flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Qualifies: {round.qualified}</span>
                          </div>
                        )}
                      </div>
                      {index < parsedTimeline.roadmap.length - 1 && (
                        <div className="text-slate-300 shrink-0">
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <div className="text-slate-500 p-6 bg-slate-50 rounded-xl border border-slate-100 w-full">
                    No roadmap rounds scheduled yet.
                  </div>
                )}
              </div>
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
                    <div key={idx} className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                      <button
                        onClick={() => setOpenRule(openRule === idx ? null : idx)}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors font-bold text-slate-800 text-left"
                      >
                        <span className={`text-sm uppercase tracking-wider ${cat.custom ? 'text-blue-600' : 'text-slate-700'}`}>{cat.title}</span>
                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openRule === idx ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openRule === idx && (
                        <div className="p-4 border-t border-slate-100 text-slate-600 text-sm leading-relaxed whitespace-pre-wrap space-y-1.5">
                          {cat.items.map((item, i) => (
                            <p key={i} className="flex items-start gap-2">
                              <span className="text-slate-300 mt-0.5">•</span>
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
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Live Slot Occupancy Map</h3>

                <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-2.5 w-full">
                  {Array.from({ length: slotTotal }, (_, i) => {
                    const slotNum = i + 1;
                    const slotInfo = slotsData?.slots?.find(s => s.number === slotNum);
                    if (slotInfo?.status === 'occupied') {
                      return (
                        <div key={i} className="aspect-square bg-red-50 border border-red-200 text-red-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs" title={`Occupied by ${slotInfo.teamName}`}>
                          {slotNum}
                        </div>
                      );
                    }
                    if (slotInfo?.status === 'pending') {
                      return (
                        <div key={i} className="aspect-square bg-amber-50 border border-amber-200 text-amber-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs animate-pulse" title={`Pending: ${slotInfo.teamName}`}>
                          {slotNum}
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="aspect-square bg-green-50 border border-green-200 text-green-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs" title="Available">
                        {slotNum}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span>Occupied</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Pending</span>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'sponsors' && (
              <div className="w-full max-w-7xl">
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div className="text-left">
                    <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Tournament Sponsors</h3>
                    <p className="text-xs text-slate-400 mt-1">Premium corporate and community contributions directly backing the prize pool.</p>
                  </div>
                  <button onClick={() => setShowSponsorForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all tracking-wide shadow-md shadow-blue-600/10">
                    Become a Sponsor
                  </button>
                </div>

                {sponsorList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 w-full max-w-7xl mx-auto px-2">
                    {sponsorList.map((s, i) => {
                      const amt = parseInt(s.amount) || 0;
                      const cardId = s.id || `spn-${i}`;
                      const card = {
                        id: cardId,
                        type: getCardType(amt),
                        tagName: getCardTagName(amt),
                        balance: amt,
                        cardmemberName: s.name,
                        ...generateMockCardDetails(s, i),
                        isFrozen: !!frozenCards[cardId]
                      };

                      return (
                        <SponsorCardItem
                          key={cardId}
                          card={card}
                          isSelected={selectedCardId === cardId}
                          onSelect={() => setSelectedCardId(cardId)}
                          onToggleFreeze={() => handleToggleFreeze(cardId)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 bg-[#0c0d12]/45 border border-white/5 rounded-2xl text-slate-400 text-sm font-medium text-center">
                    No sponsors yet for this tournament. Be the first to sponsor!
                  </div>
                )}

                {totalSponsorAmount > 0 && (
                  <div className="w-full mt-8 p-5 bg-[#0c0d12]/60 border border-white/5 rounded-2xl text-sm text-slate-300 flex items-center justify-between backdrop-blur-md">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] tracking-widest font-mono uppercase font-bold text-slate-400">Total Backed Volume</span>
                      <span className="text-xs text-slate-500 font-medium">Accumulated verified sponsor allocations.</span>
                    </div>
                    <span className="font-display text-xl sm:text-2xl font-black text-emerald-400">₹{totalSponsorAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Sponsor Form Modal — 3-Step Wizard */}
                {showSponsorForm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowSponsorForm(false); setSponsorStep(1); } }}>
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">Sponsor This Tournament</h4>

                      {/* Step Indicator */}
                      <div className="flex items-center gap-2 mb-6">
                        {[1, 2, 3].map(s => (
                          <React.Fragment key={s}>
                            <div className={`flex items-center gap-1.5 ${s <= sponsorStep ? 'text-blue-700' : 'text-slate-300'}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${s <= sponsorStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</div>
                              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">{s === 1 ? 'Details' : s === 2 ? 'Pay' : 'Proof'}</span>
                            </div>
                            {s < 3 && <div className={`flex-1 h-px ${sponsorStep > s ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* STEP 1: Basic Details & Tier Selection */}
                      {sponsorStep === 1 && (
                        <div className="space-y-4">
                          <p className="text-xs text-slate-500 font-medium">Enter your details and choose a contribution amount.</p>

                          <div className="grid grid-cols-2 gap-3">
                            <input
                              value={sponsorForm.name}
                              onChange={e => setSponsorForm(p => ({ ...p, name: e.target.value }))}
                              placeholder="Full Name" required
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                            />
                            <input
                              value={sponsorForm.email}
                              onChange={e => setSponsorForm(p => ({ ...p, email: e.target.value }))}
                              placeholder="Email Address" type="email"
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                            />
                          </div>

                          <input
                            value={sponsorForm.message}
                            onChange={e => setSponsorForm(p => ({ ...p, message: e.target.value }))}
                            placeholder="WhatsApp Number (10 digits)"
                            type="tel" maxLength={10}
                            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                          />

                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contribution Amount (₹)</p>
                            <input
                              type="number"
                              min="1"
                              value={sponsorForm.amount}
                              onChange={e => setSponsorForm(p => ({ ...p, amount: e.target.value }))}
                              placeholder="Enter custom amount (₹)..."
                              className="w-full text-lg font-black bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white rounded-xl p-3 text-slate-900 transition-all outline-none"
                            />
                          </div>

                          <button type="button" onClick={() => setSponsorStep(2)}
                            disabled={!sponsorForm.name.trim() || !sponsorForm.email.trim() || !sponsorForm.message.trim() || sponsorForm.message.trim().length !== 10 || !sponsorForm.amount || parseInt(sponsorForm.amount) <= 0}
                            className="w-full py-3 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                            Proceed to Payment
                          </button>
                        </div>
                      )}

                      {/* STEP 2: Live UPI Payment Execution */}
                      {sponsorStep === 2 && (
                        <div className="space-y-4">
                          <p className="text-sm text-slate-700 font-bold">
                            Pay exactly <span className="text-blue-600">₹{parseInt(sponsorForm.amount) || 0}</span> using any UPI application below, then click next to submit proof.
                          </p>

                          <a
                            href={`upi://pay?pa=matchdistrict@upi&pn=MatchDistrict&am=${parseInt(sponsorForm.amount) || 0}&cu=INR`}
                            target="_blank" rel="noopener noreferrer"
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 w-full transition-all">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            Open UPI App
                          </a>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                            <p className="text-xs text-slate-500">Pay to <span className="font-bold text-blue-600">matchdistrict@upi</span></p>
                            <div className="flex items-center gap-2">
                              <input readOnly value={`upi://pay?pa=matchdistrict@upi&pn=MatchDistrict&am=${parseInt(sponsorForm.amount) || 0}&cu=INR`}
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 font-mono" />
                              <button type="button" onClick={() => { navigator.clipboard.writeText(`upi://pay?pa=matchdistrict@upi&pn=MatchDistrict&am=${parseInt(sponsorForm.amount) || 0}&cu=INR`); triggerToast('UPI link copied!'); }}
                                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all">
                                Copy
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setSponsorStep(1)}
                              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:text-slate-700 transition-all">
                              Back
                            </button>
                            <button type="button" onClick={() => setSponsorStep(3)}
                              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all">
                              I Have Paid, Next
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 3: Transaction Proof Submission */}
                      {sponsorStep === 3 && (
                        <form onSubmit={handleSponsorContribute} className="space-y-4">
                          <p className="text-xs text-slate-500 font-medium">Enter your transaction details and upload the payment screenshot for verification.</p>

                          <input
                            value={sponsorForm.transaction_id}
                            onChange={e => setSponsorForm(p => ({ ...p, transaction_id: e.target.value }))}
                            placeholder="UPI Transaction ID / UTR Number"
                            required
                            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                          />

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-500">Upload Payment Screenshot</p>
                            <input type="file" accept="image/*" onChange={e => setSponsorScreenshot(e.target.files?.[0] || null)}
                              className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setSponsorStep(2)}
                              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:text-slate-700 transition-all">
                              Back
                            </button>
                            <button type="submit" disabled={sponsorSubmitting}
                              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 transition-all">
                              {sponsorSubmitting ? 'Submitting...' : 'Submit Sponsorship'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
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
    </div>
  );
}

export default TournamentDetail;
