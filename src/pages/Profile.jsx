import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from '../components/CountUp'
import Header from '../components/Header.jsx'
import OrganizerDashboard from '../components/OrganizerDashboard.jsx'
import SafeImage from '../components/SafeImage.jsx'
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx'
import { DEFAULT_AVATAR, DEFAULT_BANNER } from '../utils/defaults.js'
import {
  parseStoredUser,
  setStoredUser,
  sanitizeImageUrl,
  buildPlayerProfilePayload,
  buildOrgProfilePayload,
} from '../utils/userStorage.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useUser } from '../UserContext.jsx'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { hasCapability, getUserRoles, ROLES, hasOrganizerRights, isSystemAdmin } from '../utils/iamRoles.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { uploadImage } from '../utils/imagekitUpload'
import VerificationBadge from '../components/VerificationBadge.jsx'
import { formatDate } from '../utils/timeFormat'
import { GAME_CANONICAL_OPTIONS } from '../utils/gameUtils.js'
import GameIcon from '../components/GameIcon'
import PrizePaymentHistory from '../components/PrizePaymentHistory.jsx'
import { formatCompactPrize } from '../utils/prizePool.js'
import LoginMethodsCard from '../components/LoginMethodsCard.jsx'
import DiscordOrganiserLinkingCard from '../components/DiscordOrganiserLinkingCard.jsx'
import Avatar from '../components/Avatar.jsx'
import ProfileEditFieldModal from '../components/ProfileEditFieldModal.jsx'
import PillTabs from '../components/PillTabs.jsx'
import BottomSheetModal from '../components/BottomSheetModal.jsx'
import PaymentReviewQueue from '../components/admin/PaymentReviewQueue.jsx'
import { acquireModalLock } from '../utils/modalManager.js'
import { createPortal } from 'react-dom'

const PRESET_GAME_OPTIONS = GAME_CANONICAL_OPTIONS

const tabContentVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -15, transition: { duration: 0.2, ease: "easeIn" } }
}

const statsContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
}

const statsCardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 25 } }
}

const SUCCESSFUL_REG_STATUSES = ['pending', 'pending_payment', 'PENDING_PAYMENT_VERIFICATION', 'approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host']

const emptyPresetForm = () => ({
  game: 'BGMI',
  team_name: '',
  captain: '',
  captain_uid: '',
  players: [{ ign: '', uid: '' }, { ign: '', uid: '' }, { ign: '', uid: '' }],
  substitutes: [{ ign: '', uid: '' }, { ign: '', uid: '' }],
})

const parseRosterJson = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const normalizeSlot = (item) => {
  if (!item || typeof item !== 'object') return null;
  const ign = typeof item.ign === 'string' ? item.ign.trim() : typeof item === 'string' ? item.trim() : '';
  const uid = typeof item.uid === 'string' ? item.uid.trim() : '';
  return { ign, uid };
}

const consolidatePreset = (preset) => {
  const players = parseRosterJson(preset.players).map(normalizeSlot).filter(Boolean);
  const substitutes = parseRosterJson(preset.substitutes).map(normalizeSlot).filter(Boolean);
  const legacyMembers = parseRosterJson(preset.members).map(normalizeSlot).filter(Boolean);
  const mergedPlayers = players.length > 0 ? players : legacyMembers;
  const teamName = preset.team_name || preset.preset_name || 'Team';
  return {
    ...preset,
    team_name: teamName,
    preset_name: teamName,
    game: preset.game || 'BGMI',
    captain_uid: preset.captain_uid || '',
    players: mergedPlayers,
    substitutes,
  };
}

const presetToForm = (preset) => {
  const c = consolidatePreset(preset);
  const pad = (list, n) => {
    const out = (list || []).slice(0, n).map(item => ({ ign: item.ign || '', uid: item.uid || '' }));
    while (out.length < n) out.push({ ign: '', uid: '' });
    return out;
  };
  return {
    game: c.game,
    team_name: c.team_name,
    captain: c.captain || '',
    captain_uid: c.captain_uid,
    players: pad(c.players, 3),
    substitutes: pad(c.substitutes, 2),
  };
}

const validatePresetForm = (form) => {
  if (!form.team_name.trim()) return 'Team name is required.';
  if (form.team_name.trim().length > 16) return 'Team name must be between 1 and 16 characters.';
  if (!form.captain.trim()) return 'Captain IGN is required.';
  if (form.captain_uid.trim() && !/^\d+$/.test(form.captain_uid.trim())) return 'Captain UID must contain numbers only.';
  for (const slot of [...form.players, ...form.substitutes]) {
    if (slot.uid.trim() && !/^\d+$/.test(slot.uid.trim())) return `UIDs must contain numbers only (${slot.ign.trim() || 'player'}).`;
  }
  return null;
}

const buildPresetPayload = (form) => ({
  game: form.game || 'BGMI',
  team_name: form.team_name.trim(),
  captain: form.captain.trim(),
  captain_uid: form.captain_uid.trim(),
  players: form.players.filter(p => p.ign.trim() || p.uid.trim()),
  substitutes: form.substitutes.filter(s => s.ign.trim() || s.uid.trim()),
})

const mergePresetMutation = (prev, written) => {
  const exists = prev.some(p => p.id === written.id);
  return exists
    ? prev.map(p => p.id === written.id ? written : p)
    : [written, ...prev];
}

const getProfileBio = (user, fallback = '') => user?.orgBio ?? user?.experience ?? user?.bio ?? fallback ?? ''

function CircularUploadProgress({ progress }) {
  const radius = 17
  const circumference = 2 * Math.PI * radius
  const offset = circumference - ((progress || 0) / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative h-11 w-11">
        <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
          <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-primary transition-all duration-150"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
          {progress || 0}%
        </span>
      </div>
      <span className="text-[8px] font-bold uppercase tracking-widest text-white/85">Uploading</span>
    </div>
  )
}

function PublicOrgMatchesView({ orgData, tournamentsList, onNavigate }) {
  const [activeTab, setActiveTab] = useState('live')

  const hostedMatches = useMemo(() => {
    return tournamentsList.filter(t => t.orgId === orgData.id || t.orgName === orgData.name)
  }, [tournamentsList, orgData])

  const liveMatches = useMemo(() => hostedMatches.filter(t => t.status === 'live'), [hostedMatches])
  const upcomingMatches = useMemo(() => hostedMatches.filter(t => t.status === 'upcoming'), [hostedMatches])
  const completedMatches = useMemo(() => hostedMatches.filter(t => t.status === 'completed'), [hostedMatches])

  const getFilteredMatches = () => {
    if (activeTab === 'live') return liveMatches
    if (activeTab === 'upcoming') return upcomingMatches
    return completedMatches
  }

  const activeMatches = getFilteredMatches()

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="glass-card rounded-2xl overflow-hidden border border-outline-variant/30 shadow-sm bg-surface-container-low/40 backdrop-blur-md">
        <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest/10 px-3 sm:px-6">
          {[
            { id: 'live', label: `Ongoing (${liveMatches.length})`, icon: 'sensors' },
            { id: 'upcoming', label: `Upcoming (${upcomingMatches.length})`, icon: 'event_note' },
            { id: 'completed', label: `Recently Hosted (${completedMatches.length})`, icon: 'sports_esports' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 py-3 px-4 font-headline-md text-[11px] sm:text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/[0.08]'
                  : 'border-transparent text-on-surface-variant hover:text-on-background'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Matches Grid */}
      {activeMatches.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-outline-variant/20 bg-surface-container-low/30 backdrop-blur-sm space-y-3">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">sports_esports</span>
          <p className="text-on-surface-variant text-xs sm:text-sm">No matches listed in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeMatches.map((t, idx) => (
            <div
              key={t.id || idx}
              onClick={() => onNavigate && onNavigate('tournament-detail', t.id)}
              className="solid-card p-3 rounded-xl border border-outline-variant/20 group hover:scale-[1.01] hover:border-primary/30 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-2">
                {/* Banner */}
                <div className="relative h-24 sm:h-28 rounded-lg overflow-hidden bg-surface-container-highest border border-outline-variant/35 shadow-inner">
                  <img src={t.banner || t.bannerUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={t.title} />
                  {t.status === 'live' && (
                    <div className="absolute top-1.5 left-1.5 bg-[#ff0000] text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-label-caps font-bold flex items-center gap-1 shadow-[0_0_8px_#ff0000]">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      LIVE
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-primary/10 text-primary border border-primary/20 font-label-caps">{t.game}</span>
                    <span className="text-[9px] text-on-surface-variant/60 font-semibold">{t.startDate ? formatDate(t.startDate) : t.date}</span>
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-on-background line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h4>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-3 pt-2.5 border-t border-outline-variant/20 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-on-surface-variant/40 block font-label-caps uppercase text-[8px]">Prize Pool</span>
                  <span className="font-bold text-secondary font-prize-display whitespace-nowrap">{formatCompactPrize(t.prize)}</span>
                </div>
                <div className="text-right">
                  <span className="text-on-surface-variant/40 block font-label-caps uppercase text-[8px]">Rosters</span>
                  <span className="font-bold text-on-background">{t.slotsFilled || 0} / {t.slotsTotal || 100}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const RegCardPoster = ({ poster, game, title }) => {
  const [broken, setBroken] = useState(false);
  const safePoster = poster && !broken ? poster : null;
  return (
    <div className="absolute inset-0">
      {safePoster ? (
        <img
          src={safePoster}
          alt={title || 'Tournament poster'}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover object-center"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-surface-container-highest">
          <GameIcon game={game} size={34} rounded="rounded-lg" />
        </div>
      )}
    </div>
  );
};

const getTournamentStatusPill = (status) => {
  if (status === 'live') return { label: 'LIVE', cls: 'bg-rose-600 text-white', live: true };
  if (status === 'completed') return { label: 'COMPLETED', cls: 'bg-surface-container-high/95 text-on-surface-variant border border-outline-variant/40', live: false };
  return { label: 'UPCOMING', cls: 'bg-primary/90 text-white', live: false };
};

function Profile({ onNavigate, selectedUserProfile }) {
  const [currentUserFromContext, setCurrentUserFromContext] = useCurrentUser()
  const { signOut } = useUser()

  // currentUser is always the LOGGED-IN user. Never override with selectedUserProfile.
  const currentUser = currentUserFromContext
  const setCurrentUser = setCurrentUserFromContext
  // viewedUser is the profile being displayed (may be another user or self)
  const viewedUser = selectedUserProfile || currentUserFromContext

  // Guard ref: prevents the data-fetch useEffect from re-running when it updates
  // currentUserFromContext internally (which would cause presetsLoading to flip
  // back to true and create the Teams & Squads empty-state flicker).
  const lastFetchedUserId = React.useRef(null);

  const isOwnProfile = useMemo(() => {
    const loggedIn = currentUserFromContext
    if (!loggedIn) return false
    if (!selectedUserProfile) return true
    const profileUserId = selectedUserProfile?.id
    return loggedIn.id === profileUserId
  }, [currentUserFromContext, selectedUserProfile])

  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const resolveTab = (tab) => {
    if (!tab) return 'teams';
    const lower = String(tab).toLowerCase();
    if (lower === 'overview' || lower === 'tournaments') return 'teams';
    if (lower === 'wallet' || lower === 'prize-payments' || lower === 'payment-history' || lower === 'payments') return 'payments';
    if (lower === 'teams' || lower === 'settings' || lower === 'verifier') return lower;
    return 'teams';
  };

  const [activeTab, setActiveTabState] = useState(() => {
    const requestedTab = searchParams.get('tab') || location.state?.activeTab;
    return resolveTab(requestedTab);
  });

  const setActiveTab = (tab) => {
    const resolved = resolveTab(tab);
    setActiveTabState(resolved);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', resolved);
      return next;
    }, { replace: true });
  };

  // Redirect old /profile?tab=tournaments to /my-tournaments
  useEffect(() => {
    const requestedTab = searchParams.get('tab') || location.state?.activeTab;
    if (requestedTab && String(requestedTab).toLowerCase() === 'tournaments') {
      navigate('/my-tournaments', { replace: true });
    }
  }, [searchParams, location.state, navigate]);

  // Handle OAuth returns & URL tab sync
  useEffect(() => {
    const discordParam = searchParams.get('discord');
    const googleParam = searchParams.get('google');
    const errCode = searchParams.get('code') || searchParams.get('error') || searchParams.get('discord_error');

    if (discordParam || googleParam || (errCode && (discordParam || googleParam))) {
      setActiveTabState('settings');
      if (discordParam === 'connected' || discordParam === 'linked') {
        setShowToast(true);
        setToastMessage('Discord account connected successfully!');
      } else if (discordParam === 'error') {
        setShowToast(true);
        if (errCode === 'rate_limited') {
          const retrySec = Number(searchParams.get('retry_after')) || 60;
          const minutes = Math.max(1, Math.ceil(retrySec / 60));
          try {
            sessionStorage.setItem('discord_retry_until', String(Date.now() + (retrySec * 1000)));
          } catch {
            /* ignore storage error */
          }
          setToastMessage(`Discord is temporarily rate-limited. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        } else {
          const friendlyDiscordErrors = {
            cancelled: 'Discord authorization was cancelled.',
            access_denied: 'Discord authorization was cancelled.',
            already_linked: 'This Discord account is already connected to another user.',
            email_required: 'A Discord account with an email address is required.',
            email_unverified: 'Please verify your email address on Discord before connecting.',
            state_mismatch: 'Discord connection session expired. Please try again.',
            no_code: 'Invalid authorization request. Please try again.',
            invalid_request: 'Invalid authorization request. Please try again.',
            unauthorized: 'Please log in again before connecting Discord.',
            misconfigured: 'Discord connection is not configured on the server.',
            exchange_failed: 'Failed to authorize with Discord. Please try again.',
            save_failed: 'Failed to save Discord account details. Please try again.',
            server_error: 'A server error occurred. Please try again later.',
          };
          setToastMessage(friendlyDiscordErrors[errCode] || 'Discord connection failed.');
        }
      } else if (googleParam === 'connected' || googleParam === 'linked') {
        setShowToast(true);
        setToastMessage('Google account connected successfully!');
      } else if (googleParam === 'error') {
        setShowToast(true);
        if (errCode === 'rate_limited') {
          const retrySec = Number(searchParams.get('retry_after')) || 60;
          const minutes = Math.max(1, Math.ceil(retrySec / 60));
          setToastMessage(`Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        } else {
          const friendlyGoogleErrors = {
            cancelled: 'Google authorization was cancelled.',
            access_denied: 'Google authorization was cancelled.',
            already_linked: 'This Google account is already connected to another user.',
            state_mismatch: 'Google connection session expired. Please try again.',
            unauthorized: 'Please log in again before connecting Google.',
            server_error: 'A server error occurred. Please try again later.',
          };
          setToastMessage(friendlyGoogleErrors[errCode] || 'Google connection failed.');
        }
      }
      setSearchParams({ tab: 'settings' }, { replace: true });
      setTimeout(() => {
        const el = document.getElementById('login-methods-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return;
    }

    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl) {
      const resolved = resolveTab(tabFromUrl);
      if (resolved !== activeTab) {
        setActiveTabState(resolved);
      }
    }
  }, [searchParams, activeTab, setSearchParams]);

  const [copiedDistrictId, setCopiedDistrictId] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [profileMode, setProfileMode] = useState('player') // 'player' | 'organiser'
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingOrg, setIsEditingOrg] = useState(false)
  const [fieldModalState, setFieldModalState] = useState({ open: false, type: '', initial: '' })
  const [upiId, setUpiId] = useState('')


  useEffect(() => {
    let active = true
    getAuthToken().then((token) => {
      fetch('/api/users/me/payout-profile', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.payout_profile?.upi_id) {
            setUpiId(data.payout_profile.upi_id)
          }
        })
        .catch(() => {})
    })
    return () => {
      active = false
    }
  }, [currentUser?.id])

  // Preload lazy section chunks when Profile mounts to eliminate tab-switch delay
  useEffect(() => {
    import('./PaymentHistory.jsx').catch(() => {})
    import('./MyTournaments.jsx').catch(() => {})
  }, [])

  const formatWhatsAppDisplay = (phone) => {
    if (!phone) return 'Not added'
    const digits = String(phone).replace(/\D/g, '')
    if (!digits || digits === '91') return 'Not added'
    let core = digits
    if (core.startsWith('91') && core.length === 12) core = core.slice(2)
    if (core.length === 10) return `+91 ${core.slice(0, 5)} ${core.slice(5)}`
    return phone.startsWith('+91') ? phone : `+91 ${phone}`
  }

  // Abuse tracking states
  const [playerNameAbuse, setPlayerNameAbuse] = useState(false)
  const [playerBioAbuse, setPlayerBioAbuse] = useState(false)
  
  const [orgNameAbuse, setOrgNameAbuse] = useState(false)
  const [orgHandleAbuse, setOrgHandleAbuse] = useState(false)
  const [orgBioAbuse, setOrgBioAbuse] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)

  // Refresh user data helper
  const refreshProfileUser = () => {
    const targetUser = currentUser || currentUserFromContext;
    if (targetUser) {
      getAuthToken().then(token => {
        fetch(`/api/users/${targetUser.id}`, {
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          credentials: 'include'
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.user) {
              setCurrentUser(data.user);
              if (typeof setCurrentUserFromContext === 'function') {
                setCurrentUserFromContext(data.user);
              }
            }
          })
          .catch(() => {});
      });
    }
  };





  // Image Upload progress state
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileUploadProgress, setProfileUploadProgress] = useState(null)
  const [activeUploadField, setActiveUploadField] = useState(null) // 'avatar' | 'banner' | 'orgLogo' | 'orgBanner'
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState({})

  const [cropState, setCropState] = useState(null) // { file, src, field, width, height, shape }
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropZoomPercent, setCropZoomPercent] = useState(100)
  const cropImgRef = React.useRef(null)
  const uploadPreviewUrlsRef = React.useRef({})
  const [profileImageVersion, setProfileImageVersion] = useState(Date.now())
  
  const dragStart = React.useRef({ x: 0, y: 0 })
  const isDragging = React.useRef(false)
  const offsetAtDragStart = React.useRef({ x: 0, y: 0 })

  useEffect(() => {
    uploadPreviewUrlsRef.current = uploadPreviewUrls
  }, [uploadPreviewUrls])

  useEffect(() => {
    return () => {
      Object.values(uploadPreviewUrlsRef.current).forEach((url) => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  useEffect(() => {
    if (cropState) {
      let startingZoomPercent;
      if (cropState.shape === 'rectangle') {
        const fillZoomX = 360 / cropState.width;
        const fillZoomY = 120 / cropState.height;
        startingZoomPercent = Math.round(Math.max(fillZoomX, fillZoomY) * 100);
      } else {
        const minDimension = Math.min(cropState.width, cropState.height);
        const base = minDimension > 0 ? Math.max(200 / minDimension, 1) : 1;
        startingZoomPercent = Math.round(base * 100);
      }
      setCropZoomPercent(Math.max(10, Math.min(200, startingZoomPercent)));
      setCropOffset({ x: 0, y: 0 });
    }
  }, [cropState]);

  // Sync reference-counted modal lock for custom dialogs in Profile
  useEffect(() => {
    if (!isEditingOrg && !cropState) return;
    const release = acquireModalLock();
    return () => release();
  }, [isEditingOrg, cropState]);

  // Tournament lists and user details
  const [tournamentsList, setTournamentsList] = useState([])
  const [userRegistrations, setUserRegistrations] = useState([])
  const [presets, setPresets] = useState([])
  
  // Registration and Command Drawer settings
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [drawerTab, setDrawerTab] = useState('general')
  const [newTourney, setNewTourney] = useState({
    id: '', title: '', game: '', status: '', badgeBg: '', badgeText: '',
    date: '', prize: '', entry: '', teamsCount: '', rules: '',
    roomID: '', roomPassword: '', slotsTotal: 100, slotsFilled: 0
  })

  // Notice board inside Drawer states
  const [drawerNotices, setDrawerNotices] = useState([])
  const [newNoticeTitle, setNewNoticeTitle] = useState('')
  const [newNoticeText, setNewNoticeText] = useState('')
  const [newNoticePin, setNewNoticePin] = useState(false)

  // Roster registration lists inside Drawer
  const [drawerRegistrations, setDrawerRegistrations] = useState([])

  // Preset Create Form States
  const [isCreatingPreset, setIsCreatingPreset] = useState(false)
  const [presetForm, setPresetForm] = useState(emptyPresetForm())

  // Preset Edit Form States
  const [isEditingPreset, setIsEditingPreset] = useState(null) // presetId
  const [detailsOpenId, setDetailsOpenId] = useState(null) // presetId
  const [editForm, setEditForm] = useState(emptyPresetForm())

  // Presets game filter + delete confirmation
  const [presetGameFilter, setPresetGameFilter] = useState('All')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [presetsLoading, setPresetsLoading] = useState(true)

  // Tournament status filters
  const [tournamentFilter, setTournamentFilter] = useState('all')

  // Calendar state for tournament date view
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)
  }

  const isPhoneViewport = () => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )

  const setUploadPreview = (field, previewUrl) => {
    setUploadPreviewUrls(prev => {
      if (prev[field]?.startsWith('blob:')) {
        URL.revokeObjectURL(prev[field])
      }
      return { ...prev, [field]: previewUrl }
    })
  }

  const clearUploadPreview = (field) => {
    setUploadPreviewUrls(prev => {
      if (prev[field]?.startsWith('blob:')) {
        URL.revokeObjectURL(prev[field])
      }
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const applyUploadedProfileImage = (field, url) => {
    if (field === 'avatar') {
      setPlayerEditForm(prev => ({ ...prev, avatar: url }))
      setPlayerData(prev => ({ ...prev, avatar: url }))
    } else if (field === 'banner') {
      setPlayerEditForm(prev => ({ ...prev, banner: url }))
      setPlayerData(prev => ({ ...prev, banner: url }))
    } else if (field === 'orgLogo') {
      setOrgEditForm(prev => ({ ...prev, logo: url }))
      setOrgData(prev => ({ ...prev, logo: url }))
    } else if (field === 'orgBanner') {
      setOrgEditForm(prev => ({ ...prev, banner: url }))
      setOrgData(prev => ({ ...prev, banner: url }))
    }
  }

  const persistUploadedProfileImage = async (field, url) => {
    if (!currentUser || !url) return

    const token = await getAuthToken()
    const payload = field === 'avatar' || field === 'orgLogo'
      ? { avatar: url }
      : { banner: url }

    const res = await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    const data = await res.json()

    if (!data.success) {
      throw new Error(data.error || 'Image uploaded, but profile update failed.')
    }

    setCurrentUser(data.user)
    setCurrentUserFromContext(data.user)
    setProfileImageVersion(Date.now())
  }

  const handleImageUpload = async (file) => {
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.');
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image file must be under 5MB.');
      return null;
    }

    setIsUploadingImage(true);
    setProfileUploadProgress(40);
    triggerToast('Uploading image... Please wait.');

    try {
      const url = await uploadImage(file);
      if (!url || !sanitizeImageUrl(url)) {
        triggerToast('Upload returned an invalid image URL.');
        return null;
      }
      setProfileUploadProgress(100);
      return url;
    } catch (err) {
      triggerToast(err.message || 'Image upload failed.');
      return null;
    }
  };

  const handleCropMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetAtDragStart.current = { ...cropOffset };
    document.addEventListener('mousemove', handleCropMouseMove);
    document.addEventListener('mouseup', handleCropMouseUp);
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setCropOffset({
      x: offsetAtDragStart.current.x + dx,
      y: offsetAtDragStart.current.y + dy
    });
  };

  const handleCropMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleCropMouseMove);
    document.removeEventListener('mouseup', handleCropMouseUp);
  };

  const handleCropTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    offsetAtDragStart.current = { ...cropOffset };
    document.addEventListener('touchmove', handleCropTouchMove);
    document.addEventListener('touchend', handleCropTouchEnd);
  };

  const handleCropTouchMove = (e) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.current.x;
    const dy = e.touches[0].clientY - dragStart.current.y;
    setCropOffset({
      x: offsetAtDragStart.current.x + dx,
      y: offsetAtDragStart.current.y + dy
    });
  };

  const handleCropTouchEnd = () => {
    isDragging.current = false;
    document.removeEventListener('touchmove', handleCropTouchMove);
    document.removeEventListener('touchend', handleCropTouchEnd);
  };

  const performUpload = async (file, field) => {
    setActiveUploadField(field);
    const previewUrl = URL.createObjectURL(file);
    setUploadPreview(field, previewUrl);
    const url = await handleImageUpload(file);
    if (url) {
      applyUploadedProfileImage(field, url);
      try {
        await persistUploadedProfileImage(field, url);
        triggerToast('Profile image updated successfully!');
      } catch (err) {
        console.error(err);
        triggerToast(err.message || 'Image uploaded, but profile update failed.');
      }
      clearUploadPreview(field);
    } else {
      clearUploadPreview(field);
    }
    setIsUploadingImage(false);
    setProfileUploadProgress(null);
    setActiveUploadField(null);
  };

  const handleProfileImageSelect = (file, field) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.');
      return;
    }
    const shape = (field === 'banner' || field === 'orgBanner') ? 'rectangle' : 'circle';
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (img.width > 400 || img.height > 400) {
          setCropState({
            file,
            src: event.target.result,
            width: img.width,
            height: img.height,
            field,
            shape
          });
        } else {
          performUpload(file, field);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async () => {
    if (!cropState) return;
    const img = cropImgRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const effZoom = cropZoomPercent / 100
    if (cropState.shape === 'rectangle') {
      const containerW = 360;
      const containerH = 120;
      const imgLeft = containerW / 2 + cropOffset.x - (cropState.width * effZoom) / 2;
      const imgTop = containerH / 2 + cropOffset.y - (cropState.height * effZoom) / 2;
      const srcX = Math.max(0, (0 - imgLeft) / effZoom);
      const srcY = Math.max(0, (0 - imgTop) / effZoom);
      const srcW = Math.min(cropState.width - srcX, containerW / effZoom);
      const srcH = Math.min(cropState.height - srcY, containerH / effZoom);

      canvas.width = 1200;
      canvas.height = 400;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1200, 400);
    } else {
      canvas.width = 400;
      canvas.height = 400;

      const imgLeft = 140 + cropOffset.x - (cropState.width * effZoom) / 2;
      const imgTop = 140 + cropOffset.y - (cropState.height * effZoom) / 2;
      const cropX_img = (40 - imgLeft) / effZoom;
      const cropY_img = (40 - imgTop) / effZoom;
      const cropW_img = 200 / effZoom;
      const cropH_img = 200 / effZoom;

      ctx.drawImage(img, cropX_img, cropY_img, cropW_img, cropH_img, 0, 0, 400, 400);
    }

    canvas.toBlob(async (blob) => {
      if (!blob) {
        triggerToast('Failed to generate cropped image.');
        setCropState(null);
        return;
      }
      const croppedFile = new File([blob], cropState.file.name, { type: cropState.file.type || 'image/jpeg' });
      setCropState(null);
      await performUpload(croppedFile, cropState.field);
    }, cropState.file.type || 'image/jpeg');
  };



  const handleOpenCreateNew = () => {
    onNavigate && onNavigate('create-tournament')
  }

  const handleEditDetails = async (tId) => {
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/tournaments/${tId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.tournament) {
        const t = data.tournament;
        setNewTourney({
          id: t.id,
          title: t.title || '',
          game: t.game || 'BGMI',
          status: t.status || 'upcoming',
          badgeBg: t.badgeBg || 'bg-primary',
          badgeText: t.badgeText || 'UPCOMING',
          date: t.date || '',
          prize: t.prize || '',
          entry: t.entry || '',
          teamsCount: t.teamsCount || '',

          rules: t.rules ? (typeof t.rules === 'string' ? JSON.parse(t.rules).join('\n') : t.rules.join('\n')) : '',
          roomID: t.roomID || '',
          roomPassword: t.roomPassword || '',
          slotsTotal: t.slotsTotal || 100,
          slotsFilled: t.slotsFilled || 0
        });
        setDrawerTab('general');
        setShowEditDrawer(true);

        // Fetch Notices
        fetchNotices(t.id);
        // Fetch Registrations
        fetchRegistrations(t.id);
      }
    } catch(err) {
      console.error(err);
      triggerToast('Error fetching tournament details.');
    }
  }

  const handleSaveDrawerEdits = async () => {
    const token = await getAuthToken();
    
    // Parse rules back into array of lines
    const parsedRulesArray = newTourney.rules.split('\n').map(r => r.trim()).filter(r => r !== '');

    const payload = {
      ...newTourney,
      rules: JSON.stringify(parsedRulesArray)
    };

    try {
      const res = await fetch(`/api/tournaments/${newTourney.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setTournamentsList(prev => prev.map(item => item.id === newTourney.id ? data.tournament : item));
        setShowEditDrawer(false);
        triggerToast('Tournament Console settings saved & synchronized!');
      } else {
        triggerToast(data.message || 'Failed to update tournament.');
      }
    } catch(err) {
      console.error(err);
      triggerToast('Network error updating tournament settings.');
    }
  }

  const fetchNotices = async (tId) => {
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/tournaments/${tId}/notices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.notices) {
        setDrawerNotices(data.notices);
      }
    } catch (err) {
      console.warn('Error fetching tournament notices:', err);
    }
  };

  const addNotice = async () => {
    if (!newNoticeTitle.trim() || !newNoticeText.trim()) {
      triggerToast('Notice Title and Message are required.');
      return;
    }
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/tournaments/${newTourney.id}/notices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newNoticeTitle.trim(),
          text: newNoticeText.trim(),
          pin: newNoticePin
        })
      });
      const data = await res.json();
      if (data.success) {
        setDrawerNotices(prev => [data.notice, ...prev]);
        setNewNoticeTitle('');
        setNewNoticeText('');
        setNewNoticePin(false);
        triggerToast('Broadcast notice published to players!');
      } else {
        triggerToast('Failed to add notice.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error posting notice.');
    }
  };

  const deleteNotice = async (noticeId) => {
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/tournaments/${newTourney.id}/notices/${noticeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDrawerNotices(prev => prev.filter(n => n.id !== noticeId));
        triggerToast('Notice removed.');
      } else {
        triggerToast('Failed to delete notice.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error deleting notice.');
    }
  };

  const fetchRegistrations = async (tId) => {
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/tournaments/${tId}/registrations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.registrations) {
        setDrawerRegistrations(data.registrations);
      }
    } catch (err) {
      console.warn('Error fetching registrations:', err);
    }
  };

  const approveTeam = async (regId) => {
    const token = await getAuthToken();
    let prevRegistrations = [];
    let prevNewTourney = null;
    let prevTournamentsList = [];
    setDrawerRegistrations(prev => { prevRegistrations = prev; return prev.map(r => r.id === regId ? { ...r, status: 'approved' } : r); });
    setNewTourney(prev => { prevNewTourney = prev; return { ...prev, slotsFilled: prev.slotsFilled + 1 }; });
    setTournamentsList(prev => { prevTournamentsList = prev; return prev.map(t => t.id === newTourney.id ? { ...t, slotsFilled: t.slotsFilled + 1 } : t); });
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/tournaments/${newTourney.id}/registrations/${regId}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ note: '' })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast('Team registered and slot assigned!');
      } else {
        setDrawerRegistrations(prevRegistrations);
        setNewTourney(prevNewTourney);
        setTournamentsList(prevTournamentsList);
        triggerToast(data.message || 'Approval failed.');
      }
    } catch (err) {
      setDrawerRegistrations(prevRegistrations);
      setNewTourney(prevNewTourney);
      setTournamentsList(prevTournamentsList);
      console.error(err);
      triggerToast('Error approving team.');
    }
  };

  const rejectTeam = async (regId) => {
    const reasonPrompt = window.prompt(
      "Choose a rejection reason:\n1. Payment not received\n2. Wrong amount\n3. Invalid UTR\n4. Duplicate UTR\n5. Unclear proof\n6. Other\n\nEnter 1-6 or type a reason:",
      "1"
    );
    if (reasonPrompt === null) return;

    let reasonCode = 'other';
    let note = '';
    const trimmed = (reasonPrompt || '').trim();
    if (trimmed === '1' || /payment not received/i.test(trimmed)) reasonCode = 'payment_not_received';
    else if (trimmed === '2' || /wrong amount/i.test(trimmed)) reasonCode = 'wrong_amount';
    else if (trimmed === '3' || /invalid utr/i.test(trimmed)) reasonCode = 'invalid_utr';
    else if (trimmed === '4' || /duplicate utr/i.test(trimmed)) reasonCode = 'duplicate_utr';
    else if (trimmed === '5' || /unclear proof/i.test(trimmed)) reasonCode = 'unclear_proof';
    else {
      reasonCode = 'other';
      note = trimmed === '6' ? 'Rejected by organizer' : trimmed;
    }

    const token = await getAuthToken();
    let prevRegistrations = [];
    let prevNewTourney = null;
    let prevTournamentsList = [];
    const wasApproved = drawerRegistrations.find(r => r.id === regId)?.status === 'approved';
    setDrawerRegistrations(prev => { prevRegistrations = prev; return prev.map(r => r.id === regId ? { ...r, status: 'rejected' } : r); });
    if (wasApproved) {
      setNewTourney(prev => { prevNewTourney = prev; return { ...prev, slotsFilled: Math.max(0, prev.slotsFilled - 1) }; });
      setTournamentsList(prev => { prevTournamentsList = prev; return prev.map(t => t.id === newTourney.id ? { ...t, slotsFilled: Math.max(0, t.slotsFilled - 1) } : t); });
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/tournaments/${newTourney.id}/registrations/${regId}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ reason: reasonCode, note })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast('Registration rejected.');
      } else {
        setDrawerRegistrations(prevRegistrations);
        if (prevNewTourney) setNewTourney(prevNewTourney);
        if (prevTournamentsList.length) setTournamentsList(prevTournamentsList);
        triggerToast(data.message || 'Operation failed.');
      }
    } catch (err) {
      setDrawerRegistrations(prevRegistrations);
      if (prevNewTourney) setNewTourney(prevNewTourney);
      if (prevTournamentsList.length) setTournamentsList(prevTournamentsList);
      console.error(err);
      triggerToast('Error rejecting team.');
    }
  };

  // --- SWITCH PROFILE MODE ---
  const handleToggleProfileMode = (mode) => {
    setProfileMode(mode)
    setActiveTab('teams')
    triggerToast(`Switched to ${mode === 'player' ? 'Player Mode' : 'Organizer Mode'}`)
  }

  // --- PLAYER STATE ---
  const [playerData, setPlayerData] = useState(() => {
    const initialDistrictId = currentUserFromContext?.district_id || '';
    return {
      name: currentUserFromContext?.name || 'Gamer',
      email: currentUserFromContext?.email || '',
      phone: currentUserFromContext?.phone || '+91 ',
      riotId: currentUserFromContext?.riotId || '',
      bgmiId: currentUserFromContext?.bgmiId || '',
      steamId: currentUserFromContext?.steamId || '',
      discordTag: currentUserFromContext?.discordTag || '',
      avatar: currentUserFromContext?.avatar || '',
      banner: currentUserFromContext?.banner || '',
      bio: currentUserFromContext?.experience || currentUserFromContext?.bio || '',
      notifications: {
        matchReminders: true,
        prizePayouts: true,
        promotions: false
      }
    };
  })

  const [localMediaLoaded, setLocalMediaLoaded] = useState({ avatar: !playerData.avatar, banner: !playerData.banner })

  useEffect(() => {
    setLocalMediaLoaded({ avatar: !playerData.avatar, banner: !playerData.banner })
  }, [playerData.avatar, playerData.banner])

  const [playerEditForm, setPlayerEditForm] = useState({ ...playerData })

  // --- ORGANIZER STATE ---
  const [orgData, setOrgData] = useState({
    name: 'Apex Gaming Syndicate',
    handle: '@apex_syndicate',
    tier: 'Elite Pro Organizer',
    email: 'contact@apexgaming.gg',
    phone: '+91 98222 33445',
    website: 'https://apexgaming.gg',
    discord: 'https://discord.gg/apexgaming',
    twitter: 'https://twitter.com/apex_syndicate',
    logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=500&q=80',
    banner: DEFAULT_BANNER,
    bio: 'Premier esports tournament organizer in South Asia hosting monthly verified majors with verified prize pools across Valorant, BGMI, and CS2.',
    kycStatus: 'Verified & Active',
    staff: [
      { name: 'Alex Mercer', role: 'Owner / Head Admin', email: 'alex@apexgaming.gg' },
      { name: 'Sarah Jenkins', role: 'Bracket Manager', email: 'sarah@apexgaming.gg' },
      { name: 'David Kim', role: 'Lead Referee', email: 'david@apexgaming.gg' }
    ]
  })

  const [orgEditForm, setOrgEditForm] = useState({ ...orgData })

  const ownDistrictId = currentUser?.district_id || playerData.district_id || '—';
  const viewedDistrictId = (!isOwnProfile && viewedUser?.district_id) || ownDistrictId;

  useEffect(() => {
    // Skip if we've already fetched for this exact user — prevents the loop where
    // setCurrentUserFromContext() inside this effect re-triggers it and causes
    // presetsLoading to flicker back to true (Teams & Squads empty-state flash).
    const incomingUserId = currentUserFromContext?.id || selectedUserProfile?.id || null;
    if (incomingUserId && incomingUserId === lastFetchedUserId.current) return;
    if (incomingUserId) lastFetchedUserId.current = incomingUserId;

    async function fetchTournaments() {
      const token = await getAuthToken();
      try {
        const isOrg = currentUserFromContext && (currentUserFromContext.role === 'organiser' || currentUserFromContext.role === 'admin')
        const endpoint = isOrg ? '/api/organiser/tournaments' : '/api/tournaments'
        const res = await fetch(endpoint, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await res.json()
        if (data.success && data.tournaments) {
          setTournamentsList(data.tournaments)
        }
      } catch (err) {
        console.warn('Supabase fetch tournaments failed:', err)
      }
    }
    fetchTournaments()

    // Only use the logged-in user to populate own profile data.
    // If selectedUserProfile is set, it is a PUBLIC view — we display it read-only
    // and do NOT overwrite the logged-in user's context.
    const targetUser = currentUserFromContext
    if (targetUser) {
      try {
        // Fetch latest own profile to keep balance/data updated (only for own user)
        getAuthToken().then(token => {
          fetch(`/api/users/${targetUser.id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
            .then(res => res.json())
            .then(data => {
              if (data.success && data.user) {
                setCurrentUser(data.user)
                if (typeof setCurrentUserFromContext === 'function') {
                  setCurrentUserFromContext(data.user)
                }
                setPlayerData(prev => ({
                  ...prev,
                  name: data.user.name || prev.name,
                  avatar: data.user.avatar || prev.avatar,
                  banner: data.user.banner || prev.banner,
                  bio: data.user.experience || data.user.bio || prev.bio,
                }))
                setPlayerEditForm(prev => ({
                  ...prev,
                  name: data.user.name || prev.name,
                  avatar: data.user.avatar || prev.avatar,
                  banner: data.user.banner || prev.banner,
                  bio: data.user.experience || data.user.bio || prev.bio,
                }))
              }
            })
            .catch(e => console.error("Error fetching latest user profile:", e));
        });

        // Always populate player data first
        let storedNotifs = {
          matchReminders: true,
          prizePayouts: true,
          promotions: false
        };
        setPlayerData(prev => ({
          ...prev,
          name: targetUser.name || 'Gamer',
          email: targetUser.email,
          phone: targetUser.phone || prev.phone,
          riotId: targetUser.riotId || prev.riotId || '',
          bgmiId: targetUser.bgmiId || prev.bgmiId || '',
          steamId: targetUser.steamId || prev.steamId || '',
          discordTag: targetUser.discordTag || prev.discordTag || '',
          bio: targetUser.experience || targetUser.bio || prev.bio,
          avatar: targetUser.avatar || prev.avatar,
          banner: targetUser.banner || prev.banner,
          notifications: storedNotifs
        }))
        if (!isEditingProfile) {
          setPlayerEditForm(prev => ({
            ...prev,
            name: targetUser.name || 'Gamer',
            email: targetUser.email,
            phone: targetUser.phone || prev.phone,
            riotId: targetUser.riotId || prev.riotId || '',
            bgmiId: targetUser.bgmiId || prev.bgmiId || '',
            steamId: targetUser.steamId || prev.steamId || '',
            discordTag: targetUser.discordTag || prev.discordTag || '',
            bio: targetUser.experience || targetUser.bio || prev.bio,
            avatar: targetUser.avatar || prev.avatar,
            banner: targetUser.banner || prev.banner,
            notifications: storedNotifs
          }))
        }

        // Set default profileMode to player
        setProfileMode('player')

        // If they are an organizer, also populate orgData
        if (targetUser.role === 'organiser') {
          let parsedSocial = {}
          try {
            if (targetUser.socialLinks) {
              parsedSocial = typeof targetUser.socialLinks === 'string' ? JSON.parse(targetUser.socialLinks) : targetUser.socialLinks
            }
          } catch (e) {
            console.log("Could not parse socialLinks", e)
          }

          setOrgData(prev => ({
            ...prev,
            name: targetUser.orgName || 'Organizer',
            handle: targetUser.orgHandle || '@' + (targetUser.orgName || 'organizer').toLowerCase().replace(/\s+/g, '_'),
            email: targetUser.email,
            phone: targetUser.phone || prev.phone,
            bio: targetUser.orgBio || targetUser.experience || targetUser.bio || prev.bio,
            tier: targetUser.tier || 'Free',
            logo: targetUser.orgImage || prev.logo,
            banner: targetUser.orgBanner || targetUser.banner || prev.banner,
            website: parsedSocial.website || prev.website || '',
            discord: parsedSocial.discord || prev.discord || '',
            twitter: parsedSocial.twitter || prev.twitter || '',
            staff: [
              { name: targetUser.name || 'Admin', role: 'Owner / Head Admin', email: targetUser.email },
              ...prev.staff.slice(1)
            ]
          }))
          if (!isEditingOrg) {
            setOrgEditForm(prev => ({
              ...prev,
              name: targetUser.orgName || 'Organizer',
              handle: targetUser.orgHandle || '@' + (targetUser.orgName || 'organizer').toLowerCase().replace(/\s+/g, '_'),
              email: targetUser.email,
              tier: targetUser.tier || 'Free',
              logo: targetUser.orgImage || prev.logo,
              banner: targetUser.orgBanner || targetUser.banner || prev.banner,
              bio: targetUser.orgBio || targetUser.experience || targetUser.bio || prev.bio,
              website: parsedSocial.website || prev.website || '',
              discord: parsedSocial.discord || prev.discord || '',
              twitter: parsedSocial.twitter || prev.twitter || '',
            }))
          }
        }

        // Fetch user registrations
        getAuthToken().then(t => fetch(`/api/users/${targetUser.id}/registrations`, {
          headers: {
            'Authorization': `Bearer ${t}`
          }
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.registrations) {
              setUserRegistrations(data.registrations);
            }
          })
          .catch(e => console.error("Error fetching user registrations:", e)));

        // Fetch team presets
        setPresetsLoading(true);
        getAuthToken().then(t => {
          const headers = {};
          if (t) headers['Authorization'] = `Bearer ${t}`;
          return fetch('/api/team-presets', {
            credentials: 'include',
            headers
          })
            .then(res => res.json())
            .then(data => {
              if (data.success && data.presets) {
                setPresets(data.presets);
              }
            })
            .catch(e => console.error("Error fetching team presets:", e))
            .finally(() => setPresetsLoading(false));
        });
      } catch(e) {
        console.error(e)
      }
    }
  }, [selectedUserProfile, currentUserFromContext])


  const handleSavePlayerModal = async (e) => {
    e.preventDefault()
    if (!currentUser) return
    
    if (playerNameAbuse || playerTagAbuse) {
      triggerToast('Cannot save profile: Inappropriate words detected in fields.')
      return
    }

    const token = await getAuthToken();

    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: playerEditForm.name,
          phone: playerEditForm.phone,
          avatar: sanitizeImageUrl(playerEditForm.avatar),
        })
      })
      const data = await res.json()
      if (data.success) {
        const savedAvatar = sanitizeImageUrl(playerEditForm.avatar)
        const nextPlayer = {
          ...playerData,
          name: playerEditForm.name,
          phone: playerEditForm.phone,
          avatar: savedAvatar || playerData.avatar,
        }
        setPlayerData(nextPlayer)
        setPlayerEditForm(nextPlayer)
        setCurrentUser(data.user)
        if (typeof setCurrentUserFromContext === 'function') {
          setCurrentUserFromContext(data.user)
        }
        setIsEditingProfile(false)
        triggerToast('Profile updated successfully!')
      } else {
        triggerToast(`Failed to update profile: ${data.error || data.message || 'Error'}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error updating profile in database.')
    }
  }

  const handleSaveOrgModal = async (e) => {
    e.preventDefault()
    if (!currentUser) return

    if (orgNameAbuse || orgHandleAbuse || orgBioAbuse) {
      triggerToast('Cannot save organization: Inappropriate words detected in fields.')
      return
    }

    const token = await getAuthToken();

    try {
      const res = await fetch('/api/organization/update', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orgName: orgEditForm.name,
          orgImage: sanitizeImageUrl(orgEditForm.logo),
          orgBanner: sanitizeImageUrl(orgEditForm.banner),
          orgBio: orgEditForm.bio,
        })
      })
      const data = await res.json()
      if (data.success) {
        const savedLogo = sanitizeImageUrl(orgEditForm.logo)
        const savedBanner = sanitizeImageUrl(orgEditForm.banner)
        const nextOrg = {
          ...orgEditForm,
          bio: data.user.orgBio ?? orgEditForm.bio ?? '',
          logo: savedLogo || orgData.logo,
          banner: savedBanner || orgData.banner,
        }
        setOrgData(nextOrg)
        setOrgEditForm(nextOrg)
        setCurrentUser(data.user)
        setCurrentUserFromContext(data.user)
        setIsEditingOrg(false)
        triggerToast('Organization profile updated successfully in Supabase!')
      } else {
        triggerToast(`Failed to update organization: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error updating organization in database.')
    }
  }

  const handleSaveSettings = async (updatedFields = {}) => {
    if (!currentUser) return
    const token = await getAuthToken();

    const payload = {
      email: playerData.email,
      phone: playerData.phone,
      riotId: playerData.riotId,
      bgmiId: playerData.bgmiId,
      steamId: playerData.steamId,
      discordTag: playerData.discordTag,
      ...updatedFields
    }

    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        const updatedUser = {
          ...currentUser,
          email: data.user.email,
          phone: data.user.phone,
          riotId: data.user.riotId,
          bgmiId: data.user.bgmiId,
          steamId: data.user.steamId,
          discordTag: data.user.discordTag
        }
        setCurrentUser(updatedUser)
        setCurrentUserFromContext(updatedUser)
        
        setPlayerData(prev => ({
          ...prev,
          email: data.user.email,
          phone: data.user.phone,
          riotId: data.user.riotId,
          bgmiId: data.user.bgmiId,
          steamId: data.user.steamId,
          discordTag: data.user.discordTag
        }))

        triggerToast('Settings updated automatically!')
      } else {
        triggerToast(`Failed to auto-save settings: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error auto-saving settings.')
    }
  }

  const autoSavePassword = async (currPass, newPass, confirmPass) => {
    if (!currentUser) return
    if (isPasswordSubmitting) return

    const hasPassword = currentUser.password_set !== false && (currentUser.password_set === true || !currentUser.google_id);

    if (hasPassword && !currPass) {
      triggerToast('Please enter your current password.')
      return
    }
    if (!newPass || !confirmPass) {
      triggerToast('Please fill in both new password fields.')
      return
    }
    if (newPass !== confirmPass) {
      triggerToast('New passwords do not match!')
      return
    }
    if (newPass.length < 6) {
      triggerToast('Password must be at least 6 characters long.')
      return
    }

    setIsPasswordSubmitting(true)
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          email: currentUser.email,
          currentPassword: hasPassword ? currPass : undefined,
          newPassword: newPass,
          confirmPassword: confirmPass
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        triggerToast(hasPassword ? 'Password changed successfully!' : 'Password created successfully! You can now log in with email and password.')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        if (data.user) {
          setCurrentUser(data.user)
          if (typeof setCurrentUserFromContext === 'function') {
            setCurrentUserFromContext(data.user)
          }
        } else {
          setCurrentUser(prev => prev ? { ...prev, password_set: true } : prev)
        }
        refreshProfileUser()
      } else {
        triggerToast(`Failed: ${data.error || data.message || 'Could not update password.'}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error updating password.')
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!currentUser || !currentUser.email) return
    try {
      const res = await fetch('/api/auth/forgot-password-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Password reset link sent to ${currentUser.email}`)
      } else {
        triggerToast(data.error || 'Failed to send reset link.')
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error sending reset link.')
    }
  }

  const handleSaveOrgSettingsTab = async (e) => {
    e.preventDefault()
    if (!currentUser) return
    const token = await getAuthToken();

    try {
      const res = await fetch('/api/organization/update', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orgName: orgData.name,
          orgImage: orgData.logo,
          orgBanner: orgData.banner,
          orgBio: orgData.bio
        })
      })
      const data = await res.json()
      if (data.success) {
        setCurrentUser(data.user)
        setCurrentUserFromContext(data.user)
        setOrgData(prev => ({
          ...prev,
          name: data.user.orgName,
          logo: data.user.orgImage || prev.logo,
          banner: data.user.orgBanner || prev.banner,
          bio: data.user.orgBio || prev.bio
        }))
        triggerToast('Organization settings saved successfully to the database!')
      } else {
        triggerToast(`Failed to save organization settings: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error saving organization settings to the database.')
    }
  }

  // --- PLAYER DATA (dynamic only, no mock fallbacks) ---
  const playerTournamentsList = useMemo(() => {
    // Deduplicate by tournament_id — only take the latest registration per tournament
    const seen = new Set();
    return userRegistrations
      .filter(reg => {
        if (seen.has(reg.tournament_id)) return false;
        seen.add(reg.tournament_id);
        return true;
      })
      .map(reg => {
        const t = tournamentsList.find(tourney => tourney.id === reg.tournament_id);
        if (!t) return null;
        const regStatusRaw = reg.status || 'pending';
        let result = 'Awaiting Approval';
        if (regStatusRaw === 'approved' || regStatusRaw === 'confirmed' || regStatusRaw === 'CONFIRMED' || regStatusRaw === 'VERIFIED_BY_HOST' || regStatusRaw === 'verified_by_host') result = 'Approved & Registered';
        else if (regStatusRaw === 'waitlisted') result = 'Waitlisted';
        else if (regStatusRaw === 'rejected' || regStatusRaw === 'PAYMENT_REJECTED') result = 'Rejected';
        else if (regStatusRaw === 'pending_payment' || regStatusRaw === 'PENDING_PAYMENT_VERIFICATION') result = 'Payment Pending';
        return {
          id: t.id,
          regId: reg.id,
          title: t.title,
          game: t.game,
          status: t.status || 'upcoming',
          startDate: t.startDate || null,
          dateFormatted: t.startDate ? formatDate(t.startDate) : 'TBD',
          prize: t.prize || 'TBA',
          entry: t.entry || 'Free',
          orgName: t.orgName || '',
          poster: t.cover_image_url || t.bannerUrl || t.banner || null,
          logoUrl: t.logoUrl || null,
          slotsTotal: t.slotsTotal || 0,
          slotsFilled: t.slotsFilled || 0,
          registrationCloseDate: t.registrationCloseDate || null,
          regStatus: regStatusRaw,
          result,
          teamName: reg.team_name || '',
          captain: reg.captain || '',
          slotNumber: reg.slot_number || null,
        };
      }).filter(Boolean);
  }, [userRegistrations, tournamentsList]);

  // Calendar: set of date keys 'YYYY-M-D' for all registered tournaments
  const tournamentDateSet = useMemo(() => {
    const s = new Set();
    playerTournamentsList.forEach(t => {
      if (t.startDate) {
        const d = new Date(t.startDate);
        if (!isNaN(d.getTime())) {
          s.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
      }
    });
    return s;
  }, [playerTournamentsList]);

  const filteredPlayerTournaments = useMemo(() => {
    let list = tournamentFilter === 'all'
      ? playerTournamentsList
      : playerTournamentsList.filter(t => t.status === tournamentFilter);
    if (selectedCalDate) {
      list = list.filter(t => {
        if (!t.startDate) return false;
        const d = new Date(t.startDate);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === selectedCalDate;
      });
    }
    return list;
  }, [playerTournamentsList, tournamentFilter, selectedCalDate]);

  const teamMembers = useMemo(() => {
    return userRegistrations.map(reg => {
      const tourney = tournamentsList.find(t => t.id === reg.tournament_id);
      let parsedMembers = [];
      try {
        parsedMembers = typeof reg.members === 'string' ? JSON.parse(reg.members) : reg.members;
      } catch (e) {
        parsedMembers = [];
      }
      const roster = [reg.captain, ...(parsedMembers || []).map(m => (m && typeof m === 'object' ? (m.ign || m.uid || '') : m))].filter(Boolean);
      return {
        name: reg.team_name,
        tag: `Captain: ${reg.captain} | Tournament: ${tourney ? tourney.title : 'Unknown'}`,
        status: reg.status === 'approved' ? 'Active' : reg.status === 'waitlisted' ? 'Waitlisted' : 'Pending',
        members: roster
      };
    });
  }, [userRegistrations, tournamentsList]);

  // --- PRESET CRUD OPERATIONS ---
  const handleCreatePreset = async (e) => {
    e.preventDefault();
    const error = validatePresetForm(presetForm);
    if (error) {
      triggerToast(error);
      return;
    }

    const duplicate = presets.some(p => (p.game || 'BGMI') === (presetForm.game || 'BGMI')
      && p.team_name.toLowerCase() === presetForm.team_name.trim().toLowerCase());
    if (duplicate) {
      triggerToast('A preset with this team name already exists.');
      return;
    }

    if (presets.length >= 4) {
      triggerToast('Maximum limit of 4 team presets reached.');
      return;
    }

    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch('/api/team-presets', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(buildPresetPayload(presetForm))
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => mergePresetMutation(prev, data.preset));
        setPresetForm(emptyPresetForm());
        setIsCreatingPreset(false);
        setDetailsOpenId(null);
        triggerToast('Team preset saved successfully!');
      } else {
        triggerToast(data.message || 'Failed to save team preset.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error saving team preset.');
    }
  };

  const handleUpdatePreset = async (presetId) => {
    const error = validatePresetForm(editForm);
    if (error) {
      triggerToast(error);
      return;
    }

    const duplicate = presets.some(p => p.id !== presetId
      && (p.game || 'BGMI') === (editForm.game || 'BGMI')
      && p.team_name.toLowerCase() === editForm.team_name.trim().toLowerCase());
    if (duplicate) {
      triggerToast('A preset with this team name already exists.');
      return;
    }

    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`/api/team-presets/${presetId}`, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify(buildPresetPayload(editForm))
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => mergePresetMutation(prev, data.preset));
        setIsEditingPreset(null);
        setDetailsOpenId(null);
        setEditForm(emptyPresetForm());
        triggerToast('Team preset updated successfully!');
      } else {
        triggerToast(data.message || 'Failed to update preset.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error updating preset.');
    }
  };

  const handleEditStart = (preset) => {
    setEditForm(presetToForm(preset));
    setIsEditingPreset(preset.id);
    setIsCreatingPreset(false);
    setDetailsOpenId(null);
  };

  const handleDeletePreset = async (presetId) => {
    const token = await getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`/api/team-presets/${presetId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => prev.filter(p => p.id !== presetId));
        setDeleteConfirmId(null);
        setDetailsOpenId(null);
        triggerToast('Preset deleted successfully.');
      } else {
        triggerToast('Failed to delete preset.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error deleting preset.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  }

  // --- DERIVED VALUES (teams) ---
  const filteredPresets = useMemo(() => {
    const all = presets.map(p => consolidatePreset(p))
    return presetGameFilter === 'All' ? all : all.filter(p => (p.game || 'BGMI') === presetGameFilter)
  }, [presets, presetGameFilter])

  return (
    <>
      {/* Toast Notification */}
      {showToast && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          className="fixed left-4 right-4 sm:left-auto sm:right-6 z-[200] glass-card bg-surface-container-highest/95 backdrop-blur-2xl border border-primary/50 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-[0_10px_40px_rgba(192,193,255,0.3)] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <span className="material-symbols-outlined text-primary text-2xl">check_circle</span>
          <span className="font-body-md font-medium">{toastMessage}</span>
        </div>,
        document.body
      )}

      {/* Edit Tournament Command Drawer */}
      {showEditDrawer && typeof document !== 'undefined' && createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[120] flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass-card bg-surface-container-highest/95 backdrop-blur-2xl border-l border-outline-variant/50 w-full max-w-xl h-full shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between shrink-0 bg-surface-container-low/50">
              <div className="space-y-0.5">
                <h3 className="font-display-md text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-xl sm:text-2xl animate-pulse">settings</span>
                  Tournament Console
                </h3>
                <p className="font-body-sm text-[10px] text-on-surface-variant font-semibold tracking-wide uppercase">{newTourney.title}</p>
              </div>
              <button 
                onClick={() => {
                  setShowEditDrawer(false);
                  triggerToast('Command drawer closed.');
                }} 
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-white flex items-center justify-center transition-colors border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Drawer Tab Navigation */}
            <div className="p-3 border-b border-outline-variant/20 bg-surface-container-lowest/30 shrink-0 no-scrollbar overflow-x-auto">
              <PillTabs
                size="sm"
                activeId={drawerTab}
                onChange={(id) => setDrawerTab(id)}
                tabs={[
                  { id: 'general', label: 'General', icon: 'settings' },
                  { id: 'lobby', label: 'Lobby Info', icon: 'key' },
                  { id: 'notices', label: 'Noticeboard', icon: 'campaign' },
                  { id: 'rosters', label: 'Roster Approvals', icon: 'groups' }
                ]}
              />
            </div>

            {/* Drawer scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5 bg-surface-container-low/20">
              
              {/* General details edit Tab */}
              {drawerTab === 'general' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Tournament Title</label>
                    <input 
                      type="text" 
                      value={newTourney.title} 
                      onChange={(e) => setNewTourney({...newTourney, title: e.target.value})}
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Game</label>
                      <select 
                        value={newTourney.game}
                        onChange={(e) => setNewTourney({...newTourney, game: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                      >
                        <option value="BGMI">BGMI</option>
                        <option value="VALORANT">Valorant</option>
                        <option value="CS2">CS2</option>
                        <option value="FREE FIRE">Free Fire</option>
                      </select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Prize Pool</label>
                      <input 
                        type="text" 
                        value={newTourney.prize} 
                        onChange={(e) => setNewTourney({...newTourney, prize: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm font-semibold font-prize-display text-secondary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Total Slots</label>
                      <input 
                        type="number" 
                        value={newTourney.slotsTotal} 
                        onChange={(e) => setNewTourney({...newTourney, slotsTotal: parseInt(e.target.value) || 100})}
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Format</label>
                      <input 
                        type="text" 
                        value={newTourney.format} 
                        onChange={(e) => setNewTourney({...newTourney, format: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Official Rules &amp; Guidelines</label>
                    <textarea 
                      rows="6"
                      value={newTourney.rules} 
                      onChange={(e) => setNewTourney({...newTourney, rules: e.target.value})}
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm custom-scrollbar"
                    />
                  </div>
                </div>
              )}

              {/* Lobby Coordinates Tab */}
              {drawerTab === 'lobby' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="glass-card p-4 rounded-xl border border-secondary/20 bg-secondary/5 space-y-2">
                    <h4 className="font-headline-md text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">security</span>
                      Room Credentials Security
                    </h4>
                    <p className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant leading-relaxed">
                      Coordinates are only revealed to players/squads whose registrations have been marked as <strong className="text-secondary">Approved</strong> in the Roster Approvals tab.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Custom Room ID</label>
                      <input 
                        type="text" 
                        value={newTourney.roomID} 
                        onChange={(e) => setNewTourney({...newTourney, roomID: e.target.value})}
                        placeholder="e.g. 5894102"
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Room Password</label>
                      <input 
                        type="text" 
                        value={newTourney.roomPassword} 
                        onChange={(e) => setNewTourney({...newTourney, roomPassword: e.target.value})}
                        placeholder="e.g. md_lobby_42"
                        className="w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-white font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notices Tab */}
              {drawerTab === 'notices' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Create New Notice */}
                  <div className="glass-card p-4 rounded-2xl border border-outline-variant/30 bg-surface-container space-y-4">
                    <h4 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-base">add_comment</span>
                      Publish Live Notice / Notice Board
                    </h4>
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">Notice Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Server delayed by 10 mins" 
                          value={newNoticeTitle}
                          onChange={(e) => setNewNoticeTitle(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-white font-body-sm text-xs focus:border-secondary outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">Message Description</label>
                        <textarea 
                          placeholder="Provide any instructions or emergency details here..." 
                          rows="3"
                          value={newNoticeText}
                          onChange={(e) => setNewNoticeText(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-white font-body-sm text-xs focus:border-secondary outline-none custom-scrollbar"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={newNoticePin} 
                            onChange={(e) => setNewNoticePin(e.target.checked)}
                            className="w-4 h-4 rounded border-outline-variant bg-surface-container-low text-secondary focus:ring-0" 
                          />
                          <span className="font-body-sm text-[11px] text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-secondary">push_pin</span> Pin to Top of Noticeboard
                          </span>
                        </label>

                        <button 
                          type="button"
                          onClick={addNotice}
                          className="px-4 min-h-[44px] bg-secondary hover:bg-secondary/95 text-background font-headline-md text-xs font-bold rounded-lg transition-all"
                        >
                          Push Notice
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Notices list */}
                  <div className="space-y-3">
                    <h4 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider border-b border-outline-variant/30 pb-2">
                      Active Notices ({drawerNotices.length})
                    </h4>
                    
                    {drawerNotices.length === 0 ? (
                      <div className="text-center py-6 text-on-surface-variant text-xs font-body-sm">
                        No active notices published for this tournament.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {drawerNotices.map((n) => (
                          <div 
                            key={n.id}
                            className={`glass-card p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                              n.pin 
                                ? 'bg-secondary/5 border-secondary/40 shadow-[0_0_10px_rgba(192,193,255,0.05)]' 
                                : 'bg-surface-container-highest/60 border-outline-variant/30'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {n.pin && (
                                  <span className="material-symbols-outlined text-xs text-secondary shrink-0">push_pin</span>
                                )}
                                <h5 className="font-headline-md text-xs font-bold text-white truncate">{n.title}</h5>
                                <span className="font-body-sm text-[9px] text-on-surface-variant ml-auto shrink-0">
                                  {n.created_at ? new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : (n.time || '')}
                                </span>
                              </div>
                              <p className="font-body-sm text-[11px] text-on-surface-variant/90 leading-relaxed break-words">{n.text}</p>
                            </div>
                            
                            <button 
                              type="button"
                              onClick={() => deleteNotice(n.id)}
                              className="p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 text-on-surface-variant transition-colors"
                              title="Delete notice"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Roster Approvals Tab */}
              {drawerTab === 'rosters' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center border-b border-outline-variant/30 pb-2">
                    <h4 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">
                      Registered Roster List ({drawerRegistrations.length})
                    </h4>
                    
                    <span className="font-body-sm text-[10px] text-on-surface-variant">
                      Slots filled: <strong className="text-secondary">{newTourney.slotsFilled}</strong> / {newTourney.slotsTotal}
                    </span>
                  </div>

                  {drawerRegistrations.length === 0 ? (
                    <div className="text-center py-10 text-on-surface-variant text-xs font-body-sm">
                      No registrations received yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {drawerRegistrations.map((t, idx) => {
                        const isApproved = t.status === 'approved';
                        const isWaitlisted = t.status === 'waitlisted';
                        let parsedMembers = [];
                        try {
                          parsedMembers = typeof t.members === 'string' ? JSON.parse(t.members) : (t.members || []);
                        } catch (e) {
                          parsedMembers = [];
                        }
                        
                        return (
                          <div 
                            key={t.id || idx}
                            className={`glass-card p-4 rounded-xl border transition-all ${
                              isApproved 
                                ? 'bg-emerald-500/5 border-emerald-500/30' 
                                : isWaitlisted 
                                  ? 'bg-amber-500/5 border-amber-500/30'
                                  : 'bg-surface-container-highest border-outline-variant/30'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-headline-md text-sm font-bold text-white tracking-tight truncate">{t.team_name}</h4>
                                  <span className={`px-2 py-0.5 rounded font-label-caps text-[8px] font-bold uppercase tracking-wider ${
                                    isApproved 
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                      : isWaitlisted
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'bg-primary/20 text-primary border border-primary/30'
                                  }`}>
                                    {t.status}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body-sm text-[11px] text-on-surface-variant">
                                  <span>Captain: <strong className="text-white font-medium">{t.captain}</strong></span>
                                  <span>•</span>
                                  <span>Players: <strong className="text-white font-medium">{parsedMembers.length + 1}</strong></span>
                                </div>
                                {parsedMembers.length > 0 && (
                                  <div className="text-[10px] text-on-surface-variant font-medium pt-1">
                                    Roster: {parsedMembers.join(', ')}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                {!isApproved && (
                                  <button 
                                    type="button"
                                    onClick={() => approveTeam(t.id)}
                                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-headline-md text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">check</span>
                                    Approve
                                  </button>
                                )}
                                
                                <button 
                                  type="button"
                                  onClick={() => rejectTeam(t.id)}
                                  className="px-3 py-1.5 bg-surface-container hover:bg-rose-500/20 hover:text-rose-400 border border-outline-variant/30 text-on-surface-variant font-headline-md text-[11px] font-bold rounded-lg transition-all flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">close</span>
                                  Disqualify
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer actions */}
            <div className="px-6 py-4 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between shrink-0">
              <button 
                type="button"
                onClick={() => {
                  setShowEditDrawer(false);
                  triggerToast('Changes discarded.');
                }}
                className="px-5 py-2 border border-outline hover:bg-surface-variant active:scale-95 transition-all text-white rounded-lg font-headline-md text-xs font-semibold"
              >
                Cancel
              </button>
              
              <button 
                type="button"
                onClick={handleSaveDrawerEdits}
className="px-6 min-h-[44px] bg-secondary hover:bg-secondary/95 active:scale-95 text-background rounded-lg font-headline-md text-xs font-bold shadow-lg transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">publish</span>
                  Publish Updates
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Header activePage="profile" onNavigate={onNavigate} />

      {/* Main Content */}
      {!currentUser ? (
        <main className="w-full max-w-container-max mx-auto px-4 sm:px-sm md:px-lg pt-28 pb-16 sm:pt-36 sm:pb-24 flex items-center justify-center min-h-[calc(100vh-140px)] relative overflow-hidden isolate">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-error/15 blur-[120px] rounded-full pointer-events-none -z-10"></div>
          
          <div className="w-full max-w-lg glass-card bg-surface-container-lowest/60 backdrop-blur-2xl border border-outline-variant/60 rounded-3xl p-8 sm:p-12 shadow-[0_20px_70px_rgba(0,0,0,0.45)] text-center space-y-6 animate-in fade-in zoom-in-95 duration-300 relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-error/20 border border-error/40 flex items-center justify-center mx-auto text-error shadow-[0_0_30px_rgba(255,0,0,0.3)] animate-pulse">
              <span className="material-symbols-outlined text-3xl sm:text-4xl">lock_person</span>
            </div>
            <div className="space-y-2">
              <h1 className="font-display-lg text-2xl sm:text-3xl font-extrabold text-on-background tracking-tight">Access Restricted</h1>
              <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                User profiles and tournament management hubs are exclusively available to authenticated Match District members.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <button 
                onClick={() => onNavigate && onNavigate('login')} 
                className="w-full py-4 bg-primary hover:bg-primary/90 active:scale-95 transition-all text-on-primary rounded-xl font-headline-md text-sm sm:text-base font-bold shadow-[0_0_25px_rgba(90,93,250,0.4)] flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">login</span> Log In / Register Account
              </button>
              <button 
                onClick={() => onNavigate && onNavigate('home')} 
                className="w-full py-3 bg-surface-container-highest hover:bg-surface-variant text-on-surface-variant hover:text-on-background border border-outline-variant rounded-xl font-headline-md text-xs sm:text-sm font-bold transition-all shadow-sm"
              >
                Return to Homepage
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main className="w-full max-w-container-max mx-auto px-4 sm:px-sm md:px-lg pt-20 pb-10 sm:pt-28 sm:pb-10 space-y-6 sm:space-y-8">
          {/* ========================================================= */}
          {/*                     PLAYER MODE VIEW                      */}
          {/* ========================================================= */}
          {/* Public Organizer View — shown when viewing another organizer's profile */}
          {!isOwnProfile && viewedUser?.role === 'organiser' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Back button */}
              <button
                onClick={() => onNavigate && onNavigate('explore-organisers')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Back to Organisers
              </button>

              {/* Public Organizer Profile Card */}
              <div className="glass-card rounded-[20px] sm:rounded-[24px] border border-slate-200/60 dark:border-slate-700/60 shadow-2xl bg-surface/60 backdrop-blur-xl relative overflow-hidden">
                {/* Cover Banner */}
                <div className="h-[180px] sm:h-[240px] lg:h-[280px] w-full relative overflow-hidden bg-slate-950">
                  <img
                    src={viewedUser.banner || DEFAULT_BANNER}
                    alt="Organizer Banner"
                    className="w-full h-full object-cover object-center"
                  />
                </div>

                {/* Avatar / Logo — overlaps banner edge 50/50 */}
                <div className="flex justify-center md:justify-start px-4 md:px-6 relative z-10 -mt-10 sm:-mt-12 lg:-mt-14">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full p-[3px] bg-gradient-to-tr from-primary via-primary/50 to-secondary shadow-lg transition-transform duration-300 hover:scale-[1.02] shrink-0">
                    <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-surface bg-surface-variant">
                      {viewedUser.orgImage || viewedUser.avatar
                        ? <img src={viewedUser.orgImage || viewedUser.avatar} alt={viewedUser.orgName || viewedUser.name} className="avatar-img" />
                        : <img src={DEFAULT_AVATAR} alt="Default Avatar" className="avatar-img" />}
                    </div>
                  </div>
                </div>

                {/* Content section */}
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 sm:pt-4 relative z-10">
                  {/* Top row: Info + stats / badges */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1 min-w-0 text-center md:text-left">
                      {/* Name */}
                      <h1 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-black text-on-background tracking-tight flex items-center justify-center md:justify-start gap-2 flex-wrap">
                        <span>{viewedUser.orgName || viewedUser.name}</span>
                        <VerificationBadge tier={viewedUser.tier} size="sm" />
                      </h1>

                      {/* District ID */}
                      <p className="text-on-surface-variant text-xs sm:text-sm font-mono opacity-60 mt-0.5">District ID {viewedDistrictId}</p>

                      {/* Bio */}
                      {(viewedUser.orgBio || viewedUser.experience || viewedUser.bio) && (
                        <p className="mt-4 font-body-sm text-[11px] sm:text-xs text-on-surface-variant/90 max-w-[700px] mx-auto md:mx-0 leading-relaxed text-center md:text-left">
                          {viewedUser.orgBio || viewedUser.experience || viewedUser.bio}
                        </p>
                      )}
                    </div>

                    {/* Right side stats + tier badges */}
                    <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-md justify-center">
                        {[
                          { label: 'Followers', value: viewedUser.followers ?? 0, icon: 'group' },
                          { label: 'Events', value: viewedUser.tournamentsHosted ?? 0, icon: 'sports_esports' },
                          { label: 'Rating', value: viewedUser.rating ?? '—', icon: 'star' },
                        ].map(s => (
                          <div key={s.label} className="rounded-xl px-2 py-2 sm:px-3 sm:py-3 text-center bg-surface-container border border-outline-variant/40 min-w-[70px]">
                            <span className="material-symbols-outlined text-primary text-sm sm:text-base block mb-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                            <div className="font-bold text-xs sm:text-sm text-on-background">{s.value}</div>
                            <div className="text-on-surface-variant text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-50">{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tier badges */}
                      <div className="flex items-center justify-center md:justify-end gap-2 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                          (viewedUser.tier || '').toLowerCase() === 'elite' ? 'text-primary border-primary/30 bg-primary/8' :
                          (viewedUser.tier || '').toLowerCase() === 'pro'   ? 'text-amber-400 border-amber-400/30 bg-amber-400/8' :
                          (viewedUser.tier || '').toLowerCase() === 'basic' ? 'text-[#1d9bf0] border-[#1d9bf0]/30 bg-[#1d9bf0]/8' :
                          'text-on-surface-variant border-outline-variant bg-surface-container'
                        }`}>{viewedUser.tier || 'Free'} Plan</span>
                        {viewedUser.kycVerified && (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border text-emerald-400 border-emerald-400/30 bg-emerald-400/8 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span> KYC Verified
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tournaments hosted by this organizer */}
              <PublicOrgMatchesView
                orgData={{ id: viewedUser.id, name: viewedUser.orgName || viewedUser.name }}
                tournamentsList={tournamentsList}
                onNavigate={onNavigate}
              />
            </div>
          )}

          {/* Own Profile View — only rendered when viewing your own profile */}
          {isOwnProfile && (
            <>
              <div className="space-y-4">
                {/* Minimal Profile Header */}
                <div className="flex flex-col items-center justify-center text-center pt-2 sm:pt-4 pb-1 max-w-sm mx-auto">
                  {/* Round profile image using shared Avatar component */}
                  <Avatar
                    user={playerData || currentUser}
                    size="2xl"
                    className="w-20 h-20 sm:w-24 sm:h-24 shadow-sm"
                  />

                  {/* Display name under it */}
                  <h1 className="font-headline-md text-lg sm:text-xl font-black text-on-background tracking-tight mt-2.5 truncate max-w-full">
                    {playerData.name}
                  </h1>

                  {/* District ID under that: plain label "District ID" with number + copy button */}
                  <div className="flex items-center gap-1.5 mt-1 text-on-surface-variant font-body-sm text-xs">
                    <span className="font-medium text-on-surface-variant">District ID {ownDistrictId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (ownDistrictId) {
                          navigator.clipboard?.writeText(String(ownDistrictId));
                          setCopiedDistrictId(true);
                          setTimeout(() => setCopiedDistrictId(false), 1500);
                        }
                      }}
                      className="p-1 rounded hover:bg-surface-variant transition-colors text-on-surface-variant hover:text-primary flex items-center justify-center"
                      title="Copy District ID"
                      aria-label="Copy District ID"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {copiedDistrictId ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    {copiedDistrictId && (
                      <span className="text-[10px] font-bold text-primary animate-fade-in">
                        Copied
                      </span>
                    )}
                  </div>

                  {/* Email address on next line (small, muted, single line with ellipsis if long) */}
                  <p className="text-[11px] sm:text-xs text-on-surface-variant/70 truncate max-w-[280px] sm:max-w-xs mt-0.5">
                    {playerData.email || (currentUser || currentUserFromContext)?.email || ''}
                  </p>
                </div>

                {/* Pill tab row for "Teams & Squads", "Payment History", "Settings" */}
                <div className="w-full flex items-center justify-center mt-3">
                  <PillTabs
                    tabs={[
                      { id: 'teams', label: 'Teams & Squads' },
                      { id: 'payments', label: 'Payment History' },
                      { id: 'settings', label: 'Settings' }
                    ]}
                    activeId={activeTab === 'wallet' || activeTab === 'prize-payments' ? 'payments' : activeTab}
                    onChange={(id) => setActiveTab(id)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Own Profile Tab Content wrapper */}
          {isOwnProfile && (
            <div 
              className="pt-4 sm:pt-6 pb-28 sm:pb-12 min-h-[520px]"
              style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}
            >
              {/* ===== TAB 1: TEAMS & SQUADS ===== */}
              <div
                key="teams"
                className={activeTab === 'teams' ? 'space-y-5' : 'hidden'}
              >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-headline-md text-sm font-bold text-on-background flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-base">groups_2</span>
                        Teams &amp; Squads
                      </h3>
                      <p className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">
                        Save up to 4 squad presets and reuse them during tournament registration.
                      </p>
                    </div>
                    {presets.length < 4 && !isCreatingPreset && (
                      <button
                        onClick={() => { setPresetForm(emptyPresetForm()); setIsCreatingPreset(true); setIsEditingPreset(null); setDetailsOpenId(null); }}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-secondary hover:bg-secondary/90 text-on-primary rounded-xl font-headline-md text-[11px] font-bold transition-all shadow-sm shrink-0"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        New Squad
                      </button>
                    )}
                  </div>

                  {/* Game filter chips */}
                  {presets.length > 0 && (
                    <PillTabs
                      size="sm"
                      tabs={['All', ...PRESET_GAME_OPTIONS]
                        .map((game) => {
                          const count = game === 'All' ? presets.length : presets.filter(p => (p.game || 'BGMI') === game).length;
                          if (game !== 'All' && count === 0) return null;
                          return { id: game, label: `${game}${count > 0 ? ` (${count})` : ''}` };
                        })
                        .filter(Boolean)}
                      activeId={presetGameFilter}
                      onChange={(id) => setPresetGameFilter(id)}
                    />
                  )}

                  {/* INLINE CREATE FORM */}
                  {isCreatingPreset && (
                    <form onSubmit={handleCreatePreset} className="glass-card p-4 sm:p-5 rounded-2xl border border-secondary/40 bg-surface-container-highest/70 space-y-5 shadow-md animate-in slide-in-from-top-3 duration-200">
                      <div className="flex items-center justify-between">
                        <h4 className="font-headline-md text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">group_add</span> Create Squad
                        </h4>
                        <button type="button" onClick={() => setIsCreatingPreset(false)} className="p-1 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors">
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>

                      {/* Game */}
                      <div className="space-y-1">
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block">Game *</label>
                        <select value={presetForm.game} onChange={e => setPresetForm({ ...presetForm, game: e.target.value })} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-secondary transition-colors">
                          {PRESET_GAME_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>

                      {/* Team name */}
                      <div className="space-y-1">
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block">Team Name * <span className="normal-case text-on-surface-variant/60">(max 16 chars)</span></label>
                        <input type="text" value={presetForm.team_name} onChange={e => setPresetForm({ ...presetForm, team_name: e.target.value })} placeholder="e.g. Team Hercules" maxLength={16} required className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-secondary transition-colors" />
                      </div>

                      {/* Captain */}
                      <div>
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Captain / Player 1 *</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] text-on-surface-variant">IGN *</label>
                            <input type="text" value={presetForm.captain} onChange={e => setPresetForm({ ...presetForm, captain: e.target.value })} placeholder="In-game name" required className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-on-surface-variant">UID</label>
                            <input type="text" value={presetForm.captain_uid} onChange={e => setPresetForm({ ...presetForm, captain_uid: e.target.value.replace(/\D/g, '') })} placeholder="Numeric ID" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                          </div>
                        </div>
                      </div>

                      {/* Players 2–4 */}
                      <div>
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Players 2-4</label>
                        <div className="space-y-2">
                          {presetForm.players.map((p, pIdx) => (
                            <div key={pIdx} className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] text-on-surface-variant">Player {pIdx + 2} IGN</label>
                                <input type="text" value={p.ign} onChange={e => { const u = [...presetForm.players]; u[pIdx] = { ...u[pIdx], ign: e.target.value }; setPresetForm({ ...presetForm, players: u }); }} placeholder="IGN" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-on-surface-variant">UID</label>
                                <input type="text" value={p.uid} onChange={e => { const u = [...presetForm.players]; u[pIdx] = { ...u[pIdx], uid: e.target.value.replace(/\D/g, '') }; setPresetForm({ ...presetForm, players: u }); }} placeholder="Numeric ID" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Substitutes */}
                      <div>
                        <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Substitutes <span className="normal-case text-on-surface-variant/60">(optional)</span></label>
                        <div className="space-y-2">
                          {presetForm.substitutes.map((s, sIdx) => (
                            <div key={sIdx} className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] text-on-surface-variant">Sub {sIdx + 1} IGN</label>
                                <input type="text" value={s.ign} onChange={e => { const u = [...presetForm.substitutes]; u[sIdx] = { ...u[sIdx], ign: e.target.value }; setPresetForm({ ...presetForm, substitutes: u }); }} placeholder="IGN" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-on-surface-variant">UID</label>
                                <input type="text" value={s.uid} onChange={e => { const u = [...presetForm.substitutes]; u[sIdx] = { ...u[sIdx], uid: e.target.value.replace(/\D/g, '') }; setPresetForm({ ...presetForm, substitutes: u }); }} placeholder="Numeric ID" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-secondary transition-colors" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>


                      {/* Actions */}
                      <div className="flex justify-end gap-2 pt-1 border-t border-outline-variant/20">
                        <button type="button" onClick={() => setIsCreatingPreset(false)} className="px-4 py-2 bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/40 rounded-lg font-headline-md text-xs font-semibold transition-colors">Cancel</button>
                        <button type="submit" className="px-5 py-2 bg-secondary hover:bg-secondary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm">Save Squad</button>
                      </div>
                    </form>
                  )}

                  {/* INLINE EDIT FORM */}
                  {isEditingPreset && (() => {
                    const current = presets.find(p => p.id === isEditingPreset);
                    if (!current) return null;
                    return (
                      <form onSubmit={e => { e.preventDefault(); handleUpdatePreset(current.id); }} className="glass-card p-4 sm:p-5 rounded-2xl border border-primary/40 bg-surface-container-highest/70 space-y-5 shadow-md animate-in slide-in-from-top-3 duration-200">
                        <div className="flex items-center justify-between">
                          <h4 className="font-headline-md text-xs font-bold text-primary flex items-center gap-2">
                            <GameIcon game={current.game || 'BGMI'} size={28} rounded="rounded-lg" />
                            <span className="normal-case">Edit {current.team_name}</span>
                          </h4>
                          <button type="button" onClick={() => setIsEditingPreset(null)} className="p-1 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors">
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </div>

                        {/* Game */}
                        <div className="space-y-1">
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block">Game *</label>
                          <select value={editForm.game} onChange={e => setEditForm({ ...editForm, game: e.target.value })} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-primary transition-colors">
                            {PRESET_GAME_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block">Team Name *</label>
                          <input type="text" value={editForm.team_name} onChange={e => setEditForm({ ...editForm, team_name: e.target.value })} maxLength={16} required className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-primary transition-colors" />
                        </div>

                        <div>
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Captain / Player 1 *</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] text-on-surface-variant">IGN *</label>
                              <input type="text" value={editForm.captain} onChange={e => setEditForm({ ...editForm, captain: e.target.value })} required className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] text-on-surface-variant">UID</label>
                              <input type="text" value={editForm.captain_uid} onChange={e => setEditForm({ ...editForm, captain_uid: e.target.value.replace(/\D/g, '') })} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Players 2-4</label>
                          <div className="space-y-2">
                            {editForm.players.map((p, pIdx) => (
                              <div key={pIdx} className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] text-on-surface-variant">Player {pIdx + 2} IGN</label>
                                  <input type="text" value={p.ign} onChange={e => { const u = [...editForm.players]; u[pIdx] = { ...u[pIdx], ign: e.target.value }; setEditForm({ ...editForm, players: u }); }} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-on-surface-variant">UID</label>
                                  <input type="text" value={p.uid} onChange={e => { const u = [...editForm.players]; u[pIdx] = { ...u[pIdx], uid: e.target.value.replace(/\D/g, '') }; setEditForm({ ...editForm, players: u }); }} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Substitutes <span className="normal-case text-on-surface-variant/60">(optional)</span></label>
                          <div className="space-y-2">
                            {editForm.substitutes.map((s, sIdx) => (
                              <div key={sIdx} className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] text-on-surface-variant">Sub {sIdx + 1} IGN</label>
                                  <input type="text" value={s.ign} onChange={e => { const u = [...editForm.substitutes]; u[sIdx] = { ...u[sIdx], ign: e.target.value }; setEditForm({ ...editForm, substitutes: u }); }} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-on-surface-variant">UID</label>
                                  <input type="text" value={s.uid} onChange={e => { const u = [...editForm.substitutes]; u[sIdx] = { ...u[sIdx], uid: e.target.value.replace(/\D/g, '') }; setEditForm({ ...editForm, substitutes: u }); }} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-2 text-[11px] text-on-background focus:outline-none focus:border-primary transition-colors" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>


                        <div className="flex justify-end gap-2 pt-1 border-t border-outline-variant/20">
                          <button type="button" onClick={() => setIsEditingPreset(null)} className="px-4 py-2 bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/40 rounded-lg font-headline-md text-xs font-semibold transition-colors">Cancel</button>
                          <button type="submit" className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm">Save Changes</button>
                        </div>
                      </form>
                    );
                  })()}

                  {/* PRESET CARDS */}
                  {presetsLoading && presets.length === 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[0, 1].map(i => (
                        <div key={i} className="bg-surface-container-highest/55 rounded-2xl border border-outline-variant/25 h-36 animate-pulse" />
                      ))}
                    </div>
                  ) : filteredPresets.length === 0 ? (
                    /* Empty state */
                    <div className="glass-card p-10 rounded-2xl border border-outline-variant/20 bg-surface/30 flex flex-col items-center gap-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
                        <span className="material-symbols-outlined text-2xl">bookmark_add</span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-headline-md text-sm font-bold text-on-background">
                          {presetGameFilter === 'All' ? 'No squads saved yet' : `No ${presetGameFilter} squads`}
                        </h4>
                        <p className="font-body-sm text-[11px] text-on-surface-variant max-w-xs leading-relaxed">
                          Save your team once and auto-fill any tournament registration with one click.
                        </p>
                      </div>
                      {presets.length < 4 && !isCreatingPreset && (
                        <button
                          onClick={() => { setPresetForm({ ...emptyPresetForm(), game: presetGameFilter !== 'All' ? presetGameFilter : 'BGMI' }); setIsCreatingPreset(true); setIsEditingPreset(null); setDetailsOpenId(null); }}
                          className="px-5 py-2.5 bg-secondary hover:bg-secondary/90 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">add</span> Create Team / Squad
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredPresets.filter(p => p.id !== isEditingPreset).map((preset) => {
                        const game = preset.game || 'BGMI';
                        const playerList = (preset.players || []).filter(s => s.ign || s.uid);
                        const subList = (preset.substitutes || []).filter(s => s.ign || s.uid);
                        const isDetails = detailsOpenId === preset.id;

                        if (isDetails) {
                          return (
                            <div key={`details-${preset.id}`} className="sm:col-span-2 glass-card rounded-2xl border border-primary/40 bg-surface-container-highest/50 overflow-hidden shadow-md">
                              {/* Details header */}
                              <div className="p-4 sm:p-5 pb-0 flex items-center gap-3">
                                <GameIcon game={game} size={44} rounded="rounded-xl" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-headline-md text-sm font-bold text-on-background leading-tight truncate">
                                    {preset.team_name || preset.preset_name || 'Team'}
                                  </h4>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] text-on-surface-variant">{game}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setDetailsOpenId(null)}
                                  className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors"
                                  aria-label="Close details"
                                >
                                  <span className="material-symbols-outlined text-base">close</span>
                                </button>
                              </div>

                              {/* Details body */}
                              <div className="p-4 sm:p-5 space-y-3">
                                <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 px-3 py-2.5 space-y-1.5">
                                  <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold">Captain</div>
                                  <div className="text-xs text-on-background font-semibold flex items-center gap-2 flex-wrap">
                                    {preset.captain || '—'}
                                    {preset.captain_uid && <span className="font-body-sm text-[10px] text-on-surface-variant font-normal">UID {preset.captain_uid}</span>}
                                  </div>
                                </div>

                                {playerList.length > 0 && (
                                  <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 px-3 py-2.5 space-y-1.5">
                                    <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold">Players</div>
                                    <div className="flex flex-wrap gap-1">
                                      {playerList.map((slot, sIdx) => (
                                        <span key={sIdx} className="px-2 py-1 rounded-md bg-surface-container border border-outline-variant/20 text-[10px] text-on-background font-medium leading-none">
                                          {slot.ign || `Player ${sIdx + 2}`}
                                          {slot.uid && <span className="text-on-surface-variant/60"> · {slot.uid}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {subList.length > 0 && (
                                  <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 px-3 py-2.5 space-y-1.5">
                                    <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider font-bold">Substitutes</div>
                                    <div className="flex flex-wrap gap-1">
                                      {subList.map((slot, sIdx) => (
                                        <span key={sIdx} className="px-2 py-1 rounded-md bg-surface-variant/30 border border-dashed border-outline-variant/25 text-[10px] text-on-surface-variant font-medium leading-none">
                                          {slot.ign || `S${sIdx + 1}`}
                                          {slot.uid && <span className="opacity-60"> · {slot.uid}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleEditStart(preset)}
                                      className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/30 font-headline-md text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-sm">edit</span> Edit
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(deleteConfirmId === preset.id ? null : preset.id)}
                                      className={`px-3 py-1.5 rounded-lg font-headline-md text-[10px] font-bold flex items-center gap-1 transition-colors ${deleteConfirmId === preset.id ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'bg-surface-container hover:bg-surface-variant text-on-surface-variant border border-outline-variant/30 hover:text-rose-400'}`}
                                    >
                                      <span className="material-symbols-outlined text-sm">delete</span> Delete
                                    </button>
                                  </div>
                                </div>

                                {/* Delete confirm */}
                                {deleteConfirmId === preset.id && (
                                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-rose-500/8 border border-rose-500/20 rounded-xl">
                                    <span className="font-body-sm text-[10px] text-rose-400">Delete preset? Past registrations are unaffected.</span>
                                    <div className="flex gap-1.5 shrink-0">
                                      <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1 rounded-lg bg-surface-container text-on-background border border-outline-variant/30 text-[9px] font-bold">Keep</button>
                                      <button onClick={() => handleDeletePreset(preset.id)} className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-bold">Delete</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setDetailsOpenId(preset.id)}
                            className="text-left w-full h-full glass-card rounded-2xl border border-outline-variant/25 bg-surface-container-highest/50 overflow-hidden shadow-sm transition-all flex items-center gap-3 p-4 hover:border-outline-variant/50 group"
                          >
                            <GameIcon game={game} size={40} rounded="rounded-xl" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-headline-md text-sm font-bold text-on-background leading-tight truncate">{preset.team_name || preset.preset_name || 'Team'}</span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{game}</p>
                            </div>
                            <span className="material-symbols-outlined text-lg text-on-surface-variant/70 group-hover:text-primary transition-colors shrink-0">chevron_right</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom create CTA if at limit */}
                  {presets.length >= 4 && (
                    <p className="font-body-sm text-[10px] text-on-surface-variant text-center">Maximum of 4 presets reached. Delete one to create a new squad.</p>
                  )}
                </div>


              {/* Tab 3: Payment History */}
              <div
                key="payments"
                className={(activeTab === 'payments' || activeTab === 'wallet' || activeTab === 'prize-payments') ? 'space-y-6 pb-28 sm:pb-20' : 'hidden'}
              >
                <PrizePaymentHistory />
              </div>
              {/* Tab 5: Settings */}
              <div
                key="settings"
                className={activeTab === 'settings' ? 'space-y-4 sm:space-y-5' : 'hidden'}
              >

                  {/* GROUP 1: ACCOUNT */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-3">
                    <h3 className="font-headline-md text-xs sm:text-sm font-bold uppercase flex items-center gap-2 text-on-background tracking-tight pb-2 border-b border-outline-variant/30">
                      <span className="material-symbols-outlined text-primary text-lg">manage_accounts</span> Account
                    </h3>

                    {/* Email Row (read-only) */}
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-primary text-lg shrink-0">mail</span>
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">Email address</span>
                          <p className="text-xs font-semibold text-on-background truncate">
                            {playerData.email || (currentUser || currentUserFromContext)?.email || 'No email set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp Mobile Number Row (+91 Indian 10-digit validation) */}
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-emerald-500 text-lg shrink-0">chat</span>
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">WhatsApp Number</span>
                          <p className="text-xs font-semibold text-on-background truncate">
                            {formatWhatsAppDisplay(playerData.phone)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFieldModalState({ open: true, type: 'whatsapp', initial: playerData.phone })}
                        className="px-4 h-9 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span> {formatWhatsAppDisplay(playerData.phone) !== 'Not added' ? 'Edit' : 'Add'}
                      </button>
                    </div>

                    {/* UPI ID Row */}
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-primary text-lg shrink-0">account_balance_wallet</span>
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">UPI ID</span>
                          <p className="text-xs font-semibold text-on-background truncate">
                            {upiId || 'Not added'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFieldModalState({ open: true, type: 'upi', initial: upiId })}
                        className="px-4 h-9 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span> {upiId ? 'Edit' : 'Add'}
                      </button>
                    </div>
                  </div>

                  {/* GROUP 2: LOGIN METHODS */}
                  <div id="login-methods-section">
                    <LoginMethodsCard
                      currentUser={currentUser || currentUserFromContext}
                      onUserUpdated={refreshProfileUser}
                      triggerToast={triggerToast}
                    />
                  </div>

                  {/* GROUP 3: ORGANIZER */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-3">
                    <h3 className="font-headline-md text-sm sm:text-base font-bold uppercase flex items-center gap-2 text-on-background tracking-tight pb-2 border-b border-outline-variant/30">
                      <span className="material-symbols-outlined text-primary text-xl">military_tech</span> Organizer
                    </h3>

                    <div className="divide-y divide-outline-variant/20">
                      {!hasOrganizerRights(currentUser) && (
                        <button
                          type="button"
                          onClick={() => onNavigate && onNavigate('become-organizer')}
                          className="w-full py-3 flex items-center justify-between text-left hover:opacity-80 transition-opacity group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-lg">stadium</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-on-background group-hover:text-primary transition-colors">Host Events</p>
                              <p className="text-[11px] text-on-surface-variant truncate">Apply to host tournaments and create verified esports cups</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors shrink-0">arrow_forward</span>
                        </button>
                      )}

                      {hasOrganizerRights(currentUser) && (
                        <button
                          type="button"
                          onClick={() => onNavigate && onNavigate('org-management')}
                          className="w-full py-3 flex items-center justify-between text-left hover:opacity-80 transition-opacity group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-lg">dashboard</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-on-background group-hover:text-secondary transition-colors">Organizer Dashboard</p>
                              <p className="text-[11px] text-on-surface-variant truncate">Manage your hosted tournaments, brackets, and check-ins</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-secondary transition-colors shrink-0">arrow_forward</span>
                        </button>
                      )}

                      {isSystemAdmin(currentUser) && (
                        <button
                          type="button"
                          onClick={() => onNavigate && onNavigate('admin')}
                          className="w-full py-3 flex items-center justify-between text-left hover:opacity-80 transition-opacity group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-rose-500 transition-colors">Admin Panel</p>
                              <p className="text-[11px] text-on-surface-variant truncate">Platform administration, user management, and audit logs</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-rose-500 transition-colors shrink-0">arrow_forward</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ORGANIZER DISCORD LINKING */}
                  {hasOrganizerRights(currentUser) && (
                    <DiscordOrganiserLinkingCard triggerToast={triggerToast} />
                  )}

                  {/* GROUP 4: MORE */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-3">
                    <h3 className="font-headline-md text-sm sm:text-base font-bold uppercase flex items-center gap-2 text-on-background tracking-tight pb-2 border-b border-outline-variant/30">
                      <span className="material-symbols-outlined text-primary text-xl">more_horiz</span> More
                    </h3>

                    <div className="divide-y divide-outline-variant/20">
                      {[
                        { id: 'archive', label: 'Archive', icon: 'inventory_2', desc: 'Past tournaments and completed match records' },
                        { id: 'about', label: 'About', icon: 'info', desc: 'Learn more about Match District' },
                        { id: 'help-support', label: 'Help & Support', icon: 'help_outline', desc: 'Official Discord support community and FAQs' },
                        { id: 'terms-service', label: 'Terms & Conditions', icon: 'gavel', desc: 'Usage terms, rules, and player agreements' },
                        { id: 'privacy-policy', label: 'Privacy Policy', icon: 'policy', desc: 'How your data is protected and handled' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onNavigate && onNavigate(item.id)}
                          className="w-full py-2.5 flex items-center justify-between text-left hover:opacity-80 transition-opacity group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-lg shrink-0">
                              {item.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-on-background group-hover:text-primary transition-colors">
                                {item.label}
                              </p>
                              <p className="text-[11px] text-on-surface-variant truncate">{item.desc}</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-sm shrink-0">
                            arrow_forward
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GROUP 5: SIGN OUT */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] backdrop-blur-md shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-on-background">Sign out of your session</p>
                        <p className="text-[11px] text-on-surface-variant">You will need to sign in again to access your teams, tournaments, and wallet.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSignOutConfirm(true)}
                        className="h-10 px-6 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">logout</span> Log Out
                      </button>
                    </div>
                  </div>
                </div>
              {/* Tab 6: Verifier Panel (conditional) */}
              <div className={activeTab === 'verifier' ? '' : 'hidden'}>
                <VerifierPanelTab triggerToast={triggerToast} />
              </div>
            </div>
          )}
      </main>
    )}



      {/* Individual Field Edit Bottom Sheet / Modal */}
      <ProfileEditFieldModal
        isOpen={fieldModalState.open}
        onClose={() => setFieldModalState({ open: false, type: '', initial: '' })}
        fieldType={fieldModalState.type}
        initialValue={fieldModalState.initial}
        userId={(currentUser || currentUserFromContext)?.id}
        onSuccess={(updatedUser) => {
          if (updatedUser) {
            setPlayerData((prev) => ({
              ...prev,
              ...updatedUser,
              ...(updatedUser.phone ? { phone: updatedUser.phone } : {})
            }));
            if (updatedUser.upi_id !== undefined) {
              setUpiId(updatedUser.upi_id);
            }
            refreshProfileUser();
          }
        }}
        triggerToast={triggerToast}
      />

      {/* Sign Out Confirmation Modal */}
      <BottomSheetModal
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        title="Sign Out"
        icon="logout"
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowSignOutConfirm(false)}
              className="px-5 h-9 rounded-full border border-outline-variant/60 hover:bg-surface-variant text-xs font-semibold text-on-background transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-5 h-9 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-sm">logout</span> Confirm Sign Out
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-rose-400">
            <span className="material-symbols-outlined text-base">warning</span>
            <span className="text-xs font-bold">Are you sure you want to sign out?</span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Any unsaved session state will be cleared and you will be returned to the home screen. You will need to sign in again to access your teams, tournaments, and wallet.
          </p>
        </div>
      </BottomSheetModal>

      {/* Edit Organizer Modal */}
      {isEditingOrg && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:pb-4 animate-in fade-in duration-200"
        >
          <div className="glass-card profile-edit-modal-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4 relative max-h-[85dvh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-md text-lg font-bold text-on-background flex items-center gap-2 tracking-tight">
                <span className="material-symbols-outlined text-secondary text-xl">edit_square</span> Edit Profile
              </h3>
              <button onClick={() => setIsEditingOrg(false)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveOrgModal} className="space-y-4">
              <div className="space-y-1">
                <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Organization Name</label>
                <AbuseFieldWrapper fieldId="profile-orgName" value={orgEditForm.name} onWarning={setOrgNameAbuse}>
                  <input type="text" value={orgEditForm.name} onChange={(e) => setOrgEditForm({...orgEditForm, name: e.target.value})} className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm" required />
                </AbuseFieldWrapper>
              </div>

              <div className="space-y-1"><label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Verification Tier</label><input type="text" value={orgEditForm.tier} onChange={(e) => setOrgEditForm({...orgEditForm, tier: e.target.value})} className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all shadow-sm" required /></div>
              <div className="space-y-1">
                <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Short Bio</label>
                <AbuseFieldWrapper fieldId="profile-orgBio" value={orgEditForm.bio} onWarning={setOrgBioAbuse}>
                  <textarea
                    rows="3"
                    value={orgEditForm.bio}
                    onChange={(e) => setOrgEditForm({...orgEditForm, bio: e.target.value})}
                    maxLength={120}
                    placeholder="Describe your organizer brand, tournament focus, and hosting track record."
                    className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-secondary outline-none transition-all shadow-sm resize-none"
                  />
                </AbuseFieldWrapper>
                <div className="text-right text-[10px] text-on-surface-variant mt-1">
                  {orgEditForm.bio?.length || 0} / 120 characters
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
                <button type="button" onClick={() => setIsEditingOrg(false)} className="px-5 h-9 border border-outline hover:bg-surface-variant transition-all text-on-background rounded-full font-headline-md text-xs font-semibold whitespace-nowrap">Cancel</button>
                <button type="submit" disabled={isUploadingImage} className="px-6 h-9 bg-secondary hover:bg-secondary/90 active:scale-95 transition-all text-background rounded-full font-headline-md text-xs font-bold shadow-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"><span className="material-symbols-outlined text-sm">check</span> Save Changes</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Footer */}
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
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">&copy; 2024 MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>

      {/* Crop Modal */}
      {cropState && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center p-4 bg-black/90 animate-in fade-in duration-200"
        >
          <div
            className="glass-card profile-edit-modal-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 relative max-h-[85dvh] overflow-y-auto custom-scrollbar"
          >
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h3 className="font-headline-md text-lg font-bold text-on-background flex items-center gap-2 tracking-tight">
                  <span className="material-symbols-outlined text-primary text-xl">crop</span> Crop {cropState.shape === 'rectangle' ? 'Banner' : 'Profile Picture'}
                </h3>
                <button onClick={() => setCropState(null)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div 
                  className={`relative w-full ${cropState.shape === 'rectangle' ? 'max-w-[360px] aspect-[3/1]' : 'max-w-[280px] aspect-square'} bg-black border border-outline-variant rounded-xl overflow-hidden cursor-move select-none`}
                  onMouseDown={handleCropMouseDown}
                  onTouchStart={handleCropTouchStart}
                >
                  <img
                    src={cropState.src}
                    alt="To Crop"
                    className="absolute pointer-events-none origin-center"
                    style={{
                      transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoomPercent / 100})`,
                      left: '50%',
                      top: '50%',
                      marginLeft: `-${cropState.width / 2}px`,
                      marginTop: `-${cropState.height / 2}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }}
                    ref={cropImgRef}
                  />
                  {cropState.shape === 'rectangle' ? (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                      <div className="w-full h-full border-2 border-dashed border-primary/70"></div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none flex items-center justify-center">
                      <div className="w-[200px] h-[200px] rounded-full border border-dashed border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
                    </div>
                  )}
                </div>

                <div className="w-full space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>Zoom</span>
                    <span>{cropZoomPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="1"
                    value={cropZoomPercent}
                    onChange={(e) => setCropZoomPercent(Number(e.target.value))}
                    className="w-full accent-primary bg-surface-container h-1 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
                <button 
                  onClick={() => setCropState(null)} 
                  className="px-5 py-2 border border-outline hover:bg-surface-variant transition-all text-on-background rounded-lg font-headline-md text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCropConfirm} 
                  className="px-5 py-2 bg-primary hover:bg-primary/90 transition-all text-on-primary rounded-lg font-headline-md text-xs font-bold shadow-sm flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">check</span> Apply &amp; Upload
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// --- VERIFIER PANEL TAB COMPONENT ---
function VerifierPanelTab() {
  return (
    <motion.div variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
      <PaymentReviewQueue role="verifier" />
    </motion.div>
  );
}

export default Profile
