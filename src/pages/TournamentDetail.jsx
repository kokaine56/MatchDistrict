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
}

function getGameBadge(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_BADGE[key] || 'bg-primary/20 text-primary border-primary/25';
}

function AnimatedCount({ value, duration = 800 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const isCurrency = typeof value === 'string' && value.includes('₹');
    const numericStr = typeof value === 'string' ? value.replace(/[^0-9]/g, '') : String(value);
    const endValue = parseInt(numericStr, 10) || 0;
    let start = 0;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = Math.ceil(endValue / steps);
    const timer = setInterval(() => {
      start += increment;
      if (start >= endValue) { clearInterval(timer); setCurrent(endValue); }
      else { setCurrent(start); }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value, duration]);
  const formatted = useMemo(() => {
    if (typeof value === 'string' && value.includes('₹')) return `₹${current.toLocaleString('en-IN')}`;
    return current.toLocaleString();
  }, [current, value]);
  return <span>{formatted}</span>;
}

function TournamentDetail({ onNavigate, tournamentId }) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sponsorList, setSponsorList] = useState([]);
  const [totalSponsorAmount, setTotalSponsorAmount] = useState(0);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [sponsorForm, setSponsorForm] = useState({ name: '', email: '', amount: '', message: '' });
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sectionTab, setSectionTab] = useState('rules');
  const [openRule, setOpenRule] = useState('rules');
  const [sidebarTab, setSidebarTab] = useState('notices');
  const [hoveredStar, setHoveredStar] = useState(0);
  const [userRating, setUserRating] = useState(0);
  const [hostRating, setHostRating] = useState(4.9);
  const [reviewsCount, setReviewsCount] = useState(42);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [notices, setNotices] = useState([]);
  const [lobbyCredentials, setLobbyCredentials] = useState(null);
  const [lobbyError, setLobbyError] = useState('');
  const [isLobbyLoading, setIsLobbyLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // ── Organizer profile & follow state ──
  const [orgProfile, setOrgProfile] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // ── Countdown state ──
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' });

  const [currentUser, setCurrentUser] = useCurrentUser();
  const { signOut } = useUser();
  const [slotsData, setSlotsData] = useState({ slotsTotal: 100, slotsFilled: 0, slotsAvailable: 100, slots: [] });

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/tournaments/${tournamentId}/registrations`)
      .then(res => res.json()).then(data => { if (data.success && data.registrations) setRegistrations(data.registrations); }).catch(() => {});

    fetch(`/api/tournaments/${tournamentId}/slots`)
      .then(res => res.json()).then(data => { if (data.success) setSlotsData(data); }).catch(() => {});
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

  // ── Fetch organizer profile + follower count when tourney loads ──
  useEffect(() => {
    if (!tourney || !tourney.orgId) return;
    const orgId = tourney.orgId;
    fetch(`/api/users/${orgId}`, { headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.json()).then(d => { if (d?.user || d?.id) setOrgProfile(d.user || d); }).catch(() => {});
    fetch(`/api/org/followers/${orgId}`)
      .then(r => r.json()).then(d => { if (d?.count !== undefined) setFollowerCount(d.count); }).catch(() => {});
  }, [tourney?.orgId]);

  // ── Countdown timer ──
  useEffect(() => {
    if (!tourney) { setCountdown({ days:0, hours:0, minutes:0, seconds:0, label:'', active:false, type:'' }); return; }
    let target = null; let label = ''; let type = '';
    const s = (tourney.status || '').toLowerCase();
    if (s === 'completed' || s === 'archived') { setCountdown({ days:0, hours:0, minutes:0, seconds:0, label:'Tournament Ended', active:true, type:'ended' }); return; }
    if (s === 'live') { setCountdown({ days:0, hours:0, minutes:0, seconds:0, label:'LIVE NOW', active:true, type:'live' }); return; }
    if (tourney.registrationCloseDate && new Date(tourney.registrationCloseDate) > new Date()) {
      target = new Date(tourney.registrationCloseDate); label = 'Registration Closes In'; type = 'registration';
    } else if (tourney.startDate && new Date(tourney.startDate) > new Date()) {
      target = new Date(tourney.startDate); label = 'Tournament Starts In'; type = 'start';
    } else { setCountdown({ days:0, hours:0, minutes:0, seconds:0, label:'', active:false, type:'' }); return; }
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setCountdown({ days:0, hours:0, minutes:0, seconds:0, label:'Starting Soon', active:true, type:type }); return; }
      setCountdown({ days: Math.floor(diff/86400000), hours: Math.floor((diff%86400000)/3600000), minutes: Math.floor((diff%3600000)/60000), seconds: Math.floor((diff%60000)/1000), label, active:true, type });
    };
    tick(); const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
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

  const relatedTourneys = useMemo(() => {
    return tournamentsList.filter(t => t.id !== tournamentId).slice(0, 3).map(t => ({
      id: t.id, title: t.title, game: t.game, prize: t.prize, entry: t.entry,
      status: t.status === 'registrations_open' ? 'Registrations Open' : t.status === 'draft' ? 'Draft' : t.status || 'Upcoming',
      slots: `${t.slotsFilled || 0} / ${t.slotsTotal || 100}`,
      image: t.cover_image_url || t.bannerUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'
    }));
  }, [tournamentsList, tournamentId]);

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
      if (teamFilter === 'pending') return matchSearch && (team.status === 'Pending' || team.status === 'Pending Approval');
      if (teamFilter === 'waitlisted') return matchSearch && team.status === 'Waitlisted';
      return matchSearch;
    });
  }, [searchQuery, teamFilter, allTeams]);

  const myRoster = useMemo(() => {
    if (!currentUser || registrations.length === 0) return null;
    return registrations.find(r => r.user_id === currentUser.id || r.captain.toLowerCase() === currentUser.gamerTag?.toLowerCase() || r.captain.toLowerCase() === `@${currentUser.gamerTag?.toLowerCase()}` || r.captain.toLowerCase() === currentUser.name?.toLowerCase());
  }, [currentUser, registrations]);

  const isRegistered = !!myRoster;
  const isApprovedRoster = useMemo(() => myRoster ? myRoster.status === 'Approved' || myRoster.status === 'Confirmed' || myRoster.status === 'CONFIRMED' : false, [myRoster]);

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

  const handleSignOut = async () => { await signOut(); onNavigate && onNavigate('home'); };

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

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (!currentUser) { triggerToast('Please sign in to send messages.'); return; }
    const token = await getAuthToken();
    const msgData = { text: chatInput, sender_name: currentUser.gamerTag || currentUser.name || 'Anonymous', sender_role: currentUser.role || 'gamer' };
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(msgData) });
      const data = await res.json();
      if (data.success && data.message) { setChatMessages(prev => [...prev, data.message]); setChatInput(''); }
      else triggerToast(data.message || 'Failed to send message.');
    } catch (err) { triggerToast('Network error sending message.'); }
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
    const gameMode = `${(tourney.perspective || 'TPP').toUpperCase()} - ${formatLabel(tourney.match_type)}`;
    const deadline = countdown.type === 'registration' ? 'Registration Closing Soon' : countdown.type === 'start' ? 'Tournament Starting Soon' : countdown.type === 'live' ? 'LIVE NOW' : 'Register Now';
    const shareMessage = `Hurry up! Registrations are filling fast.\n\n🏆 Prize Pool: ${sharePrize}\n\n🎮 ${tourney.game} ${gameMode} Tournament\n\n⏰ ${deadline}\n\nJoin Now:\n${window.location.href}`;
    if (navigator.share) {
      navigator.share({ title: tourney.title, text: shareMessage, url: window.location.href }).catch(() => {});
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
      const res = await fetch('/api/org/follow', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ orgId: tourney.orgId }) });
      const data = await res.json();
      if (!data.success) { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast(data.message || 'Failed to update follow.'); }
      else triggerToast(prev ? 'Unfollowed organizer' : 'Following organizer');
    } catch { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast('Network error.'); }
    finally { setFollowLoading(false); }
  };

  // ── Compute events count from tournament list ──
  const orgEventsCount = useMemo(() => {
    if (!tourney?.orgId || !tournamentsList.length) return 0;
    return tournamentsList.filter(t => t.orgId === tourney.orgId || t.orgid === tourney.orgId).length;
  }, [tourney?.orgId, tournamentsList]);

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



  const gameBadgeClasses = getGameBadge(tourney.game);

  const timelineEvents = [
    { label: 'Registration Opens', date: tourney.registrationOpenDate, icon: 'edit_calendar', color: 'text-primary', state: 'future' },
    { label: 'Registration Closes', date: tourney.registrationCloseDate, icon: 'event_busy', color: 'text-secondary', state: 'future' },
    { label: 'Check-in Start', date: tourney.lobby_start_time || tourney.registrationCloseDate, icon: 'assignment_turned_in', color: 'text-tertiary', state: 'future' },
    { label: 'Match Start', date: tourney.startDate, icon: 'sports_score', color: 'text-primary', state: 'future' },
  ].map(e => {
    const now = new Date();
    const eventDate = e.date ? new Date(e.date) : null;
    let state = 'future';
    if (eventDate) {
      if (eventDate < now) state = 'past';
      else if (eventDate - now < 86400000) state = 'current';
    }
    return { ...e, dateObj: eventDate, state };
  });

  const formats = {
    solo: { label: 'Solo', icon: 'person' },
    duo: { label: 'Duo', icon: 'group' },
    squad: { label: 'Squad', icon: 'groups' },
    'team tournament': { label: 'Team', icon: 'groups_2' },
  };

  const formatIndianCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    if (isNaN(num) || num === 0) return 'Free';
    return `₹${num.toLocaleString('en-IN')}`;
  };
  const entryFee = parseInt(tourney.entry_fee_amount, 10) || 0;
  const entryDisplay = entryFee === 0 ? 'Free' : formatIndianCurrency(entryFee);
  const prizeDisplay = formatIndianCurrency(tourney.prize_pool_amount || tourney.prizePool || tourney.prize);
  const slotTotal = tourney.slotsTotal || slotsData?.slotsTotal || 100;
  const slotFilled = slotsData?.slotsFilled ?? (registrations ? registrations.filter(r => !['cancelled','expired','rejected'].includes((r.status || '').toLowerCase())).length : 0);
  const slotAvailable = Math.max(0, slotTotal - slotFilled);

  const formatLabel = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

  const startDateStr = tourney.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? startDateStr.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const formattedTime = startDateStr ? startDateStr.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'IST';

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">

      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="w-full max-w-7xl mx-auto px-5 sm:px-8 md:px-10 pt-14 pb-16 sm:pt-20 sm:pb-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mt-4 space-y-8 lg:space-y-10">

          {/* ═══════════════════ 1. HERO — poster + summary ═══════════════════ */}
          {/* flex-col mobile, flex-row lg+ so poster sits beside summary on desktop, eliminating empty space */}
          <section className="flex flex-col lg:flex-row gap-6 lg:gap-10">

            {/* ── Poster — full-width mobile, fixed 260px desktop ── */}
            <div className="w-full lg:w-[260px] shrink-0">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-surface shadow-md">
                <img src={tourney.cover_image_url || tourney.bannerUrl} alt={tourney.title}
                  className="w-full h-full object-cover" />
              </div>
            </div>

            {/* ── Summary column ── */}
            <div className="flex-1 min-w-0 space-y-7">

              {/* Title + Share */}
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-on-background leading-tight flex-1 min-w-0">
                  {tourney.title}
                </h1>
                <button onClick={handleShare}
                  className="px-2.5 py-2 min-h-[36px] rounded-xl bg-surface text-on-background border border-outline-variant/30 hover:bg-surface-container-higher transition-all text-[10px] sm:text-xs font-bold flex items-center gap-1.5 shrink-0 self-start">
                  <span className="material-symbols-outlined text-sm">share</span>
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>

              <hr className="border-outline-variant/60 my-2" />

              {/* Organizer block */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-surface border border-outline-variant/20 shrink-0">
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

              <hr className="border-outline-variant/60 my-2" />

              {/* ── Stats — 4 equal blocks ── */}
              <div className="border border-outline-variant/30 rounded-xl p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-surface rounded-xl p-4 border border-outline-variant/10 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-amber-400" style={{fontVariationSettings: "'FILL' 1"}}>emoji_events</span>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Prize Pool</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-secondary block">{prizeDisplay}</span>
                </div>
                <div className="bg-surface rounded-xl p-4 border border-outline-variant/10 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-emerald-400" style={{fontVariationSettings: "'FILL' 1"}}>currency_rupee</span>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Entry Fee</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-on-background block">{entryDisplay}</span>
                </div>
                <div className="bg-surface rounded-xl p-4 border border-outline-variant/10 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-primary" style={{fontVariationSettings: "'FILL' 1"}}>groups</span>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Slots</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-on-background block tabular-nums">{slotFilled}<span className="text-sm font-bold text-on-surface-variant"> / {slotTotal}</span></span>
                </div>
                <div className="bg-surface rounded-xl p-4 border border-outline-variant/10 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-secondary">sports_esports</span>
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Match Type</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-on-background block">{`${(tourney.perspective || 'TPP').toUpperCase()} - ${formatLabel(tourney.match_type)}`}</span>
                </div>
              </div>
              </div>

              {/* ── Countdown Timer — 4 equal segments ── */}
              {(countdown.type === 'registration' || countdown.type === 'start') && (
                <div className={`rounded-2xl p-4 border ${countdown.type === 'registration' ? 'bg-primary/10 border-primary/20' : 'bg-surface border-outline-variant/10'}`}>
                  <span className="text-[10px] sm:text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-3">
                    {countdown.label}
                  </span>
                  <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { value: countdown.days, label: 'Days' },
                      { value: countdown.hours, label: 'Hours' },
                      { value: countdown.minutes, label: 'Minutes' },
                      { value: countdown.seconds, label: 'Seconds' },
                    ].map((seg, i) => (
                      <div key={i} className="bg-surface rounded-xl py-2.5 sm:py-3 text-center border border-outline-variant/10 shadow-sm">
                        <span className={`text-base sm:text-xl lg:text-2xl font-black tabular-nums block leading-none ${countdown.type === 'registration' ? 'text-primary' : 'text-on-background'}`}>
                          {String(seg.value).padStart(2, '0')}
                        </span>
                        <span className="text-[8px] sm:text-[10px] font-bold text-on-surface-variant uppercase block mt-1">{seg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {countdown.type === 'live' && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping shrink-0" />
                  <span className="text-sm sm:text-base font-black text-rose-400 uppercase tracking-widest">LIVE NOW</span>
                </div>
              )}
              {countdown.type === 'ended' && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface border border-outline-variant/10">
                  <span className="material-symbols-outlined text-lg text-on-surface-variant">check_circle</span>
                  <span className="text-sm sm:text-base font-black text-on-surface-variant uppercase tracking-wider">Tournament Ended</span>
                </div>
              )}

              {/* ── Join CTA — immediately below timer ── */}
              <button onClick={handleRegister} disabled={btn.disabled}
                className={`w-full py-3.5 min-h-[48px] rounded-2xl font-bold text-sm sm:text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${btnStyles[btn.style]} ${btn.disabled ? 'opacity-80' : ''}`}>
                {btn.text}
                {btn.icon && <span className="material-symbols-outlined text-sm">{btn.icon}</span>}
              </button>

            </div>
          </section>

        </motion.div>
      </main>


      {/* Toast */}
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