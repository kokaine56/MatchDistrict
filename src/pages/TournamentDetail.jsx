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

  const renderFlowchart = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Tournament Match Roadmap</h3>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Follow the path of matches and qualify through rounds to reach the Grand Finals.
          </p>
        </div>

        {parsedTimeline.roadmap && parsedTimeline.roadmap.length > 0 ? (
          <div className="w-full overflow-x-auto py-6 px-4 bg-[#0d0e12]/40 border border-white/10 rounded-2xl flex items-center gap-6 scrollbar-thin">
            {parsedTimeline.roadmap.map((round, idx) => (
              <React.Fragment key={round.id || idx}>
                {/* Node Card */}
                <div className="flex-shrink-0 w-[200px] bg-[#07080C] border border-white/10 rounded-xl p-4 relative group hover:border-primary/40 transition-all duration-300 shadow-md">
                  <div className="absolute top-[-9px] left-4 bg-primary text-on-primary text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm">
                    ROUND {idx + 1}
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-black text-white truncate uppercase">{round.name || `Round ${idx + 1}`}</div>
                    <div className="space-y-1.5 text-[10px] text-white/60">
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
                  <div className="flex-shrink-0 flex items-center justify-center text-primary/45 animate-pulse">
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-[#07080C]/40 border border-dashed border-white/10 rounded-xl">
            <span className="material-symbols-outlined text-2xl text-white/30">sports_esports</span>
            <p className="text-[10px] text-white/50 mt-2 font-bold uppercase">No match rounds scheduled yet.</p>
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
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Our Sponsors</h3>
            <div className="flex flex-wrap gap-2">
              {sponsorList.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-white/10 rounded-lg text-[10px] font-bold text-white">
                  <span className="text-warning text-[11px]">&#9733;</span>
                  {s.name}
                  {s.amount > 0 && <span className="text-white/60 font-medium">₹{parseInt(s.amount).toLocaleString('en-IN')}</span>}
                </span>
              ))}
            </div>
            {totalSponsorAmount > 0 && (
              <p className="text-[10px] text-white/50">Total Contributions: <span className="font-bold text-emerald-400">₹{totalSponsorAmount.toLocaleString('en-IN')}</span></p>
            )}
          </div>
        )}

        {/* Sponsor Contribution Form */}
        {isSponsorsEnabled && (
          <div className="bg-black/30 rounded-xl p-4 border border-white/5 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white">Sponsor This Tournament</h3>
              <p className="text-[10px] text-white/50 mt-0.5">Contribute to the prize pool and get featured above.</p>
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
                    className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40" />
                  <input value={sponsorForm.email} onChange={e => setSponsorForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="Email" type="email"
                    className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input value={sponsorForm.amount} onChange={e => setSponsorForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="Amount (₹)" type="number" min="1" required
                    className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40" />
                  <input value={sponsorForm.transaction_id} onChange={e => setSponsorForm(p => ({ ...p, transaction_id: e.target.value }))}
                    placeholder="UPI Transaction ID / UTR" required
                    className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40" />
                </div>
                <input value={sponsorForm.payment_app} onChange={e => setSponsorForm(p => ({ ...p, payment_app: e.target.value }))}
                  placeholder="Payment app (Google Pay / PhonePe / Paytm)"
                  className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40" />
                <textarea value={sponsorForm.message} onChange={e => setSponsorForm(p => ({ ...p, message: e.target.value }))}
                  placeholder="Message (optional)"
                  className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-white/40 resize-none h-14" />
                <p className="text-[8px] text-white/40">Pay to <span className="font-bold text-primary">matchdistrict@upi</span></p>
                <div className="flex gap-2">
                  <button type="submit" disabled={sponsorSubmitting}
                    className="flex-1 py-1.5 min-h-[36px] rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all">
                    {sponsorSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                  <button type="button" onClick={() => setShowSponsorForm(false)}
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-white/10 text-[10px] font-bold text-white/50 hover:text-white transition-all">
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

  if (isTournamentsLoading) return <LoadingScreen message="Loading Tournament Coordinates..." />;

  const renderRoomCredentialsCard = () => {
    const isPendingPaymentStatus = rosterStatus === 'pending_payment' || rosterStatus === 'PENDING_PAYMENT_VERIFICATION';
    
    if (!currentUser || (!isApprovedRoster && !isPendingPaymentStatus)) {
      return (
        <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-rose-500/10 p-5 rounded-2xl">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <span className="material-symbols-outlined text-base">lock</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase text-rose-400 tracking-wider">Room Coordinates Locked</h4>
              <p className="text-[11px] text-white/55 leading-relaxed">
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
        <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-amber-500/15 p-5 rounded-2xl">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-base">hourglass_empty</span>
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-xs font-bold uppercase text-amber-400 tracking-wider">Payment Verification Pending</h4>
              <p className="text-[11px] text-white/55 leading-relaxed">
                Match room details unlock once the organizer approves your transaction.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (!revealTimeReached) {
      return (
        <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-primary/20 p-5 rounded-2xl">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 animate-pulse">
              <span className="material-symbols-outlined text-base">hourglass_top</span>
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <h4 className="text-xs font-bold uppercase text-primary tracking-wider font-headline-md">Decrypting Coordinates...</h4>
              <p className="text-[11px] text-white/55 leading-relaxed">
                Room details revealed 15 minutes before match start.
              </p>
              {revealCountdown && (
                <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded border border-secondary/20 inline-block mt-1">
                  Decrypts in: {revealCountdown}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-emerald-500/20 p-5 rounded-2xl">
        <div className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <span className="material-symbols-outlined text-xs">lock_open</span>
              </div>
              <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Lobby Decrypted</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>

          {isLobbyLoading ? (
            <div className="flex items-center justify-center py-3 gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent spinner loading-spinner rounded-full" />
              <span className="text-xs text-white/60">Decrypting cords...</span>
            </div>
          ) : lobbyError ? (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs shrink-0">error</span>
              <span>{lobbyError}</span>
            </div>
          ) : lobbyCredentials ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl p-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Room ID</span>
                  <span className="text-xs font-mono font-bold text-white select-all block mt-0.5">{lobbyCredentials.roomID || 'TBD'}</span>
                </div>
                <button onClick={() => handleCopyCredentials(lobbyCredentials.roomID, 'Room ID')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all" title="Copy">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
              <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl p-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Password</span>
                  <span className="text-xs font-mono font-bold text-white select-all block mt-0.5">{lobbyCredentials.roomPassword || 'TBD'}</span>
                </div>
                <button onClick={() => handleCopyCredentials(lobbyCredentials.roomPassword, 'Password')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all" title="Copy">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
            </div>
          ) : (
            <button onClick={fetchLobbyCredentials}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-xs">refresh</span>
              Fetch Lobby Details
            </button>
          )}
        </div>
      </div>
    );
  };

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
                <div className="w-[110px] sm:w-[140px] shrink-0">
                  <img 
                    className="w-full aspect-[3/4] object-cover rounded-xl shadow-md"
                    src={tourney.cover_image_url || tourney.bannerUrl || FALLBACK_IMG}
                    alt="Tournament Poster"
                  />
                </div>

                {/* Details Right */}
                <div className="flex-1 flex flex-col items-start justify-start text-left min-w-0">
                  
                  {/* Title */}
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight line-clamp-2 break-words">
                    {tourney.title}
                  </h1>

                  {/* Organizer */}
                  <div className="text-xs sm:text-sm font-bold text-slate-500 flex items-center gap-1 mt-1">
                    <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full overflow-hidden shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-[6px] sm:text-[7px] text-slate-500">
                      {orgProfile?.avatar ? (
                        <img src={orgProfile.avatar} className="w-full h-full object-cover" alt="" />
                      ) : (
                        (orgProfile?.orgName || tourney.orgName || 'MD').slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="truncate">{orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>

                  {/* Financial Pills */}
                  <div className="flex flex-wrap gap-2 mt-3 w-full">
                    <div className="px-2 py-1.5 bg-green-50/80 border border-green-200 text-green-700 text-xs font-extrabold rounded-md flex-1 text-center min-w-[80px] leading-tight">
                      PRIZE: {prizeDisplay}
                    </div>
                    <div className="px-2 py-1.5 bg-amber-50/80 border border-amber-200 text-amber-600 text-xs font-extrabold rounded-md flex-1 text-center min-w-[80px] leading-tight">
                      ENTRY: {entryDisplay}
                    </div>
                  </div>

                  {/* Format & Slots - compact inline */}
                  <div className="flex items-center gap-4 mt-3 w-full">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">FORMAT</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                        {formatLabel(tourney.match_type)} &bull; {(tourney.perspective || 'TPP').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">SLOTS</span>
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

          {/* Registered Squads/Teams list */}
          <section className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="font-bold text-lg text-white tracking-wider flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">groups</span>
                  Registered Squads
                </h4>
                
                {/* Roster Filters */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'verified', label: 'Verified' },
                    { id: 'approved', label: 'Approved' },
                    { id: 'pending', label: 'Pending' }
                  ].map(f => (
                    <button key={f.id} onClick={() => setTeamFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                        teamFilter === f.id
                          ? 'bg-primary border-primary text-on-primary'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/50">search</span>
                <input
                  type="text"
                  placeholder="Search team or captain..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Squads List */}
              {filteredTeams.length === 0 ? (
                <div className="text-center py-12 text-xs text-white/45">No squads found matching filters.</div>
              ) : (
                <div className="space-y-2">
                  <div className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden bg-black/25">
                    {paginatedTeams.map((team, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-all">
                        <img src={team.logo} className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0" alt="" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{team.name}</p>
                          <p className="text-[10px] text-white/50 truncate">
                            {team.captain}{team.members?.length > 0 ? ` + ${team.members.length}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                          team.status === 'Approved' || team.status === 'Confirmed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : team.status === 'Waitlisted'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-white/5 text-white/60 border-white/10'
                        }`}>
                          {team.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[10px] text-white/50">
                        {(currentPage - 1) * teamsPerPage + 1}-{Math.min(filteredTeams.length, currentPage * teamsPerPage)} of {filteredTeams.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}
                          className="p-1 rounded bg-black/45 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed">
                          <span className="material-symbols-outlined text-sm">chevron_left</span>
                        </button>
                        <span className="text-[10px] text-white/80">Pg {currentPage}/{totalPages}</span>
                        <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}
                          className="p-1 rounded bg-black/45 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed">
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Roster map info row */}
              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex -space-x-2 overflow-hidden">
                  {allTeams.slice(0, 4).map((t, i) => (
                    <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-[#0d0e12] bg-white/10 overflow-hidden">
                      <img src={t.logo} className="w-full h-full object-cover" alt="" />
                    </div>
                  ))}
                  {allTeams.length > 4 && (
                    <div className="flex items-center justify-center h-8 w-8 rounded-full ring-2 ring-[#0d0e12] bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold">
                      +{allTeams.length - 4}
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-white/45 font-bold uppercase tracking-widest">
                  Live occupancy maps
                </p>
              </div>
          </section>

          {/* Main Content Area: Prize Pool & Rules */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 px-0">
            {/* Left 2/3 column */}
            <div className="md:col-span-2 space-y-8">
              
              {/* Prize Pool Breakdown */}
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                  <h3 className="font-bold text-xl text-white uppercase tracking-wider flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-3xl">emoji_events</span>
                    Prize Pool Breakdown
                  </h3>
                  <div className="text-right">
                    <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Total Pool</p>
                    <p className="text-secondary font-black text-3xl">{prizeDisplay}</p>
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {prizeDistributions.map((row, i) => (
                    <div key={i} className="flex items-center justify-between py-4 hover:bg-white/5 transition-all px-3 rounded-xl">
                      <div className="flex items-center gap-4">
                        <span className={`px-2.5 py-1 rounded text-[9px] font-black tracking-wider uppercase ${row.badgeBg}`}>
                          {row.badge} {row.position}
                        </span>
                        <p className="text-white/60 text-xs hidden sm:block">Qualifying placement reward</p>
                      </div>
                      <p className="text-lg font-black text-secondary tabular-nums">{row.prize}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roadmap Round flow */}
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                {renderFlowchart()}
              </div>

              {/* Tournament Rules */}
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                <h3 className="font-bold text-xl text-white uppercase tracking-wider mb-6 flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-2xl">gavel</span>
                  Tournament Rules
                </h3>
                <div className="space-y-4">
                  {renderRulesContent()}
                </div>
              </div>

            </div>

            {/* Right 1/3 column side cards */}
            <div className="space-y-6">
              
              {/* Lobby Coordinates decrypting */}
              {renderRoomCredentialsCard()}

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

              {/* Sponsors Section */}
              {(isSponsorsEnabled || sponsorList.length > 0) && (
                <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                  {renderSponsorsContent()}
                </div>
              )}

              {/* Organizer / Contact Info */}
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
                <div>
                  <h4 className="font-bold text-base text-white tracking-wider uppercase">Contact Support</h4>
                  <p className="text-[10px] text-white/50 mt-0.5">Need help regarding matching schedules or fees?</p>
                </div>
                <button className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 py-3.5 rounded-xl text-primary font-black text-xs uppercase tracking-widest transition-all">
                  <span className="material-symbols-outlined text-base">chat</span>
                  Join Discord Community
                </button>
              </div>

            </div>
          </section>

        </div>
      </main>

      {/* FIXED STICKY BOTTOM ACTION BAR */}
      <footer className="fixed bottom-0 left-0 w-full bg-[#0d0e12]/80 backdrop-blur-xl border-t border-white/10 px-4 md:px-margin-desktop py-4 z-40">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              {countdown.active && (countdown.type === 'registration' || countdown.type === 'start') ? (
                <span className="text-primary font-bold font-label-sm flex items-center gap-1 text-[11px] sm:text-xs">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  {countdown.type === 'registration' ? 'REG CLOSES IN: ' : 'STARTS IN: '}
                  {countdown.days > 0 ? `${countdown.days}d ` : ''}
                  {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
                </span>
              ) : countdown.type === 'live' ? (
                <span className="text-rose-500 font-bold font-label-sm flex items-center gap-1 text-[11px] sm:text-xs animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping mr-1" />
                  LIVE NOW
                </span>
              ) : (
                <span className="text-rose-500 font-bold font-label-sm text-[11px] sm:text-xs">
                  REGISTRATION CLOSED
                </span>
              )}
            </div>
            <p className="text-white/50 text-[10px] sm:text-[11px] mt-0.5">{slotAvailable} slots left &bull; Be quick!</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <p className="text-white/40 text-[9px] tracking-wider uppercase font-bold">ENTRY FEE</p>
              <p className="text-white font-black text-sm">{entryDisplay}</p>
            </div>
            <button 
              onClick={handleRegister} 
              disabled={btn.disabled}
              className={`px-6 sm:px-12 py-3.5 sm:py-4 rounded-xl font-bold flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20 ${btnStyles[btn.style]}`}
            >
              <span>{btn.text}</span>
              {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
            </button>
          </div>
        </div>
      </footer>

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