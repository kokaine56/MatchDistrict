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
import VerificationBadge from '../components/VerificationBadge.jsx';
import { DEFAULT_CATEGORIES } from '../components/tournament-creation/steps/Step7Rules.jsx';

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
  
  // Search and tabs states
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [mobileTab, setMobileTab] = useState('overview'); // 'overview' | 'rules' | 'teams' | 'prizes_slots'
  const [desktopTab, setDesktopTab] = useState('brief'); // 'brief' | 'rules'
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

  const [currentUser] = useCurrentUser();
  const { signOut } = useUser();
  const [slotsData, setSlotsData] = useState({ slotsTotal: 100, slotsFilled: 0, slotsAvailable: 100, slots: [] });
  const [isPassPopped, setIsPassPopped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
      const res = await fetch(`/api/tournament/${tournamentId}/sponsor/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor_name: sponsorForm.name.trim(),
          contributor_email: sponsorForm.email.trim() || undefined,
          amount: parseInt(sponsorForm.amount),
          message: sponsorForm.message.trim() || undefined,
          transaction_id: sponsorForm.transaction_id.trim(),
          payment_app: sponsorForm.payment_app || undefined
        })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution submitted for admin review!'); setShowSponsorForm(false); setSponsorForm({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' }); }
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

  const formatLabel = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

  const startDateStr = tourney?.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? startDateStr.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const formattedTime = startDateStr ? startDateStr.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

  // Generate prize distribution split lists
  const prizeDistributions = useMemo(() => {
    if (!tourney) return [];
    const list = [];
    const pool = parseInt(tourney.prize_pool_amount || tourney.prizePool || tourney.prize, 10) || 0;
    const firstVal = tourney.prize_split_1st || (pool > 0 ? `₹${Math.round(pool * 0.5).toLocaleString('en-IN')}` : '50%');
    const secondVal = tourney.prize_split_2nd || (pool > 0 ? `₹${Math.round(pool * 0.3).toLocaleString('en-IN')}` : '30%');
    const thirdVal = tourney.prize_split_3rd || (pool > 0 ? `₹${Math.round(pool * 0.2).toLocaleString('en-IN')}` : '20%');

    list.push({ position: '1st Place', prize: firstVal, badge: '🥇', badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' });
    list.push({ position: '2nd Place', prize: secondVal, badge: '🥈', badgeBg: 'bg-slate-400/20 text-slate-300 border border-slate-400/30' });
    list.push({ position: '3rd Place', prize: thirdVal, badge: '🥉', badgeBg: 'bg-amber-700/20 text-amber-600 border border-amber-700/30' });

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

  // Construct visual squad grid items (exactly 100 squad match slots)
  const gridCells = useMemo(() => {
    return Array.from({ length: 100 }, (_, i) => i < slotFilled);
  }, [slotFilled]);

  if (isTournamentsLoading) return <LoadingScreen message="Loading Tournament Coordinates..." />;

  if (!tourney) {
    return (
      <div className="min-h-screen bg-background text-on-background relative overflow-hidden">
        <Header activePage="tournament-detail" onNavigate={onNavigate} />
        <main className="max-w-md mx-auto px-4 py-32 text-center relative z-10 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="bg-surface-container-low/55 backdrop-blur-xl rounded-3xl p-8 space-y-6 shadow-lg">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 text-red-400">
              <span className="material-symbols-outlined text-3xl">error</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black uppercase text-on-background tracking-tight">
                {loadError ? 'Unable to Load Tournament' : 'Tournament Not Found'}
              </h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {loadError || 'The tournament you are looking for does not exist or has been removed by the organizer.'}
              </p>
            </div>
            {loadError && (
              <button type="button" onClick={loadTournament}
                className="w-full py-3 bg-surface-container hover:bg-surface text-on-background rounded-xl text-xs font-bold transition-all">
                Try Again
              </button>
            )}
            <button onClick={() => onNavigate && onNavigate('tournaments')}
              className="w-full py-3.5 bg-primary hover:bg-primary/95 text-on-primary rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Tournaments
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Common UI Renders
  const renderSlotTracker = () => {
    const fillPercent = Math.min(100, Math.round((slotFilled / slotTotal) * 100));
    return (
      <div className="bg-surface-container-low/20 rounded-xl border border-outline-variant/10 p-4 space-y-3">
        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">grid_view</span>
          Slot Allocations
        </h3>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="font-bold text-on-surface-variant">Lobby Occupancy</span>
            <span className="font-bold text-primary tabular-nums">{slotFilled}/{slotTotal}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 rounded-full"
              style={{ width: `${fillPercent}%` }} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">
            <span>Roster Map</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-primary/45" /> Taken</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-surface-variant/20 border border-outline-variant/30" /> Open</span>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1 max-w-[280px] mx-auto">
            {gridCells.map((occupied, idx) => (
              <div key={idx}
                className={`aspect-square rounded-[3px] transition-all ${
                  occupied ? 'bg-primary/45 border border-primary/40' : 'bg-surface-variant/20 border border-outline-variant/30'
                }`}
                title={occupied ? `Slot ${idx + 1}: Occupied` : `Slot ${idx + 1}: Available`} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPrizeTable = () => {
    return (
      <div className="bg-surface-container-low/20 rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-outline-variant/10">
          <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-amber-400 text-sm">emoji_events</span>
            Prize Distribution
          </h3>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {prizeDistributions.map((row, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-surface-container-low/20 transition-all">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.badgeBg}`}>
                {row.badge} {row.position}
              </span>
              <span className="text-[11px] font-black text-secondary tabular-nums">
                {row.prize}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
        <div className="text-xs text-on-surface-variant leading-relaxed">
          {tourney?.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.'}
        </div>
      );
    }

    if (parsedRules.type === 'flat') {
      return (
        <ul className="list-disc pl-4 space-y-1.5 text-xs text-on-surface-variant">
          {parsedRules.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-4">
        {parsedRules.categories.map((cat, idx) => (
          <div key={idx} className="space-y-1">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">{cat.title}</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-on-surface-variant">
              {cat.items.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {parsedRules.custom.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Custom Rules</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-on-surface-variant">
              {parsedRules.custom.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderTeamsList = () => {
    return (
      <div className="bg-surface-container-low/20 rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-outline-variant/15">
          <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">groups</span>
            Registered Teams
          </h3>
        </div>

        <div className="p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-on-surface-variant">search</span>
              <input type="text" placeholder="Search team or captain..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 bg-surface border border-outline-variant/20 rounded-lg text-[10px] text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-all" />
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'All' },
              { id: 'verified', label: 'Verified' },
              { id: 'approved', label: 'Approved' },
              { id: 'pending', label: 'Pending' }
            ].map(f => (
              <button key={f.id} onClick={() => setTeamFilter(f.id)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${
                  teamFilter === f.id
                    ? 'bg-primary border-primary text-on-primary'
                    : 'bg-surface-container/60 hover:bg-surface-container border-outline-variant/20 text-on-surface-variant'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {filteredTeams.length === 0 ? (
            <div className="text-center py-6 text-[10px] text-on-surface-variant/60">No teams found matching filters.</div>
          ) : (
            <div className="space-y-2">
              <div className="divide-y divide-outline-variant/10 border border-outline-variant/20 rounded-lg overflow-hidden">
                {paginatedTeams.map((team, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-container-low/20 transition-all">
                    <img src={team.logo} className="w-5 h-5 rounded object-cover border border-outline-variant/20 shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-on-background truncate">{team.name}</div>
                      <div className="text-[8px] text-on-surface-variant/60 truncate">{team.captain}{team.members?.length > 0 ? ` + ${team.members.length}` : ''}</div>
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                      team.status === 'Approved' || team.status === 'Confirmed'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : team.status === 'Waitlisted'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-slate-500/10 text-slate-400'
                    }`}>{team.status}</span>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-on-surface-variant/60">{(currentPage - 1) * teamsPerPage + 1}-{Math.min(filteredTeams.length, currentPage * teamsPerPage)} of {filteredTeams.length}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}
                      className="p-0.5 rounded bg-surface border border-outline-variant/20 text-on-background disabled:opacity-40 disabled:cursor-not-allowed">
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <span className="text-[9px] text-on-surface-variant">Pg {currentPage}/{totalPages}</span>
                    <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}
                      className="p-0.5 rounded bg-surface border border-outline-variant/20 text-on-background disabled:opacity-40 disabled:cursor-not-allowed">
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRoomCredentialsCard = () => {
    const isPendingPaymentStatus = rosterStatus === 'pending_payment' || rosterStatus === 'PENDING_PAYMENT_VERIFICATION';
    
    if (!currentUser || (!isApprovedRoster && !isPendingPaymentStatus)) {
      return (
        <div className="bg-surface-container-low/20 rounded-xl border border-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <span className="material-symbols-outlined text-sm">lock</span>
            </div>
            <div className="space-y-0.5">
              <h4 className="text-[10px] font-bold uppercase text-rose-400 tracking-wider">Room Coordinates Locked</h4>
              <p className="text-[9px] text-on-surface-variant/70 leading-relaxed">
                {currentUser 
                  ? "Complete registration to unlock match credentials."
                  : "Sign in with a verified account to access credentials."
                }
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (isPendingPaymentStatus) {
      return (
        <div className="bg-surface-container-low/20 rounded-xl border border-amber-500/15 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-sm">hourglass_empty</span>
            </div>
            <div className="space-y-0.5 flex-1">
              <h4 className="text-[10px] font-bold uppercase text-amber-400 tracking-wider">Payment Verification Pending</h4>
              <p className="text-[9px] text-on-surface-variant/70 leading-relaxed">
                Match room details unlock once the organizer approves your transaction.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (!revealTimeReached) {
      return (
        <div className="bg-surface-container-low/20 rounded-xl border border-primary/20 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 animate-pulse">
              <span className="material-symbols-outlined text-sm">hourglass_top</span>
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <h4 className="text-[10px] font-bold uppercase text-primary tracking-wider">Decrypting Coordinates...</h4>
              <p className="text-[9px] text-on-surface-variant/70 leading-relaxed">
                Room details revealed 15 minutes before match start.
              </p>
              {revealCountdown && (
                <span className="text-[9px] font-mono font-bold text-secondary bg-secondary/10 px-1.5 py-0.5 rounded border border-secondary/20 inline-block mt-1">
                  Decrypts in: {revealCountdown}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-surface-container-low/20 rounded-xl border border-emerald-500/20 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <span className="material-symbols-outlined text-xs">lock_open</span>
              </div>
              <span className="text-[9px] font-bold uppercase text-emerald-400 tracking-wider">Lobby Decrypted</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>

          {isLobbyLoading ? (
            <div className="flex items-center justify-center py-3 gap-2">
              <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent spinner loading-spinner" />
              <span className="text-[10px] text-on-surface-variant">Decrypting cords...</span>
            </div>
          ) : lobbyError ? (
            <div className="text-[10px] text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs shrink-0">error</span>
              <span>{lobbyError}</span>
            </div>
          ) : lobbyCredentials ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-surface/50 border border-outline-variant/20 rounded-lg p-2.5">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider">Room ID</span>
                  <span className="text-[10px] font-mono font-bold text-on-background select-all block">{lobbyCredentials.roomID || 'TBD'}</span>
                </div>
                <button onClick={() => handleCopyCredentials(lobbyCredentials.roomID, 'Room ID')}
                  className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-background transition-all" title="Copy">
                  <span className="material-symbols-outlined text-xs">content_copy</span>
                </button>
              </div>
              <div className="flex items-center justify-between bg-surface/50 border border-outline-variant/20 rounded-lg p-2.5">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider">Password</span>
                  <span className="text-[10px] font-mono font-bold text-on-background select-all block">{lobbyCredentials.roomPassword || 'TBD'}</span>
                </div>
                <button onClick={() => handleCopyCredentials(lobbyCredentials.roomPassword, 'Password')}
                  className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-background transition-all" title="Copy">
                  <span className="material-symbols-outlined text-xs">content_copy</span>
                </button>
              </div>
            </div>
          ) : (
            <button onClick={fetchLobbyCredentials}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-xs">refresh</span>
              Fetch Lobby Details
            </button>
          )}
        </div>
      </div>
    );
  };

  const gameBadgeClasses = getGameBadge(tourney.game);
  const isSponsorsEnabled = tourney?.sponsors_enabled === true || tourney?.sponsors_enabled === 'true';

  const renderFlowchart = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tournament Match Roadmap</h3>
          <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
            Follow the path of matches and qualify through rounds to reach the Grand Finals.
          </p>
        </div>

        {parsedTimeline.roadmap && parsedTimeline.roadmap.length > 0 ? (
          <div className="w-full overflow-x-auto py-6 px-4 bg-[#0d0e12]/40 border border-outline-variant/10 rounded-2xl flex items-center gap-6 scrollbar-thin">
            {parsedTimeline.roadmap.map((round, idx) => (
              <React.Fragment key={round.id || idx}>
                {/* Node Card */}
                <div className="flex-shrink-0 w-[200px] bg-[#0d0e12] border border-outline-variant/20 rounded-xl p-4 relative group hover:border-primary/40 transition-all duration-300 shadow-md">
                  <div className="absolute top-[-9px] left-4 bg-primary text-on-primary text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm">
                    ROUND {idx + 1}
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-black text-white truncate uppercase">{round.name || `Round ${idx + 1}`}</div>
                    <div className="space-y-1.5 text-[10px] text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px] text-primary">calendar_today</span>
                        <span>{round.date ? new Date(round.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px] text-primary">schedule</span>
                        <span>{round.time || 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px] text-primary">map</span>
                        <span>Map: <strong className="text-white">{round.map || 'Erangel'}</strong></span>
                      </div>
                      {round.qualified && (
                        <div className="flex items-center gap-1.5 mt-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded text-[9px] font-bold uppercase">
                          <span className="material-symbols-outlined text-[12px]">emoji_events</span>
                          <span>Qualifies: {round.qualified}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Connecting Arrow */}
                {idx < parsedTimeline.roadmap.length - 1 && (
                  <div className="flex-shrink-0 flex items-center justify-center text-primary/40 animate-pulse">
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-surface-container-low/10 border border-dashed border-outline-variant/10 rounded-xl">
            <span className="material-symbols-outlined text-2xl text-on-surface-variant/40">sports_esports</span>
            <p className="text-[10px] text-on-surface-variant mt-2 font-bold uppercase">No match rounds scheduled yet.</p>
          </div>
        )}
      </div>
    );
  };

  const renderSponsorsContent = () => {
    return (
      <div className="space-y-4">
        {/* Sponsor Wall */}
        {sponsorList.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Our Sponsors</h3>
            <div className="flex flex-wrap gap-2">
              {sponsorList.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-low border border-outline-variant/20 rounded-lg text-[10px] font-bold text-on-background">
                  <span className="text-warning text-[11px]">&#9733;</span>
                  {s.name}
                  {s.amount > 0 && <span className="text-on-surface-variant font-medium">₹{parseInt(s.amount).toLocaleString('en-IN')}</span>}
                </span>
              ))}
            </div>
            {totalSponsorAmount > 0 && (
              <p className="text-[10px] text-on-surface-variant/60">Total: <span className="font-bold text-emerald-400">₹{totalSponsorAmount.toLocaleString('en-IN')}</span></p>
            )}
          </div>
        )}

        {/* Sponsor Contribution Form */}
        {isSponsorsEnabled && (
          <div className="bg-surface-container-low/20 rounded-xl p-4 border border-outline-variant/10 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-on-background">Sponsor This Tournament</h3>
              <p className="text-[10px] text-on-surface-variant/70 mt-0.5">Contribute to the prize pool and get featured above.</p>
            </div>
            {!showSponsorForm ? (
              <button onClick={() => setShowSponsorForm(true)}
                className="w-full py-2 min-h-[38px] rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/90 transition-all">
                Support with UPI
              </button>
            ) : (
              <form onSubmit={handleSponsorContribute} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <input value={sponsorForm.name} onChange={e => setSponsorForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Your name" required
                    className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50" />
                  <input value={sponsorForm.email} onChange={e => setSponsorForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="Email" type="email"
                    className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input value={sponsorForm.amount} onChange={e => setSponsorForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="Amount (₹)" type="number" min="1" required
                    className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50" />
                  <input value={sponsorForm.transaction_id} onChange={e => setSponsorForm(p => ({ ...p, transaction_id: e.target.value }))}
                    placeholder="UPI Transaction ID / UTR" required
                    className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50" />
                </div>
                <input value={sponsorForm.payment_app} onChange={e => setSponsorForm(p => ({ ...p, payment_app: e.target.value }))}
                  placeholder="Payment app (Google Pay / PhonePe / Paytm)"
                  className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50" />
                <textarea value={sponsorForm.message} onChange={e => setSponsorForm(p => ({ ...p, message: e.target.value }))}
                  placeholder="Message (optional)"
                  className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[10px] text-on-background placeholder:text-on-surface-variant/50 resize-none h-14" />
                <p className="text-[8px] text-on-surface-variant/50">Pay to <span className="font-bold text-primary">matchdistrict@upi</span></p>
                <div className="flex gap-2">
                  <button type="submit" disabled={sponsorSubmitting}
                    className="flex-1 py-1.5 min-h-[36px] rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all">
                    {sponsorSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                  <button type="button" onClick={() => setShowSponsorForm(false)}
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-outline-variant/20 text-[10px] font-bold text-on-surface-variant hover:text-on-background transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#07080C] text-white relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-16 pb-24 sm:pt-20 space-y-8">
        
        {/* Wallet Pass Hero Component Container with perspective and 3D tilt */}
        <div 
          className="flex flex-col sm:flex-row relative items-center justify-center gap-4 sm:gap-0 select-none py-6 sm:py-10 max-w-4xl sm:ml-0 w-full"
          style={{
            perspective: '1000px',
            transform: 'rotate3d(1, -1, 0, 4deg)',
            transformStyle: 'preserve-3d'
          }}
        >
          {/* The Pocket Sleeve Container */}
          <div 
            onClick={() => setIsPassPopped(!isPassPopped)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="z-10 relative w-full max-w-[280px] sm:max-w-[260px] aspect-[3/4] bg-surface-container-low rounded-2xl flex-shrink-0 transform shadow-[0_20px_50px_rgba(0,0,0,0.8)] cursor-pointer hover:scale-[1.01] transition-all duration-300"
            style={{
              transform: isPassPopped ? 'rotateY(-6deg) translateX(-8px) translateZ(10px)' : 'rotateY(0deg) translateX(0) translateZ(10px)',
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Layer A: The Pouch Backing (z-0) */}
            <div 
              className="absolute inset-0 rounded-2xl bg-[#0c0d12] border border-outline-variant/15 shadow-[inset_0_4px_20px_rgba(0,0,0,0.9)] z-0"
            />

            {/* Layer B: The White Pass Card (z-10) */}
            <div
              className="z-10 bg-white border border-slate-200 rounded-2xl p-5 pl-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] absolute top-[4%] bottom-[4%] right-0 w-[94%] flex flex-col justify-between transform"
              style={{
                transform: isPassPopped
                  ? 'translateX(85%) translateZ(-5px)'
                  : (isHovered ? 'translateX(40px) translateZ(-5px)' : 'translateX(12px) translateZ(-5px)'),
                transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                opacity: isPassPopped ? 1 : 0.95
              }}
            >
              <div className="space-y-3.5">
                {/* Top row with target SVG decoration */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-[9px] tracking-widest text-slate-500 font-extrabold uppercase">
                    TOURNAMENT PASS
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <line x1="1" y1="12" x2="23" y2="12" />
                  </svg>
                </div>

                {/* Title & Organizer */}
                <div className="space-y-0.5">
                  <h2 className="text-lg sm:text-xl font-black text-slate-955 tracking-tight uppercase leading-tight truncate w-full">
                    {tourney.title}
                  </h2>
                  <div className="flex items-center gap-1 text-[10px] text-slate-800 font-bold leading-none mt-1">
                    <span>by {orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>
                </div>

                {/* Prize & Entry Rows */}
                <div className="grid grid-cols-2 gap-2 py-1.5 border-y border-slate-200 text-center">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg py-1 px-1.5 flex items-center justify-center">
                    <span className="text-[10px] font-extrabold text-emerald-600 tracking-tight uppercase">
                      PRIZE: {prizeDisplay}
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg py-1 px-1.5 flex items-center justify-center">
                    <span className="text-[10px] font-extrabold text-amber-600 tracking-tight uppercase">
                      ENTRY: {entryDisplay}
                    </span>
                  </div>
                </div>

                {/* Format & Slots tracker (Shifted up to empty center quadrant) */}
                <div className="space-y-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block leading-none">FORMAT</span>
                    <span className="text-[11px] font-bold text-slate-900 block leading-none mt-0.5">
                      {formatLabel(tourney.match_type)} &bull; {(tourney.perspective || 'TPP').toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block leading-none">SLOTS</span>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-900 leading-none mt-0.5">
                      <span className="material-symbols-outlined text-[13px] text-slate-500 leading-none">group</span>
                      <span>{slotFilled}/{slotTotal} &bull; {Math.min(100, Math.round((slotFilled / slotTotal) * 100))}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row framing the Game Icon */}
              <div className="flex justify-end items-end w-full pt-2">
                {getGameLogo(tourney.game) && (
                  <div className="rounded-lg overflow-hidden bg-slate-100/50 p-1 border border-slate-200/40 shadow-sm shrink-0">
                    <img 
                      src={getGameLogo(tourney.game)} 
                      alt={tourney.game} 
                      className="w-12 h-12 rounded-lg object-contain select-none grayscale opacity-40 mix-blend-multiply" 
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Layer C: The Wallet Front Envelope Face (z-20) */}
            <div 
              className="absolute inset-0 rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-low z-20 pointer-events-none"
            >
              <img
                src={tourney.cover_image_url || tourney.bannerUrl || FALLBACK_IMG}
                alt={tourney.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Divider line */}
        <hr className="border-outline-variant/15" />

        {/* ══════════ PC VIEW: 70/30 GRID ══════════ */}
        <div className="hidden md:grid grid-cols-10 gap-8 items-start">
          {/* Left Column (70%) */}
          <div className="col-span-7 space-y-6">
            {/* Minimal Line Tab Bar Switcher */}
            <div className="flex border-b border-outline-variant/15 gap-6">
              {[
                { id: 'brief', label: 'Overview', icon: 'info' },
                { id: 'rules', label: 'Rules & Regulations', icon: 'gavel' },
                { id: 'matches', label: 'Matches', icon: 'sports_esports' },
                { id: 'sponsors', label: 'Sponsors', icon: 'handshake', hidden: !isSponsorsEnabled && sponsorList.length === 0 }
              ].filter(t => !t.hidden).map(tab => (
                <button key={tab.id}
                  onClick={() => setDesktopTab(tab.id)}
                  className={`pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                    desktopTab === tab.id
                      ? 'border-primary text-on-background'
                      : 'border-transparent text-on-surface-variant/60 hover:text-on-background'
                  }`}>
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            {desktopTab === 'brief' && (
              <div className="space-y-6">
                {/* Hero Prize Row */}
                <div className="grid grid-cols-3 gap-4 bg-[#0d0e12]/40 rounded-xl p-4 border border-outline-variant/10">
                  <div>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Prize Pool</span>
                    <p className="text-xl font-black text-secondary mt-0.5">{prizeDisplay}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Entry Fee</span>
                    <p className="text-xl font-black text-on-background mt-0.5">{entryDisplay}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Slots</span>
                    <p className="text-xl font-black text-on-background mt-0.5">{slotFilled}/{slotTotal} <span className="text-xs font-bold text-on-surface-variant">filled</span></p>
                    <p className="text-[10px] text-on-surface-variant/60">{slotAvailable} slots left</p>
                  </div>
                </div>

                {/* Prize Distribution Table */}
                {renderPrizeTable()}

                {/* Slot Tracker */}
                {renderSlotTracker()}

                {/* Registered Teams */}
                {renderTeamsList()}

                {/* Event Brief */}
                {tourney.description && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Event Brief</h3>
                    <p className="text-xs text-on-surface-variant/80 leading-relaxed whitespace-pre-line">{tourney.description}</p>
                  </div>
                )}
              </div>
            )}

            {desktopTab === 'rules' && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tournament Rules</h3>
                <div className="text-xs text-on-surface-variant/80 leading-relaxed">
                  {renderRulesContent()}
                </div>
              </div>
            )}

            {desktopTab === 'matches' && renderFlowchart()}

            {desktopTab === 'sponsors' && renderSponsorsContent()}
          </div>

          {/* Right Column (30% Sticky Sidebar) */}
          <div className="col-span-3 sticky top-24 space-y-6">
            <div className="bg-[#0d0e12]/40 rounded-xl border border-outline-variant/10 p-4 space-y-4 shadow-sm">
              {/* Countdown Container */}
              {countdown.active && (countdown.type === 'registration' || countdown.type === 'start') ? (
                <div className="bg-[#07080C] rounded-lg p-3 border border-outline-variant/10">
                  <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest block text-center mb-2">
                    {countdown.type === 'registration' ? 'REGISTRATION CLOSES IN' : 'TOURNAMENT STARTS IN'}
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { val: countdown.days, lbl: 'DAYS' },
                      { val: countdown.hours, lbl: 'HRS' },
                      { val: countdown.minutes, lbl: 'MINS' },
                      { val: countdown.seconds, lbl: 'SECS' }
                    ].map((s, idx) => (
                      <div key={idx} className="bg-[#0d0e12] rounded py-1.5 text-center border border-outline-variant/10 shadow-inner">
                        <span className="text-sm font-black tabular-nums text-primary block leading-none">{String(s.val).padStart(2, '0')}</span>
                        <span className="text-[7px] font-bold text-on-surface-variant uppercase block mt-1 leading-none">{s.lbl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : countdown.type === 'live' ? (
                <div className="flex items-center justify-center gap-2 py-3 bg-rose-500/10 rounded-lg border border-rose-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">LIVE NOW</span>
                </div>
              ) : (
                <div className="bg-[#0d0e12]/40 rounded-lg py-2.5 border border-outline-variant/10 text-center">
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">REGISTRATION CLOSED</span>
                </div>
              )}

              {/* Primary Active Dynamic CTA Button */}
              <button onClick={handleRegister} disabled={btn.disabled}
                className={`w-full py-2.5 min-h-[40px] rounded-lg font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md ${btnStyles[btn.style]}`}>
                {btn.text}
                {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
              </button>
            </div>

            {/* Room Credentials */}
            {renderRoomCredentialsCard()}

            {/* Timeline Schedule */}
            <div className="bg-[#0d0e12]/40 rounded-xl border border-outline-variant/10 p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">schedule</span>
                Timeline
              </h3>
              <div className="space-y-2.5 border-l border-outline-variant/20 pl-3 ml-1">
                {[
                  { label: 'Check-in Opens', date: tourney.lobby_start_time || tourney.registrationCloseDate, desc: 'Coordinates unlock' },
                  { label: 'Match Start', date: tourney.startDate, desc: 'Lobby locks' }
                ].map((step, idx) => {
                  const dateObj = step.date ? new Date(step.date) : null;
                  return (
                    <div key={idx} className="relative">
                      <span className="absolute -left-[13px] top-1 w-1.5 h-1.5 rounded-full bg-primary border-2 border-background" />
                      <div className="text-[10px] font-bold text-on-background">{step.label}</div>
                      <div className="text-[9px] font-bold text-primary">
                        {dateObj ? dateObj.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                      </div>
                      <p className="text-[8px] text-on-surface-variant/60">{step.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ MOBILE VIEW: FLUID STACK ══════════ */}
        <div className="block md:hidden space-y-6">
          {/* Mobile Tab Bar Switcher */}
          <div className="flex overflow-x-auto border-b border-outline-variant/15 gap-4 no-scrollbar">
            {[
              { id: 'overview', label: 'Overview', icon: 'info' },
              { id: 'rules', label: 'Rules', icon: 'gavel' },
              { id: 'matches', label: 'Matches', icon: 'sports_esports' },
              { id: 'teams', label: 'Teams', icon: 'groups' },
              { id: 'sponsors', label: 'Sponsors', icon: 'handshake', hidden: !isSponsorsEnabled && sponsorList.length === 0 }
            ].filter(t => !t.hidden).map(tab => (
              <button key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={`pb-2 text-[10px] font-bold uppercase tracking-wider border-b-2 shrink-0 transition-all flex items-center gap-1.5 ${
                  mobileTab === tab.id
                    ? 'border-primary text-on-background'
                    : 'border-transparent text-on-surface-variant/60'
                }`}>
                <span className="material-symbols-outlined text-[13px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile Tab Content */}
          {mobileTab === 'overview' && (
            <div className="space-y-4">
              {/* Prize distribution */}
              {renderPrizeTable()}

              {/* Slot Tracker */}
              {renderSlotTracker()}

              {/* Registered Teams */}
              {renderTeamsList()}

              {/* Event Brief */}
              {tourney.description && (
                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Event Brief</h3>
                  <p className="text-[11px] text-on-surface-variant/80 leading-relaxed">{tourney.description}</p>
                </div>
              )}

              {/* Room Credentials */}
              {renderRoomCredentialsCard()}

              {/* Timeline */}
              <div className="bg-[#0d0e12]/40 rounded-lg border border-outline-variant/10 p-3 space-y-2.5">
                <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  Timeline
                </h3>
                <div className="space-y-2 border-l border-outline-variant/20 pl-3">
                  {[
                    { label: 'Check-in Opens', date: tourney.lobby_start_time || tourney.registrationCloseDate, desc: 'Coordinates unlock' },
                    { label: 'Match Start', date: tourney.startDate, desc: 'Lobby locks' }
                  ].map((step, idx) => {
                    const dateObj = step.date ? new Date(step.date) : null;
                    return (
                      <div key={idx} className="relative">
                        <span className="absolute -left-[13px] top-1 w-1.5 h-1.5 rounded-full bg-primary border-2 border-background" />
                        <div className="text-[10px] font-bold text-on-background">{step.label}</div>
                        <div className="text-[9px] font-bold text-primary">
                          {dateObj ? dateObj.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                        </div>
                        <p className="text-[8px] text-on-surface-variant/60">{step.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'rules' && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Tournament Rules</h3>
              <div className="text-xs text-on-surface-variant/80 leading-relaxed">
                {renderRulesContent()}
              </div>
            </div>
          )}

          {mobileTab === 'matches' && renderFlowchart()}

          {mobileTab === 'teams' && renderTeamsList()}

          {mobileTab === 'sponsors' && renderSponsorsContent()}
        </div>

      </main>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      <div className="block md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#07080C]/90 backdrop-blur-xl border-t border-outline-variant/20 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          {/* Countdown & slots info */}
          <div className="min-w-0 flex-1">
            {countdown.active && (countdown.type === 'registration' || countdown.type === 'start') ? (
              <div className="text-[10px] font-bold text-primary flex items-center gap-1 mb-0.5 truncate uppercase">
                <span className="material-symbols-outlined text-xs">schedule</span>
                <span>
                  {countdown.type === 'registration' ? 'Reg Closes' : 'Starts'} in:{' '}
                  {countdown.days > 0 ? `${countdown.days}d ` : ''}
                  {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
                </span>
              </div>
            ) : countdown.type === 'live' ? (
              <div className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mb-0.5 animate-pulse uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping mr-1" />
                <span>LIVE NOW</span>
              </div>
            ) : (
              <div className="text-[10px] font-bold text-rose-500 mb-0.5">CLOSED</div>
            )}
            <p className="text-[10px] text-on-surface-variant font-medium leading-none">
              {slotAvailable} slots left &bull; {entryDisplay}
            </p>
          </div>
          {/* CTA */}
          <button
            onClick={handleRegister}
            disabled={btn.disabled}
            className={`shrink-0 px-4 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-[0.95] flex items-center justify-center gap-1.5 shadow-md ${btnStyles[btn.style]}`}
          >
            {btn.text}
            {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
          </button>
        </div>
      </div>

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