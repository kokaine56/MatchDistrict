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

function getGameBadge(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_BADGE[key] || 'bg-primary/20 text-primary border-primary/25';
}

function TournamentDetail({ onNavigate, tournamentId }) {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sponsorList, setSponsorList] = useState([]);
  const [totalSponsorAmount, setTotalSponsorAmount] = useState(0);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [sponsorForm, setSponsorForm] = useState({ name: '', email: '', amount: '', message: '' });
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  
  // Search and tabs states
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [mobileTab, setMobileTab] = useState('overview'); // 'overview' | 'teams' | 'prizes_slots'
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

  // Fetch organizer profile + follower count when tourney loads
  useEffect(() => {
    if (!tourney || !tourney.orgId) return;
    const orgId = tourney.orgId;
    fetch(`/api/users/${orgId}`, { headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.json()).then(d => { if (d?.user || d?.id) setOrgProfile(d.user || d); }).catch(() => {});
    fetch(`/api/org/followers/${orgId}`)
      .then(r => r.json()).then(d => { if (d?.count !== undefined) setFollowerCount(d.count); }).catch(() => {});
  }, [tourney?.orgId]);

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
    setSponsorSubmitting(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/sponsor/contribute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contributor_name: sponsorForm.name.trim(), contributor_email: sponsorForm.email.trim() || undefined, amount: parseInt(sponsorForm.amount), message: sponsorForm.message.trim() || undefined }) });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution submitted for admin review!'); setShowSponsorForm(false); setSponsorForm({ name: '', email: '', amount: '', message: '' }); }
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

  // Fetch decrypted credentials if approved and revealed
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

  // Generate dynamically calculated prize list table
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
      <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-6">
        <div>
          <h3 className="text-base font-black uppercase tracking-wider text-on-background flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">grid_view</span>
            Slot Allocations
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">Live entry mapping and tactical lobby layout</p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-on-surface-variant">Lobby Occupancy</span>
            <span className="font-black text-primary tabular-nums">{slotFilled} / {slotTotal} Slots Filled</span>
          </div>
          <div className="w-full h-3 rounded-full bg-surface-container-high border border-outline-variant/35 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-primary via-secondary to-tertiary transition-all duration-500 rounded-full"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {/* 100 slots occupied vs empty grid map */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            <span>Visual Roster Map</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary/45 border border-primary/50" /> Occupied</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-surface-variant/20 border border-outline-variant/30" /> Empty</span>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1.5 max-w-[320px] mx-auto p-4 bg-surface-container-lowest/50 rounded-xl border border-outline-variant/20">
            {gridCells.map((occupied, idx) => (
              <div
                key={idx}
                className={`aspect-square rounded-[4px] transition-all duration-300 ${
                  occupied
                    ? 'bg-gradient-to-br from-primary to-secondary shadow-[0_0_8px_rgba(59,130,246,0.35)] border border-primary/40'
                    : 'bg-surface-variant/20 border border-outline-variant/20 hover:border-outline-variant/40'
                }`}
                title={occupied ? `Slot ${idx + 1}: Occupied` : `Slot ${idx + 1}: Available`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPrizeTable = () => {
    return (
      <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-4">
        <div>
          <h3 className="text-base font-black uppercase tracking-wider text-on-background flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-lg">emoji_events</span>
            Prize Distribution
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">Podium splits and match achievements bounty matrix</p>
        </div>

        <div className="overflow-hidden border border-outline-variant/20 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant/20">
                <th className="px-4 py-3 font-bold text-on-surface-variant uppercase tracking-wider">Placement</th>
                <th className="px-4 py-3 font-bold text-on-surface-variant uppercase tracking-wider text-right">Prize Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {prizeDistributions.map((row, i) => (
                <tr key={i} className="hover:bg-surface-container/30 transition-all">
                  <td className="px-4 py-3 flex items-center gap-2 font-bold text-on-background">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.badgeBg}`}>
                      {row.badge} {row.position}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-black text-secondary tabular-nums">
                    {row.prize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTeamsList = () => {
    return (
      <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-on-background flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">groups</span>
              Registered Teams
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">Verified rosters competing in this event</p>
          </div>
          
          {/* Search bar */}
          <div className="relative shrink-0 w-full sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
            <input
              type="text"
              placeholder="Search team or captain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant/35 rounded-xl text-xs text-on-background placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2 pb-2">
          {[
            { id: 'all', label: 'All Teams' },
            { id: 'verified', label: 'Verified Only' },
            { id: 'approved', label: 'Approved' },
            { id: 'pending', label: 'Verification Pending' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setTeamFilter(f.id)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                teamFilter === f.id
                  ? 'bg-primary border-primary text-on-primary shadow-sm'
                  : 'bg-surface-container/60 hover:bg-surface-container border-outline-variant/20 text-on-surface-variant'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table list */}
        {paginatedTeams.length === 0 ? (
          <div className="text-center py-8 bg-surface-container-lowest/30 rounded-xl border border-outline-variant/15 text-xs text-on-surface-variant">
            No registered teams found matching the filters.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-outline-variant/20 rounded-xl">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/20">
                    <th className="px-4 py-3 font-bold text-on-surface-variant uppercase tracking-wider">Team Name</th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant uppercase tracking-wider">Captain / Roster</th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {paginatedTeams.map((team, idx) => (
                    <tr key={idx} className="hover:bg-surface-container/30 transition-all">
                      <td className="px-4 py-3 font-black text-on-background flex items-center gap-2">
                        <img src={team.logo} className="w-6 h-6 rounded-md object-cover border border-outline-variant/20 shrink-0" alt="" />
                        <span>{team.name}</span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <div className="font-bold text-on-background">{team.captain}</div>
                        <div className="text-[10px] truncate max-w-[200px]">
                          {team.members && team.members.length > 0
                            ? team.members.join(', ')
                            : 'No other players registered'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          team.status === 'Approved' || team.status === 'Confirmed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : team.status === 'Waitlisted'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}>
                          {team.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <span className="text-[10px] font-bold text-on-surface-variant">
                  Showing {(currentPage - 1) * teamsPerPage + 1}-{Math.min(filteredTeams.length, currentPage * teamsPerPage)} of {filteredTeams.length} teams
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-lg bg-surface border border-outline-variant/20 text-on-background disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>
                  <span className="text-[10px] font-bold text-on-surface-variant">Page {currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded-lg bg-surface border border-outline-variant/20 text-on-background disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRoomCredentialsCard = () => {
    // 1. Check registration status
    const isPendingPaymentStatus = rosterStatus === 'pending_payment' || rosterStatus === 'PENDING_PAYMENT_VERIFICATION';
    
    if (!currentUser || (!isApprovedRoster && !isPendingPaymentStatus)) {
      return (
        <div className="glass-card rounded-2xl p-6 border border-rose-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <span className="material-symbols-outlined text-lg">lock</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black uppercase text-rose-400 tracking-wider">Room Coordinates Locked</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {currentUser 
                  ? "Access is gated. Successfully complete the registration process to unlock the match room coordinates."
                  : "Sign in with a verified participant account to access the match credentials."
                }
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (isPendingPaymentStatus) {
      return (
        <div className="glass-card rounded-2xl p-6 border border-amber-500/15 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-lg">hourglass_empty</span>
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-black uppercase text-amber-400 tracking-wider">Payment Verification Pending</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Your payment validation is pending review. Match room details will unlock as soon as the organizer approves your transaction.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // If verified roster approved/confirmed
    if (!revealTimeReached) {
      return (
        <div className="glass-card rounded-2xl p-6 border border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 animate-pulse">
              <span className="material-symbols-outlined text-lg">hourglass_top</span>
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <h4 className="text-sm font-black uppercase text-primary tracking-wider">Decrypting Coordinates...</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Room details will be revealed 15 minutes before the match starts.
              </p>
              {revealCountdown && (
                <div className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20 inline-block mt-2">
                  Decrypts in: {revealCountdown}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Unlocked and decrypted credentials
    return (
      <div className="glass-card rounded-2xl p-6 border border-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-xl pointer-events-none" />
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <span className="material-symbols-outlined text-sm">lock_open</span>
              </div>
              <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">Lobby Decrypted</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>

          {isLobbyLoading ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent spinner loading-spinner" />
              <span className="text-xs text-on-surface-variant">Decrypting cords...</span>
            </div>
          ) : lobbyError ? (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm shrink-0">error</span>
              <span>{lobbyError}</span>
            </div>
          ) : lobbyCredentials ? (
            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex items-center justify-between bg-surface/50 border border-outline-variant/20 rounded-xl p-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Room ID</span>
                  <span className="text-xs font-mono font-black text-on-background select-all block">{lobbyCredentials.roomID || 'TBD'}</span>
                </div>
                <button
                  onClick={() => handleCopyCredentials(lobbyCredentials.roomID, 'Room ID')}
                  className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-background transition-all"
                  title="Copy Room ID"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
              <div className="flex items-center justify-between bg-surface/50 border border-outline-variant/20 rounded-xl p-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Password</span>
                  <span className="text-xs font-mono font-black text-on-background select-all block">{lobbyCredentials.roomPassword || 'TBD'}</span>
                </div>
                <button
                  onClick={() => handleCopyCredentials(lobbyCredentials.roomPassword, 'Password')}
                  className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-background transition-all"
                  title="Copy Password"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={fetchLobbyCredentials}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Fetch Lobby Details
            </button>
          )}
        </div>
      </div>
    );
  };

  const gameBadgeClasses = getGameBadge(tourney.game);

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="w-full max-w-7xl mx-auto px-5 sm:px-8 md:px-10 pt-16 pb-16 sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mt-4 space-y-8 lg:space-y-10">

          {/* ═══════════════════ HERO SECTION ═══════════════════ */}
          <section className="flex flex-col lg:flex-row gap-6 lg:gap-10">
            {/* Poster image */}
            <div className="w-full lg:w-[260px] shrink-0">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-surface-container-low border border-outline-variant/20 shadow-md">
                <img src={tourney.cover_image_url || tourney.bannerUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'} alt={tourney.title}
                  className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Summary Details Info */}
            <div className="flex-1 min-w-0 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${gameBadgeClasses}`}>
                    {tourney.game}
                  </span>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-on-background leading-tight truncate">
                    {tourney.title}
                  </h1>
                </div>
                <button onClick={handleShare}
                  className="px-3 py-2 min-h-[36px] rounded-xl bg-surface border border-outline-variant/30 hover:bg-surface-container-higher transition-all text-xs font-bold flex items-center gap-1.5 shrink-0 self-start">
                  <span className="material-symbols-outlined text-sm">share</span>
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>

              <hr className="border-outline-variant/20 my-2" />

              {/* Organizer details */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-surface border border-outline-variant/20 shrink-0">
                  <img
                    src={orgProfile?.orgImage || tourney.orgImage || tourney.logoUrl || orgProfile?.avatar || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=100&q=80'}
                    alt={orgProfile?.orgName || tourney.orgName || orgProfile?.name}
                    className="avatar-img" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base font-bold text-on-background truncate">{orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] sm:text-xs text-on-surface-variant mt-0.5">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">group</span>
                      {followerCount} followers
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">event</span>
                      {orgEventsCount} events
                    </span>
                    {currentUser && (
                      <button onClick={handleFollow} disabled={followLoading}
                        className={`ml-1 px-2.5 py-0.5 min-h-[26px] rounded-lg text-[10px] font-bold transition-all ${
                          isFollowing
                            ? 'bg-surface text-on-background border border-outline-variant/30'
                            : 'bg-primary hover:bg-primary/95 text-on-primary'
                        }`}>
                        {followLoading ? '\u2026' : isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-outline-variant/20 my-2" />

              {/* Stats overview matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-container-low/30 p-3 rounded-2xl border border-outline-variant/10">
                <div className="bg-surface/50 rounded-xl p-3 border border-outline-variant/10">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider block">Prize Pool</span>
                  <span className="text-base font-black text-secondary mt-0.5 block">{prizeDisplay}</span>
                </div>
                <div className="bg-surface/50 rounded-xl p-3 border border-outline-variant/10">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider block">Entry Fee</span>
                  <span className="text-base font-black text-on-background mt-0.5 block">{entryDisplay}</span>
                </div>
                <div className="bg-surface/50 rounded-xl p-3 border border-outline-variant/10">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider block">Lobby Type</span>
                  <span className="text-base font-black text-on-background mt-0.5 block uppercase">{tourney.match_type}</span>
                </div>
                <div className="bg-surface/50 rounded-xl p-3 border border-outline-variant/10">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider block">Perspective</span>
                  <span className="text-base font-black text-on-background mt-0.5 block uppercase">{tourney.perspective || 'TPP'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════ DASHBOARD PANEL LAYOUTS ═══════════════════ */}

          {/* Mobile view Tab Menu selector */}
          <div className="flex md:hidden border-b border-outline-variant/20 mb-4 bg-surface-container-low/50 rounded-xl p-1">
            {[
              { id: 'overview', label: 'Overview', icon: 'info' },
              { id: 'teams', label: 'Registered Teams', icon: 'groups' },
              { id: 'prizes_slots', label: 'Prize & Slots', icon: 'emoji_events' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  mobileTab === tab.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-background'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile view layout stack */}
          <div className="block md:hidden">
            {mobileTab === 'overview' && (
              <div className="space-y-6">
                {/* Registration Action card */}
                <div className="bg-surface-container-low/60 p-5 rounded-2xl border border-outline-variant/20 space-y-4">
                  {(countdown.type === 'registration' || countdown.type === 'start') && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">{countdown.label}</span>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { val: countdown.days, lbl: 'Days' },
                          { val: countdown.hours, lbl: 'Hrs' },
                          { val: countdown.minutes, lbl: 'Mins' },
                          { val: countdown.seconds, lbl: 'Secs' }
                        ].map((s, idx) => (
                          <div key={idx} className="bg-surface rounded-xl py-2 text-center border border-outline-variant/10">
                            <span className="text-sm font-black tabular-nums block text-primary">{String(s.val).padStart(2, '0')}</span>
                            <span className="text-[8px] font-bold text-on-surface-variant uppercase block mt-0.5">{s.lbl}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {countdown.type === 'live' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs font-black text-rose-400 uppercase tracking-widest">LIVE NOW</span>
                    </div>
                  )}
                  
                  <button onClick={handleRegister} disabled={btn.disabled}
                    className={`w-full py-3.5 min-h-[46px] rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${btnStyles[btn.style]}`}>
                    {btn.text}
                    {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
                  </button>
                </div>

                {/* Secured coordinates credentials card */}
                {renderRoomCredentialsCard()}

                {/* Event timeline Roadmap */}
                <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">schedule</span>
                    Tournament Schedule
                  </h3>
                  <div className="grid grid-cols-1 gap-3 border-l-2 border-outline-variant/30 pl-4 py-1.5 ml-2">
                    {[
                      { label: 'Check-in Opens', date: tourney.lobby_start_time || tourney.registrationCloseDate, desc: 'Decryption coordinates unlock' },
                      { label: 'Match Start', date: tourney.startDate, desc: 'Lobby locks & match begins' }
                    ].map((step, idx) => {
                      const dateObj = step.date ? new Date(step.date) : null;
                      return (
                        <div key={idx} className="relative space-y-0.5">
                          <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                          <div className="text-xs font-black text-on-background">{step.label}</div>
                          <div className="text-[10px] font-bold text-primary">
                            {dateObj ? dateObj.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                          </div>
                          <p className="text-[9px] text-on-surface-variant leading-relaxed">{step.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rules accordion */}
                <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">gavel</span>
                    Tournament Rules
                  </h3>
                  <div className="text-xs text-on-surface-variant leading-relaxed space-y-2 whitespace-pre-line">
                    {tourney.rules || 'No specific rules are set for this tournament yet. Standard fair play rules apply.'}
                  </div>
                </div>

                {/* Description details */}
                <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-3">
                  <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">description</span>
                    Event Brief
                  </h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {tourney.description || 'No tournament brief has been provided by the organizer.'}
                  </p>
                </div>
              </div>
            )}

            {mobileTab === 'teams' && renderTeamsList()}

            {mobileTab === 'prizes_slots' && (
              <div className="space-y-6">
                {renderSlotTracker()}
                {renderPrizeTable()}
              </div>
            )}
          </div>

          {/* PC view dashboard grid layout (2 Columns - Left 65% / Right 35%) */}
          <div className="hidden md:grid grid-cols-12 gap-6 items-start">
            
            {/* Left panels (65%) */}
            <div className="col-span-8 space-y-6">
              {/* Prize matrix */}
              {renderPrizeTable()}

              {/* Slot grid */}
              {renderSlotTracker()}

              {/* Registered teams */}
              {renderTeamsList()}

              {/* Description & rules */}
              <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-base">description</span>
                      Event Brief
                    </h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
                      {tourney.description || 'No tournament brief has been provided by the organizer.'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-base">gavel</span>
                      Tournament Rules
                    </h3>
                    <div className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
                      {tourney.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right panels (35%) */}
            <div className="col-span-4 space-y-6 sticky top-20">
              
              {/* Join Registration card */}
              <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-5">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">schedule</span>
                    Lobby Registration
                  </h3>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Secure your roster match slot coordinates</p>
                </div>

                {/* Main countdown details */}
                {(countdown.type === 'registration' || countdown.type === 'start') && (
                  <div className="bg-surface/50 border border-outline-variant/15 p-3.5 rounded-xl space-y-2">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">{countdown.label}</span>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { val: countdown.days, lbl: 'Days' },
                        { val: countdown.hours, lbl: 'Hrs' },
                        { val: countdown.minutes, lbl: 'Mins' },
                        { val: countdown.seconds, lbl: 'Secs' }
                      ].map((s, idx) => (
                        <div key={idx} className="bg-surface-container-low rounded-lg py-1.5 text-center border border-outline-variant/10">
                          <span className="text-sm font-black tabular-nums block text-primary">{String(s.val).padStart(2, '0')}</span>
                          <span className="text-[8px] font-bold text-on-surface-variant uppercase block mt-0.5">{s.lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {countdown.type === 'live' && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="text-xs font-black text-rose-400 uppercase tracking-widest">LIVE NOW</span>
                  </div>
                )}

                <div className="border-t border-outline-variant/25 pt-4">
                  <button onClick={handleRegister} disabled={btn.disabled}
                    className={`w-full py-3.5 min-h-[46px] rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${btnStyles[btn.style]}`}>
                    {btn.text}
                    {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
                  </button>
                </div>
              </div>

              {/* Secured room details gate card */}
              {renderRoomCredentialsCard()}

              {/* Timeline schedule */}
              <div className="glass-card rounded-2xl p-6 border border-outline-variant/10 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-on-background flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-base">schedule</span>
                  Timeline Schedule
                </h3>
                <div className="grid grid-cols-1 gap-4 border-l-2 border-outline-variant/30 pl-4 py-1 ml-2">
                  {[
                    { label: 'Check-in Opens', date: tourney.lobby_start_time || tourney.registrationCloseDate, desc: 'Decryption coordinates unlock' },
                    { label: 'Match Start', date: tourney.startDate, desc: 'Lobby locks & match begins' }
                  ].map((step, idx) => {
                    const dateObj = step.date ? new Date(step.date) : null;
                    return (
                      <div key={idx} className="relative space-y-0.5">
                        <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                        <div className="text-xs font-black text-on-background">{step.label}</div>
                        <div className="text-[10px] font-bold text-primary">
                          {dateObj ? dateObj.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                        </div>
                        <p className="text-[9px] text-on-surface-variant leading-relaxed">{step.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

        </motion.div>
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 bg-surface border border-primary/30 text-on-background px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-xs sm:bottom-6 sm:right-6">
            <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
            <span className="text-sm font-bold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TournamentDetail;