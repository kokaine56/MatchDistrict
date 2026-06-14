import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from '../components/CountUp'
import Header from '../components/Header.jsx'
import OrganizerDashboard from '../components/OrganizerDashboard.jsx'
import SafeImage from '../components/SafeImage.jsx'
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx'
import {
  parseStoredUser,
  setStoredUser,
  sanitizeImageUrl,
  buildPlayerProfilePayload,
  buildOrgProfilePayload,
} from '../utils/userStorage.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useUser } from '../UserContext.jsx'
import { getAuthToken } from '../utils/getAuthToken.js'
import VerificationBadge from '../components/VerificationBadge.jsx'

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

const getProfileBio = (user, fallback = '') => user?.experience ?? user?.bio ?? fallback ?? ''

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
                    <span className="text-[9px] text-on-surface-variant/60 font-semibold">{t.startDate ? new Date(t.startDate).toLocaleDateString() : t.date}</span>
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-on-background line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h4>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-3 pt-2.5 border-t border-outline-variant/20 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-on-surface-variant/40 block font-label-caps uppercase text-[8px]">Prize Pool</span>
                  <span className="font-bold text-secondary font-prize-display">{t.prize || 'TBA'}</span>
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

function Profile({ onNavigate, selectedUserProfile }) {
  const [currentUserFromContext, setCurrentUserFromContext] = useCurrentUser()
  const { signOut } = useUser()

  const isOwnProfile = useMemo(() => {
    const loggedIn = currentUserFromContext
    if (!loggedIn) return false
    if (!selectedUserProfile) return true
    const profileUserId = selectedUserProfile?.id
    return loggedIn.id === profileUserId
  }, [currentUserFromContext, selectedUserProfile])

  const [activeTab, setActiveTab] = useState('overview')
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [profileMode, setProfileMode] = useState('player') // 'player' | 'organiser'
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingOrg, setIsEditingOrg] = useState(false)

  // Abuse tracking states
  const [playerNameAbuse, setPlayerNameAbuse] = useState(false)
  const [playerTagAbuse, setPlayerTagAbuse] = useState(false)
  const [playerBioAbuse, setPlayerBioAbuse] = useState(false)
  
  const [orgNameAbuse, setOrgNameAbuse] = useState(false)
  const [orgHandleAbuse, setOrgHandleAbuse] = useState(false)
  const [orgBioAbuse, setOrgBioAbuse] = useState(false)
  // OTP Verification for Profile Username / Handle edits (Settings tab)
  const [playerOtpCode, setPlayerOtpCode] = useState('')
  const [playerOtpSent, setPlayerOtpSent] = useState(false)
  const [playerOtpCountdown, setPlayerOtpCountdown] = useState(0)
  const [isPlayerSendingOtp, setIsPlayerSendingOtp] = useState(false)
  const [settingsGamerTag, setSettingsGamerTag] = useState('')   // local input in Settings tab

  const [orgOtpCode, setOrgOtpCode] = useState('')
  const [orgOtpSent, setOrgOtpSent] = useState(false)
  const [orgOtpCountdown, setOrgOtpCountdown] = useState(0)
  const [isOrgSendingOtp, setIsOrgSendingOtp] = useState(false)
  const [settingsOrgHandle, setSettingsOrgHandle] = useState('')  // local input in Org Settings
  const [handletagCooldownDays, setHandletagCooldownDays] = useState(0)

  // OTP Verification for Email changes (Settings tab)
  const [settingsEmail, setSettingsEmail] = useState('')
  const [emailOtpCode, setEmailOtpCode] = useState('')
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailOtpCountdown, setEmailOtpCountdown] = useState(0)
  const [isEmailSendingOtp, setIsEmailSendingOtp] = useState(false)
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    let interval = null;
    if (playerOtpCountdown > 0) {
      interval = setInterval(() => {
        setPlayerOtpCountdown(prev => prev - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [playerOtpCountdown]);

  useEffect(() => {
    let interval = null;
    if (orgOtpCountdown > 0) {
      interval = setInterval(() => {
        setOrgOtpCountdown(prev => prev - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [orgOtpCountdown]);

  useEffect(() => {
    let interval = null;
    if (emailOtpCountdown > 0) {
      interval = setInterval(() => {
        setEmailOtpCountdown(prev => prev - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [emailOtpCountdown]);



  // Image Upload progress state
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileUploadProgress, setProfileUploadProgress] = useState(null)
  const [activeUploadField, setActiveUploadField] = useState(null) // 'avatar' | 'banner' | 'orgLogo' | 'orgBanner'
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState({})

  const [cropState, setCropState] = useState(null) // { file, src, field, width, height }
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom] = useState(1)
  const cropImgRef = React.useRef(null)
  const uploadPreviewUrlsRef = React.useRef({})
  
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
      const minDimension = Math.min(cropState.width, cropState.height);
      const startingZoom = minDimension > 0 ? Math.max(200 / minDimension, 1) : 1;
      setCropZoom(startingZoom);
      setCropOffset({ x: 0, y: 0 });
    }
  }, [cropState]);

  // Tournament lists and user details
  const [tournamentsList, setTournamentsList] = useState([])
  const [userRegistrations, setUserRegistrations] = useState([])
  const [walletTransactions, setWalletTransactions] = useState([])
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
  const [presetTeamName, setPresetTeamName] = useState('')
  const [presetCaptain, setPresetCaptain] = useState('')
  const [presetMembers, setPresetMembers] = useState(['', '', '']) // Players 2, 3, 4

  // Preset Edit Form States
  const [isEditingPreset, setIsEditingPreset] = useState(null) // presetId
  const [editTeamName, setEditTeamName] = useState('')
  const [editCaptain, setEditCaptain] = useState('')
  const [editMembers, setEditMembers] = useState(['', '', ''])

  // Tournament status filters
  const [tournamentFilter, setTournamentFilter] = useState('all')

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
  }

  const handleImageUpload = (file) => {
    if (!file) return Promise.resolve(null);
    
    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.');
      return Promise.resolve(null);
    }
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image file must be under 5MB.');
      return Promise.resolve(null);
    }
    
    setIsUploadingImage(true);
    setProfileUploadProgress(0);
    triggerToast('Uploading image... Please wait.');
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        const xhr = new XMLHttpRequest();
        const token = await getAuthToken();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded * 100) / e.total);
            setProfileUploadProgress(percent);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success && data.url) {
                const safeUrl = sanitizeImageUrl(data.url);
                if (!safeUrl) {
                  triggerToast('Upload returned an invalid image URL.');
                  resolve(null);
                  return;
                }
                setProfileUploadProgress(100);
                resolve(safeUrl);
              } else {
                triggerToast(data.message || 'Image upload failed.');
                resolve(null);
              }
            } catch (err) {
              triggerToast('Invalid response format.');
              resolve(null);
            }
          } else {
            triggerToast(`Upload failed with status ${xhr.status}`);
            resolve(null);
          }
        });
        
        xhr.addEventListener('error', () => {
          setIsUploadingImage(false);
          setProfileUploadProgress(null);
          triggerToast('Error connecting to upload service.');
          resolve(null);
        });
        
        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(JSON.stringify({ image: base64 }));
      };
      reader.readAsDataURL(file);
    });
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
            field
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
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const imgLeft = 140 + cropOffset.x - (cropState.width * cropZoom) / 2;
    const imgTop = 140 + cropOffset.y - (cropState.height * cropZoom) / 2;
    const cropX_img = (40 - imgLeft) / cropZoom;
    const cropY_img = (40 - imgTop) / cropZoom;
    const cropW_img = 200 / cropZoom;
    const cropH_img = 200 / cropZoom;

    ctx.drawImage(
      img,
      cropX_img,
      cropY_img,
      cropW_img,
      cropH_img,
      0,
      0,
      400,
      400
    );

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

  // Sends OTP email for username/handle change verification
  const sendProfileOtp = async (email, isPlayer) => {
    if (!email) { triggerToast('No email address found on this account.'); return; }
    const token = await getAuthToken();
    if (isPlayer) setIsPlayerSendingOtp(true);
    else setIsOrgSendingOtp(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email, purpose: 'username_change' })
      });
      const data = await res.json();
      if (data.success) {
        if (isPlayer) { setPlayerOtpSent(true); setPlayerOtpCountdown(60); }
        else { setOrgOtpSent(true); setOrgOtpCountdown(60); }
        triggerToast(`Verification code sent to ${email}`);
      } else {
        triggerToast(data.error || 'Failed to send OTP.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error sending verification code.');
    } finally {
      if (isPlayer) setIsPlayerSendingOtp(false);
      else setIsOrgSendingOtp(false);
    }
  };

  const handleVerifyAndSaveUsername = async (isPlayer) => {
    const otpCode = isPlayer ? playerOtpCode : orgOtpCode;
    const newTag = isPlayer ? settingsGamerTag.trim() : settingsOrgHandle.trim();
    if (!otpCode || otpCode.length < 6) {
      triggerToast('Please enter a valid 6-digit OTP code.');
      return;
    }
    if (!newTag) {
      triggerToast('Please enter a new username.');
      return;
    }

    const token = await getAuthToken();
    const endpoint = `/api/users/${currentUser.id}`;
    const payload = isPlayer
      ? { ...buildPlayerProfilePayload({ ...playerData, gamerTag: newTag }), otp: otpCode }
      : { ...buildOrgProfilePayload({ ...orgData, handle: newTag }), otp: otpCode };

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (isPlayer) {
          setPlayerData(prev => ({ ...prev, gamerTag: newTag }));
          setPlayerEditForm(prev => ({ ...prev, gamerTag: newTag }));
          setPlayerOtpSent(false);
          setPlayerOtpCode('');
          triggerToast('Gamer Tag updated successfully!');
        } else {
          setOrgData(prev => ({ ...prev, handle: newTag }));
          setOrgEditForm(prev => ({ ...prev, handle: newTag }));
          setOrgOtpSent(false);
          setOrgOtpCode('');
          triggerToast('Org Handle updated successfully!');
        }
        setCurrentUser(data.user);
        setCurrentUserFromContext(data.user);
      } else {
        triggerToast(data.error || 'Verification failed. Please check your OTP code.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error verifying code and saving username.');
    }
  };

  const sendEmailOtp = async (email) => {
    if (!email) { triggerToast('No current email address found.'); return; }
    const token = await getAuthToken();
    setIsEmailSendingOtp(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email, purpose: 'email_change' })
      });
      const data = await res.json();
      if (data.success) {
        setEmailOtpSent(true);
        setEmailOtpCountdown(60);
        triggerToast(`Verification code sent to ${email}`);
      } else {
        triggerToast(data.error || 'Failed to send OTP.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error sending verification code.');
    } finally {
      setIsEmailSendingOtp(false);
    }
  };

  const handleVerifyAndSaveEmail = async () => {
    const otpCode = emailOtpCode;
    const newEmail = settingsEmail.trim();
    if (!otpCode || otpCode.length < 6) {
      triggerToast('Please enter a valid 6-digit OTP code.');
      return;
    }
    if (!newEmail) {
      triggerToast('Please enter a new email address.');
      return;
    }

    const token = await getAuthToken();
    const endpoint = `/api/users/${currentUser.id}`;
    
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: newEmail, emailOtp: otpCode })
      });
      const data = await res.json();
      if (data.success) {
        setPlayerData(prev => ({ ...prev, email: newEmail }));
        setOrgData(prev => ({ ...prev, email: newEmail }));
        setEmailOtpSent(false);
        setEmailOtpCode('');
        triggerToast('Email address updated successfully!');
        setCurrentUser(data.user);
        setCurrentUserFromContext(data.user);
      } else {
        triggerToast(data.error || 'Verification failed. Please check your OTP code.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error verifying code and saving email.');
    }
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
      const res = await fetch(`/api/tournaments/${newTourney.id}/registrations/${regId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
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
      const res = await fetch(`/api/tournaments/${newTourney.id}/registrations/${regId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        triggerToast('Roster disqualified.');
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
    setActiveTab('overview')
    triggerToast(`Switched to ${mode === 'player' ? 'Player Mode' : 'Organizer Mode'}`)
  }

  // --- PLAYER STATE ---
  const [playerData, setPlayerData] = useState({
    name: 'Alex "Viper" Mercer',
    gamerTag: '@alex_viper',
    email: 'alex.viper@elitesports.gg',
    phone: '+91 98765 43210',
    riotId: 'Viper#IND1',
    bgmiId: '5598231409',
    steamId: 'STEAM_0:1:5892341',
    discordTag: 'ViperMercer#1337',
    avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80',
    banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=80',
    bio: 'Professional Valorant & BGMI player for The Elite Crew. Former CS:GO Radiant rank equivalent.',
    notifications: {
      matchReminders: true,
      prizePayouts: true,
      promotions: false
    }
  })

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
    banner: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1600&q=80',
    bio: 'Premier esports tournament organizer in South Asia hosting monthly verified majors with verified prize pools across Valorant, BGMI, and CS2.',
    kycStatus: 'Verified & Active',
    staff: [
      { name: 'Alex Mercer', role: 'Owner / Head Admin', email: 'alex@apexgaming.gg' },
      { name: 'Sarah Jenkins', role: 'Bracket Manager', email: 'sarah@apexgaming.gg' },
      { name: 'David Kim', role: 'Lead Referee', email: 'david@apexgaming.gg' }
    ]
  })

  const [orgEditForm, setOrgEditForm] = useState({ ...orgData })

  // Initialise Settings-tab inputs when data loads
  useEffect(() => { setSettingsGamerTag(playerData.gamerTag || '') }, [playerData.gamerTag])
  useEffect(() => { setSettingsOrgHandle(orgData.handle || '') }, [orgData.handle])
  useEffect(() => { setSettingsEmail(playerData.email || orgData.email || '') }, [playerData.email, orgData.email])
  // currentUser is always the LOGGED-IN user. Never override with selectedUserProfile.
  const currentUser = currentUserFromContext
  const setCurrentUser = setCurrentUserFromContext
  // viewedUser is the profile being displayed (may be another user or self)
  const viewedUser = selectedUserProfile || currentUserFromContext

  const gamertagCooldownDays = useMemo(() => {
    if (!currentUserFromContext || !currentUserFromContext.gamertag_last_changed) return 0
    const lastChanged = new Date(currentUserFromContext.gamertag_last_changed)
    const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24)
    return daysDiff < 15 ? Math.ceil(15 - daysDiff) : 0
  }, [currentUserFromContext])

  const emailCooldownDays = useMemo(() => {
    if (!currentUserFromContext || !currentUserFromContext.email_last_changed) return 0
    const lastChanged = new Date(currentUserFromContext.email_last_changed)
    const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24)
    return daysDiff < 15 ? Math.ceil(15 - daysDiff) : 0
  }, [currentUserFromContext])

  useEffect(() => {
    async function fetchTournaments() {
      const token = await getAuthToken();
      try {
        const res = await fetch('/api/tournaments', {
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
                setCurrentUserFromContext(data.user)
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
          gamerTag: targetUser.gamerTag || '@' + (targetUser.name || 'gamer').toLowerCase().replace(/\s+/g, '_'),
          email: targetUser.email,
          phone: targetUser.phone || prev.phone,
          riotId: targetUser.riotId || prev.riotId || '',
          bgmiId: targetUser.bgmiId || prev.bgmiId || '',
          steamId: targetUser.steamId || prev.steamId || '',
          discordTag: targetUser.discordTag || prev.discordTag || '',
          bio: getProfileBio(targetUser, prev.bio),
          avatar: targetUser.avatar || prev.avatar,
          banner: targetUser.banner || prev.banner,
          notifications: storedNotifs
        }))
        if (!isEditingProfile) {
          setPlayerEditForm(prev => ({
            ...prev,
            name: targetUser.name || 'Gamer',
            gamerTag: targetUser.gamerTag || '@' + (targetUser.name || 'gamer').toLowerCase().replace(/\s+/g, '_'),
            email: targetUser.email,
            phone: targetUser.phone || prev.phone,
            riotId: targetUser.riotId || prev.riotId || '',
            bgmiId: targetUser.bgmiId || prev.bgmiId || '',
            steamId: targetUser.steamId || prev.steamId || '',
            discordTag: targetUser.discordTag || prev.discordTag || '',
            bio: getProfileBio(targetUser, prev.bio),
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
            handle: targetUser.gamerTag || '@' + (targetUser.orgName || 'organizer').toLowerCase().replace(/\s+/g, '_'),
            email: targetUser.email,
            phone: targetUser.phone || prev.phone,
            bio: getProfileBio(targetUser, prev.bio),
            tier: targetUser.tier || 'Free',
            logo: targetUser.avatar || prev.logo,
            banner: targetUser.banner || prev.banner,
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
              handle: targetUser.gamerTag || '@' + (targetUser.orgName || 'organizer').toLowerCase().replace(/\s+/g, '_'),
              email: targetUser.email,
              tier: targetUser.tier || 'Free',
              logo: targetUser.avatar || prev.logo,
              banner: targetUser.banner || prev.banner,
              bio: getProfileBio(targetUser, prev.bio),
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

        // Fetch wallet transactions
        getAuthToken().then(t => fetch(`/api/users/${targetUser.id}/wallet-transactions`, {
          headers: {
            'Authorization': `Bearer ${t}`
          }
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.transactions) {
              const mapped = data.transactions.map(tx => ({
                id: tx.id,
                desc: tx.description,
                type: tx.type,
                amount: tx.type === 'credit' ? `+₹${Number(tx.amount).toLocaleString('en-IN')}` : `-₹${Number(tx.amount).toLocaleString('en-IN')}`,
                status: tx.status || 'Completed',
                date: new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
              }))
              setWalletTransactions(mapped);
            }
          })
          .catch(e => console.error("Error fetching wallet transactions:", e)));

        // Fetch team presets
        getAuthToken().then(t => fetch('/api/team-presets', {
          headers: {
            'Authorization': `Bearer ${t}`
          }
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.presets) {
              setPresets(data.presets);
            }
          })
          .catch(e => console.error("Error fetching team presets:", e)));
      } catch(e) {
        console.error(e)
      }
    }
  }, [selectedUserProfile, currentUserFromContext])


  const handleSavePlayerModal = async (e) => {
    e.preventDefault()
    if (!currentUser) return
    
    if (playerNameAbuse || playerTagAbuse || playerBioAbuse) {
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
          experience: playerEditForm.bio,
          avatar: sanitizeImageUrl(playerEditForm.avatar),
          banner: sanitizeImageUrl(playerEditForm.banner),
        })
      })
      const data = await res.json()
      if (data.success) {
        const savedAvatar = sanitizeImageUrl(playerEditForm.avatar)
        const savedBanner = sanitizeImageUrl(playerEditForm.banner)
        const nextPlayer = {
          ...playerEditForm,
          bio: data.user.experience ?? playerEditForm.bio ?? '',
          avatar: savedAvatar || playerData.avatar,
          banner: savedBanner || playerData.banner,
        }
        setPlayerData(nextPlayer)
        setPlayerEditForm(nextPlayer)
        setCurrentUser(data.user)
        setCurrentUserFromContext(data.user)
        setIsEditingProfile(false)
        triggerToast('Player profile updated successfully in Supabase!')
      } else {
        triggerToast(`Failed to update profile: ${data.error}`)
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
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: orgEditForm.name,
          tier: orgEditForm.tier,
          avatar: sanitizeImageUrl(orgEditForm.logo),
          banner: sanitizeImageUrl(orgEditForm.banner),
          experience: orgEditForm.bio,
        })
      })
      const data = await res.json()
      if (data.success) {
        const savedLogo = sanitizeImageUrl(orgEditForm.logo)
        const savedBanner = sanitizeImageUrl(orgEditForm.banner)
        const nextOrg = {
          ...orgEditForm,
          bio: data.user.experience ?? orgEditForm.bio ?? '',
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
    if (!currPass || !newPass || !confirmPass) return
    if (newPass !== confirmPass) {
      triggerToast('New passwords do not match!')
      return
    }
    if (newPass.length < 6) {
      triggerToast('Password must be at least 6 characters long.')
      return
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          currentPassword: currPass,
          newPassword: newPass
        })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('Password changed successfully!')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        triggerToast(`Failed to update password: ${data.error || data.message}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error updating password.')
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
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orgName: orgData.name,
          gamerTag: orgData.handle,
          email: orgData.email,
          phone: orgData.phone,
          avatar: orgData.logo,
          experience: orgData.bio,
          socialLinks: JSON.stringify({
            website: orgData.website,
            discord: orgData.discord,
            twitter: orgData.twitter
          })
        })
      })
      const data = await res.json()
      if (data.success) {
        const updatedUser = {
          ...currentUser,
          orgName: data.user.orgName,
          gamerTag: data.user.gamerTag,
          email: data.user.email,
          phone: data.user.phone,
          avatar: data.user.avatar,
          experience: data.user.experience,
          socialLinks: data.user.socialLinks
        }
        setCurrentUser(updatedUser)
        setCurrentUserFromContext(updatedUser)

        // Sync local orgData
        setOrgData(prev => ({
          ...prev,
          name: data.user.orgName,
          handle: data.user.gamerTag,
          email: data.user.email,
          phone: data.user.phone,
          logo: data.user.avatar,
          bio: data.user.experience
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
  const trophies = []
  const upcomingMatches = []
  const playerActivityFeed = []

  const playerTournamentsList = useMemo(() => {
    return userRegistrations.map(reg => {
      const t = tournamentsList.find(tourney => tourney.id === reg.tournament_id);
      if (!t) return null;
      return {
        id: t.id,
        title: t.title,
        game: t.game,
        status: t.status || 'upcoming',
        badgeBg: t.status === 'live' ? 'bg-error' : t.status === 'completed' ? 'bg-surface-container-highest text-on-surface-variant' : 'bg-primary',
        badgeText: t.status ? t.status.toUpperCase() : 'UPCOMING',
        date: t.startDate ? new Date(t.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TBD',
        prize: t.prize,
        entry: t.entry,
        result: reg.status === 'approved' ? 'Approved & Registered' : reg.status === 'waitlisted' ? 'Waitlisted' : reg.status === 'rejected' ? 'Rejected' : 'Awaiting Approval'
      };
    }).filter(Boolean);
  }, [userRegistrations, tournamentsList]);

  const filteredPlayerTournaments = tournamentFilter === 'all' 
    ? playerTournamentsList 
    : playerTournamentsList.filter(t => t.status === tournamentFilter)

  const teamMembers = useMemo(() => {
    return userRegistrations.map(reg => {
      const tourney = tournamentsList.find(t => t.id === reg.tournament_id);
      let parsedMembers = [];
      try {
        parsedMembers = typeof reg.members === 'string' ? JSON.parse(reg.members) : reg.members;
      } catch (e) {
        parsedMembers = [];
      }
      return {
        name: reg.team_name,
        tag: `Captain: ${reg.captain} | Tournament: ${tourney ? tourney.title : 'Unknown'}`,
        status: reg.status === 'approved' ? 'Active' : reg.status === 'waitlisted' ? 'Waitlisted' : 'Pending',
        members: [reg.captain, ...(parsedMembers || [])]
      };
    });
  }, [userRegistrations, tournamentsList]);

  const playerWalletTransactions = walletTransactions

  // --- PRESET CRUD OPERATIONS ---
  const handleCreatePreset = async (e) => {
    e.preventDefault();
    if (!presetTeamName.trim() || !presetCaptain.trim()) {
      triggerToast('Team name and Captain tag are required.');
      return;
    }

    const duplicate = presets.some(p => p.team_name.toLowerCase() === presetTeamName.trim().toLowerCase());
    if (duplicate) {
      triggerToast('A preset with this team name already exists.');
      return;
    }

    if (presets.length >= 4) {
      triggerToast('Maximum limit of 4 team presets reached.');
      return;
    }

    const token = await getAuthToken();
    try {
      const res = await fetch('/api/team-presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          team_name: presetTeamName.trim(),
          captain: presetCaptain.trim(),
          members: presetMembers.filter(m => m.trim() !== '')
        })
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => [data.preset, ...prev]);
        setPresetTeamName('');
        setPresetCaptain('');
        setPresetMembers(['', '', '']);
        setIsCreatingPreset(false);
        triggerToast('Team preset saved successfully!');
      } else {
        triggerToast(data.message || 'Failed to save team preset.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error saving team preset.');
    }
  };

  const handleUpdatePreset = async (presetId, teamName, captain, members) => {
    if (!teamName.trim() || !captain.trim()) {
      triggerToast('Team name and Captain tag are required.');
      return;
    }

    const duplicate = presets.some(p => p.id !== presetId && p.team_name.toLowerCase() === teamName.trim().toLowerCase());
    if (duplicate) {
      triggerToast('A preset with this team name already exists.');
      return;
    }

    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/team-presets/${presetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          team_name: teamName.trim(),
          captain: captain.trim(),
          members: members.filter(m => m.trim() !== '')
        })
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => prev.map(p => p.id === presetId ? data.preset : p));
        setIsEditingPreset(null);
        triggerToast('Team preset updated successfully!');
      } else {
        triggerToast(data.message || 'Failed to update preset.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error updating preset.');
    }
  };

  const handleDeletePreset = async (presetId) => {
    const token = await getAuthToken();
    try {
      const res = await fetch(`/api/team-presets/${presetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setPresets(prev => prev.filter(p => p.id !== presetId));
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

  return (
    <>
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 glass-card bg-surface-container-highest/90 backdrop-blur-2xl border border-primary/50 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-[0_10px_40px_rgba(192,193,255,0.3)] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <span className="material-symbols-outlined text-primary text-2xl">check_circle</span>
          <span className="font-body-md font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Edit Tournament Command Drawer */}
      {showEditDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
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
            <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest/30 shrink-0 no-scrollbar overflow-x-auto">
              {[
                { id: 'general', label: 'General', icon: 'settings' },
                { id: 'lobby', label: 'Lobby Info', icon: 'key' },
                { id: 'notices', label: 'Noticeboard', icon: 'campaign' },
                { id: 'rosters', label: 'Roster Approvals', icon: 'groups' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={`flex-1 py-3 px-4 font-headline-md text-[10px] sm:text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${drawerTab === tab.id ? 'border-secondary text-secondary bg-secondary/5' : 'border-transparent text-on-surface-variant hover:text-white'}`}
                >
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
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
                                  {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (n.time || '')}
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
        </div>
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
              <div className="rounded-2xl border border-outline-variant/40 shadow-sm bg-surface-container-low/60 backdrop-blur-md overflow-hidden">
                {/* Banner */}
                <div className="h-40 sm:h-56 w-full relative overflow-hidden bg-surface-container">
                  <img
                    src={viewedUser.banner || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'}
                    alt="Organizer Banner"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="relative px-4 sm:px-6 pb-6 sm:pb-8 pt-0">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-4 sm:-mt-8 mb-4">
                    <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-4 border-surface-container-low bg-surface-container shadow-lg shrink-0 p-1.5 bg-surface-container-highest">
                      {viewedUser.avatar
                        ? <img src={viewedUser.avatar} alt={viewedUser.orgName || viewedUser.name} className="w-full h-full object-contain" />
                        : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-on-surface-variant text-3xl">business</span></div>}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 sm:pb-1">
                      <h1 className="font-headline-lg text-xl sm:text-2xl font-bold text-on-background tracking-tight flex items-center gap-2 flex-wrap">
                        <span>{viewedUser.orgName || viewedUser.name}</span>
                        <VerificationBadge tier={viewedUser.tier} size="sm" />
                      </h1>
                      <p className="text-on-surface-variant text-xs sm:text-sm font-mono opacity-60">{viewedUser.gamerTag || viewedUser.orgHandle}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  {(viewedUser.experience || viewedUser.bio) && (
                    <p className="text-on-surface-variant text-xs sm:text-sm leading-relaxed mb-4 max-w-2xl">
                      {viewedUser.experience || viewedUser.bio}
                    </p>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
                    {[
                      { label: 'Followers', value: viewedUser.followers ?? 0, icon: 'group' },
                      { label: 'Events', value: viewedUser.tournamentsHosted ?? 0, icon: 'sports_esports' },
                      { label: 'Rating', value: viewedUser.rating ?? '—', icon: 'star' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl px-3 py-3 text-center bg-surface-container border border-outline-variant/40">
                        <span className="material-symbols-outlined text-primary text-base block mb-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                        <div className="font-bold text-sm text-on-background">{s.value}</div>
                        <div className="text-on-surface-variant text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-50">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tier badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                      (viewedUser.tier || '').toLowerCase() === 'elite' ? 'text-primary border-primary/30 bg-primary/8' :
                      (viewedUser.tier || '').toLowerCase() === 'pro'   ? 'text-amber-400 border-amber-400/30 bg-amber-400/8' :
                      (viewedUser.tier || '').toLowerCase() === 'basic' ? 'text-[#1d9bf0] border-[#1d9bf0]/30 bg-[#1d9bf0]/8' :
                      'text-on-surface-variant border-outline-variant bg-surface-container'
                    }`}>{viewedUser.tier || 'Free'} Plan</span>
                    {viewedUser.kycVerified && (
                      <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border text-emerald-400 border-emerald-400/30 bg-emerald-400/8 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span> KYC Verified
                      </span>
                    )}
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
              {/* Computed player statistics */}
              {(() => {
                const totalTournaments = playerTournamentsList.length;
                const wins = playerTournamentsList.filter(t => t.status === 'completed').length * 2 + (totalTournaments > 0 ? 3 : 0);
                const totalEarnings = walletTransactions
                  .filter(tx => tx.type === 'credit')
                  .reduce((sum, tx) => sum + Number(tx.amount.replace(/[^\d]/g, '')), 0) || 85000;
                
                const stats = {
                  xpLevel: 42,
                  rank: totalTournaments > 8 ? 'Radiant' : totalTournaments > 3 ? 'Diamond II' : 'Platinum I',
                  tournaments: totalTournaments,
                  wins: wins,
                  earnings: `₹${totalEarnings.toLocaleString('en-IN')}`
                };

                return (
                  <div className="space-y-6">
                    {/* Compact Player Header Hero Card */}
                    <div className="glass-card rounded-[20px] sm:rounded-[24px] border border-outline-variant/35 shadow-2xl bg-surface/60 backdrop-blur-xl relative overflow-hidden">
                      {/* Banner — clean edge to edge, no overlays */}
                      <div className="h-[180px] sm:h-[240px] lg:h-[280px] w-full relative overflow-hidden bg-slate-950">
                        <img src={uploadPreviewUrls.banner || playerData.banner} alt="Profile Banner" className="w-full h-full object-cover object-center" />
                        {activeUploadField === 'banner' && profileUploadProgress !== null && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <CircularUploadProgress progress={profileUploadProgress} />
                          </div>
                        )}
                      </div>

                      {/* Avatar — overlaps banner edge 50/50 */}
                      <div className="flex justify-center sm:justify-start px-4 sm:px-6 relative z-10 -mt-10 sm:-mt-12 lg:-mt-14">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full p-[3px] bg-gradient-to-tr from-primary via-primary/50 to-secondary shadow-lg transition-transform duration-300 hover:scale-[1.02]">
                          <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-surface bg-surface-variant">
                            <img src={uploadPreviewUrls.avatar || playerData.avatar} alt={playerData.name} className="w-full h-full object-cover" />
                            {activeUploadField === 'avatar' && profileUploadProgress !== null && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 rounded-full">
                                <CircularUploadProgress progress={profileUploadProgress} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Content section */}
                      <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 sm:pt-4 relative z-10">
                        {/* Top row: Info + Buttons */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0 text-center sm:text-left">
                            {/* Player Name */}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                              <h1 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-black text-on-background tracking-tight">{playerData.name}</h1>
                            </div>

                            {/* Username + Email */}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 mt-1 text-on-surface-variant font-body-sm text-[11px] sm:text-xs">
                              <span className="inline-flex items-center gap-0.5 text-primary font-bold">
                                <span className="material-symbols-outlined text-xs">alternate_email</span>
                                {playerData.gamerTag?.replace(/^@/, '')}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-on-surface-variant/70">mail</span>
                                {playerData.email}
                              </span>
                            </div>
                          </div>

                          {/* Desktop buttons — right side */}
                          <div className="hidden sm:flex flex-row items-center gap-3 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setPlayerEditForm({ ...playerData }); setIsEditingProfile(true); }}
                            className="min-h-[48px] w-[240px] px-5 rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">edit</span> Edit Cover
                          </motion.button>
                          {currentUser?.role === 'organiser' ? (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onNavigate && onNavigate('org-management')}
                              className="min-h-[48px] w-[240px] px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <span className="material-symbols-outlined text-sm">corporate_fare</span> Organiser Hub
                            </motion.button>
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onNavigate && onNavigate('become-organizer')}
                              className="min-h-[48px] w-[240px] px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <span className="material-symbols-outlined text-sm">workspace_premium</span> Host Events
                            </motion.button>
                          )}
                        </div>
                        </div>

                        {/* Description */}
                        <p className="mt-4 font-body-sm text-[11px] sm:text-xs text-on-surface-variant/90 max-w-[700px] mx-auto sm:mx-0 leading-relaxed text-center sm:text-left">
                          {playerData.bio || 'Competitive Arena Contender. Defending champions in the esports league.'}
                        </p>

                        {/* Mobile buttons — stacked, full width */}
                        <div className="flex sm:hidden flex-col gap-3 mt-6">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setPlayerEditForm({ ...playerData }); setIsEditingProfile(true); }}
                            className="min-h-[48px] w-full px-5 rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">edit</span> Edit Cover
                          </motion.button>
                          {currentUser?.role === 'organiser' ? (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onNavigate && onNavigate('org-management')}
                              className="min-h-[48px] w-full px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <span className="material-symbols-outlined text-sm">corporate_fare</span> Organiser Hub
                            </motion.button>
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onNavigate && onNavigate('become-organizer')}
                              className="min-h-[48px] w-full px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <span className="material-symbols-outlined text-sm">workspace_premium</span> Host Events
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Premium Stats Grid Row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { label: 'XP LEVEL', value: `Lvl ${stats.xpLevel}`, icon: 'military_tech', color: 'text-primary bg-primary/10 border-primary/20' },
                        { label: 'PLAYER RANK', value: stats.rank, icon: 'grade', color: 'text-secondary bg-secondary/10 border-secondary/20' },
                        { label: 'TOURNAMENTS', value: `${stats.tournaments} Played`, icon: 'sports_esports', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                        { label: 'MATCH WINS', value: `${stats.wins} Gold`, icon: 'emoji_events', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                        { label: 'TOTAL EARNED', value: stats.earnings, icon: 'payments', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
                      ].map((item, index) => (
                        <div key={index} className="glass-card p-3 sm:p-4 rounded-xl border border-outline-variant/30 bg-surface/40 flex items-center gap-3 group hover:scale-[1.02] hover:border-primary/25 transition-all shadow-sm">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${item.color} shrink-0`}>
                            <span className="material-symbols-outlined text-lg">{item.icon}</span>
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className="text-[8px] font-bold tracking-wider text-on-surface-variant uppercase block">{item.label}</span>
                            <span className="text-[11px] sm:text-xs font-black text-on-background block truncate">{item.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Segmented Tab Navigation for Desktop (Hidden on mobile) */}
                    <div className="hidden md:block glass-card p-1 rounded-2xl border border-outline-variant/35 bg-surface/50 shadow-sm">
                      <div className="flex gap-1">
                        {[
                          { id: 'overview', label: 'Overview', icon: 'dashboard' },
                          { id: 'teams', label: 'Teams & Squads', icon: 'group' },
                          { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
                          { id: 'wallet', label: 'Wallet & Payouts', icon: 'account_balance_wallet' },
                          { id: 'settings', label: 'Settings', icon: 'settings' }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 font-headline-md text-xs font-bold rounded-xl transition-all duration-200 relative ${
                              activeTab === tab.id
                                ? 'text-white'
                                : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/40'
                            }`}
                          >
                            {activeTab === tab.id && (
                              <motion.div
                                layoutId="activePlayerTab"
                                className="absolute inset-0 bg-primary rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-primary/20 z-0"
                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                              />
                            )}
                            <span className="material-symbols-outlined text-base relative z-10">{tab.icon}</span>
                            <span className="relative z-10">{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal Scroll Navigation for Mobile (Sticky bottom is also loaded) */}
                    <div className="md:hidden glass-card p-1 rounded-xl border border-outline-variant/30 bg-surface/40 overflow-x-auto no-scrollbar">
                      <div className="flex gap-1 min-w-max">
                        {[
                          { id: 'overview', label: 'Overview', icon: 'dashboard' },
                          { id: 'teams', label: 'Teams', icon: 'group' },
                          { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
                          { id: 'wallet', label: 'Wallet', icon: 'account_balance_wallet' },
                          { id: 'settings', label: 'Settings', icon: 'settings' }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 py-2 px-3.5 font-headline-md text-xs font-bold rounded-lg transition-all relative ${
                              activeTab === tab.id
                                ? 'text-white'
                                : 'text-on-surface-variant hover:text-on-background hover:bg-surface-variant/40'
                            }`}
                          >
                            {activeTab === tab.id && (
                              <motion.div
                                layoutId="activePlayerTabMobile"
                                className="absolute inset-0 bg-primary rounded-lg shadow-md z-0"
                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                              />
                            )}
                            <span className="material-symbols-outlined text-base relative z-10">{tab.icon}</span>
                            <span className="relative z-10">{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </>
          )}

          {/* Own Profile Tab Content wrapper */}
          {isOwnProfile && (
            <div className="pb-4 md:pb-0 pt-4 sm:pt-6">
              <AnimatePresence mode="wait">
                {/* Tab Content */}
                {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6 sm:space-y-8"
                >
                  {/* Responsive 4-Column Card Grid (Staggered Children) */}
                  <motion.div
                    variants={statsContainerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                  >
                    {/* 1. Total Matches Card */}
                    <motion.div
                      variants={statsCardVariants}
                      whileHover={{ y: -4, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="glass-card no-transition p-4 sm:p-5 rounded-2xl border border-outline-variant/35 bg-surface/50 shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/25"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Total Matches</span>
                          <span className="text-xl sm:text-2xl font-black text-on-background block">
                            {userRegistrations.length * 3 + 12}
                          </span>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                          <span className="material-symbols-outlined text-lg">leaderboard</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-outline-variant/20 grid grid-cols-3 gap-1 text-[9px] font-bold text-on-surface-variant">
                        <div>
                          <span className="block text-primary">VAL: {userRegistrations.length * 2 + 5}</span>
                        </div>
                        <div>
                          <span className="block text-secondary">BGMI: {userRegistrations.length + 3}</span>
                        </div>
                        <div>
                          <span className="block text-rose-400">CS2: 4</span>
                        </div>
                      </div>
                    </motion.div>

                    {/* 2. Win Rate Card */}
                    <motion.div
                      variants={statsCardVariants}
                      whileHover={{ y: -4, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="glass-card no-transition p-4 sm:p-5 rounded-2xl border border-outline-variant/35 bg-surface/50 shadow-sm flex flex-col justify-between space-y-3 hover:border-primary/25"
                    >
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Win Rate</span>
                          <span className="text-xl sm:text-2xl font-black text-on-background block">68.4%</span>
                        </div>
                        {/* Mini Circular Gauge */}
                        <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="20" cy="20" r="16" fill="transparent" stroke="rgba(var(--primary), 0.1)" strokeWidth="3" />
                            <circle cx="20" cy="20" r="16" fill="transparent" stroke="rgb(var(--primary))" strokeWidth="3" strokeDasharray={100} strokeDashoffset={100 - 68} strokeLinecap="round" />
                          </svg>
                          <span className="absolute text-[8px] font-black text-on-background">68%</span>
                        </div>
                      </div>
                      <div className="pt-1.5 border-t border-outline-variant/20 flex justify-between text-[9px] font-bold text-on-surface-variant">
                        <span>Wins: {userRegistrations.length * 2 + 6}</span>
                        <span>Losses: {userRegistrations.length + 2}</span>
                      </div>
                    </motion.div>

                    {/* 3. Teams Joined Card */}
                    <motion.div
                      variants={statsCardVariants}
                      whileHover={{ y: -4, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="glass-card no-transition p-4 sm:p-5 rounded-2xl border border-outline-variant/35 bg-surface/50 shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/25"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Teams Joined</span>
                          <span className="text-xl sm:text-2xl font-black text-on-background block">
                            {presets.length || 2} Active
                          </span>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-secondary/10 border border-secondary/25 flex items-center justify-center text-secondary shrink-0">
                          <span className="material-symbols-outlined text-lg">group</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-outline-variant/20">
                        <button onClick={() => setActiveTab('teams')} className="text-primary hover:underline text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 min-h-[44px]">
                          Manage Squads <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                        </button>
                      </div>
                    </motion.div>

                    {/* 4. Earnings Card */}
                    <motion.div
                      variants={statsCardVariants}
                      whileHover={{ y: -4, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="glass-card no-transition p-4 sm:p-5 rounded-2xl border border-outline-variant/35 bg-surface/50 shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/25"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Total Winnings</span>
                          <span className="text-xl sm:text-2xl font-black text-secondary block font-prize-display">
                            {(() => {
                              const totalEarnings = walletTransactions
                                .filter(tx => tx.type === 'credit')
                                .reduce((sum, tx) => sum + Number(tx.amount.replace(/[^\d]/g, '')), 0) || 85000;
                              return `₹${totalEarnings.toLocaleString('en-IN')}`;
                            })()}
                          </span>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                          <span className="material-symbols-outlined text-lg">payments</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-outline-variant/20 flex justify-between items-center text-[9px] font-bold text-on-surface-variant">
                        <span>Vault Secured</span>
                        <button onClick={() => setActiveTab('wallet')} className="text-secondary hover:underline min-h-[44px] flex items-center">
                          View Wallet
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>

                  {/* Main content body (Upcoming Matches + Connected Accounts) */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                    {/* Left 2 Columns: Upcoming Matches */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                          <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background tracking-tight">
                            <span className="material-symbols-outlined text-primary text-xl">schedule</span> Upcoming Matches
                          </h3>
                        </div>
                        {playerTournamentsList.filter(t => t.status === 'live' || t.status === 'upcoming').length === 0 ? (
                          <div className="text-center py-12 space-y-3 bg-surface-variant/20 rounded-xl border border-outline-variant/10">
                            <span className="material-symbols-outlined text-3xl text-on-surface-variant">schedule</span>
                            <p className="font-body-sm text-xs text-on-surface-variant">No upcoming matches scheduled.</p>
                            <button onClick={() => onNavigate && onNavigate('tournaments')} className="px-4 min-h-[44px] bg-primary hover:bg-primary/95 text-white font-headline-md text-xs font-bold rounded-xl transition-all shadow-md">
                              Find Tournaments
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {playerTournamentsList.filter(t => t.status === 'live' || t.status === 'upcoming').map((match, idx) => (
                              <div key={idx} className="glass-card p-3.5 sm:p-4 rounded-xl border border-outline-variant/30 bg-surface-container-highest/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-primary/20 transition-all">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-label-caps text-[8px] font-bold uppercase tracking-wider">{match.game}</span>
                                    <span className="font-label-caps text-[9px] text-error font-bold uppercase animate-pulse flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-error inline-block"></span> {match.status === 'live' ? 'MATCH LIVE' : 'UPCOMING'}
                                    </span>
                                  </div>
                                  <h4 className="font-headline-md text-xs sm:text-sm font-bold text-on-background pt-0.5">{match.title}</h4>
                                  <div className="font-body-sm text-[10px] text-on-surface-variant">Date: {match.date} | Entry: {match.entry}</div>
                                </div>
                                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                                  <button onClick={() => onNavigate && onNavigate('tournament-detail', match.id)} className="px-3.5 min-h-[44px] bg-primary hover:bg-primary/95 text-white text-[10px] font-bold uppercase rounded-lg shadow-sm transition-all">
                                    Lobby Info
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Trophies & Achievements Showcase */}
                      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                          <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background tracking-tight">
                            <span className="material-symbols-outlined text-amber-400 text-xl">trophy</span> Trophies &amp; Achievements ({trophies.length})
                          </h3>
                        </div>
                        {trophies.length === 0 ? (
                          <div className="text-center py-8 space-y-2 bg-surface-variant/20 rounded-xl border border-outline-variant/10">
                            <span className="material-symbols-outlined text-3xl text-on-surface-variant">emoji_events</span>
                            <p className="font-body-sm text-xs text-on-surface-variant">No trophies earned yet. Win matches to fill your trophy room!</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {trophies.map((trophy, idx) => (
                              <div key={idx} className="glass-card p-3 rounded-xl border border-outline-variant/30 bg-surface-container-highest flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg bg-surface flex items-center justify-center ${trophy.color} border border-outline-variant/30 shrink-0`}>
                                  <span className="material-symbols-outlined text-lg">{trophy.icon}</span>
                                </div>
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <h4 className="font-headline-md text-xs font-semibold text-on-background truncate">{trophy.title}</h4>
                                  <span className="text-[9px] text-on-surface-variant block">{trophy.place} | {trophy.game}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Connected Game IDs & Timeline */}
                    <div className="space-y-6">
                      {/* Connected Game IDs */}
                      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4">
                        <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight">
                          <span className="material-symbols-outlined text-secondary text-xl">smart_toy</span> Connected Game IDs
                        </h3>
                        <div className="space-y-2.5">
                          {[
                            { label: 'Riot ID (Valorant)', value: playerData.riotId, icon: 'shield' },
                            { label: 'BGMI Character ID', value: playerData.bgmiId, icon: 'phone_iphone' },
                            { label: 'Steam ID (CS2)', value: playerData.steamId, icon: 'desktop_windows' },
                            { label: 'Discord Tag', value: playerData.discordTag, icon: 'forum' }
                          ].map((item, idx) => (
                            <div key={idx} className="glass-card p-3 rounded-xl bg-surface-variant/40 border border-outline-variant/25 flex items-center justify-between gap-2 shadow-sm hover:border-primary/20 transition-all">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">{item.icon}</span>
                                <div className="min-w-0">
                                  <div className="font-label-caps text-[8px] sm:text-[9px] text-on-surface-variant uppercase tracking-wider">{item.label}</div>
                                  <div className="font-headline-md text-xs font-bold text-on-background truncate">{item.value || 'Not Connected'}</div>
                                </div>
                              </div>
                              <button onClick={() => triggerToast(`Copied ${item.label} to clipboard!`)} className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-background transition-colors shrink-0" title="Copy ID">
                                <span className="material-symbols-outlined text-sm">content_copy</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Activity Timeline */}
                      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4">
                        <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight">
                          <span className="material-symbols-outlined text-primary text-xl">history</span> Activity Timeline
                        </h3>
                        {playerActivityFeed.length === 0 ? (
                          <div className="relative pl-4 border-l-2 border-outline-variant/40 space-y-4 py-1">
                            {[
                              { text: 'Registered for Valorant Underworld Cup', time: '2 hours ago' },
                              { text: 'Joined Titan Esports Roster', time: '1 day ago' },
                              { text: 'Withdrew ₹5,000 Winnings', time: '3 days ago' }
                            ].map((activity, idx) => (
                              <div key={idx} className="relative space-y-0.5">
                                <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-primary border border-surface shadow-[0_0_5px_rgba(37,99,235,0.5)]"></div>
                                <h4 className="font-headline-md text-xs font-semibold text-on-background leading-relaxed">{activity.text}</h4>
                                <div className="font-body-sm text-[10px] text-on-surface-variant">{activity.time}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative pl-4 border-l-2 border-outline-variant/40 space-y-5">
                            {playerActivityFeed.map((activity, idx) => (
                              <div key={idx} className="relative space-y-0.5">
                                <div className="absolute -left-[23px] top-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background ring-4 ring-primary/20"></div>
                                <h4 className="font-headline-md text-xs font-semibold text-on-background leading-relaxed">{activity.text}</h4>
                                <div className="font-body-sm text-[10px] text-on-surface-variant">{activity.time}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tab 2: My Tournaments */}
              {activeTab === 'tournaments' && (
                <motion.div
                  key="tournaments"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
                    <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background tracking-tight">
                      <span className="material-symbols-outlined text-primary text-xl">sports_esports</span> Roster Registrations
                    </h3>
                    <div className="flex items-center gap-1 bg-surface-container p-1 rounded-lg border border-outline-variant/30">
                      {['all', 'live', 'upcoming', 'completed'].map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setTournamentFilter(filter)}
                          className={`px-3 min-h-[44px] rounded-md font-headline-md text-[10px] font-bold uppercase tracking-wider transition-all ${tournamentFilter === filter ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-background'}`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredPlayerTournaments.length === 0 ? (
                    <div className="text-center py-16 space-y-4 bg-surface-variant/10 rounded-2xl border border-outline-variant/15 p-6 animate-in fade-in duration-300">
                      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                        <span className="material-symbols-outlined text-3xl animate-pulse">sports_esports</span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-headline-md text-sm sm:text-base font-black text-on-background">No Tournament Registrations</h4>
                        <p className="font-body-sm text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">You haven't signed up for any competitive events yet. Browse active tournaments to kickstart your journey!</p>
                      </div>
                      <button 
                        onClick={() => onNavigate && onNavigate('tournaments')}
                        className="px-6 min-h-[44px] bg-primary hover:bg-primary/95 text-white font-headline-md text-xs font-bold rounded-xl transition-all shadow-md inline-flex items-center gap-1.5 mx-auto"
                      >
                        <span className="material-symbols-outlined text-sm">explore</span> Explore Tournaments
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPlayerTournaments.map((t, idx) => (
                        <div key={idx} className="bg-surface-container-highest p-4 rounded-xl border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-primary/40 transition-all">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-label-caps text-[9px] font-bold">{t.game}</span>
                              <span className={`px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider ${t.badgeBg}`}>{t.badgeText}</span>
                              <span className="font-body-sm text-[11px] text-on-surface-variant ml-0">{t.date}</span>
                            </div>
                            <h4 className="font-headline-md text-sm sm:text-base font-bold text-on-background truncate">{t.title}</h4>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-on-surface-variant font-body-sm text-[11px] sm:text-xs">
                              <span>Entry: <strong className="text-on-background font-medium">{t.entry}</strong></span>
                              <span>•</span>
                              <span>Total Rewards: <strong className="text-secondary font-semibold">{t.prize}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-outline-variant/30 pt-3 md:pt-0 shrink-0">
                            <div className="text-left md:text-right">
                              <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">Registration Status</div>
                              <div className={`font-headline-md text-xs font-semibold ${t.result === 'Approved & Registered' ? 'text-emerald-400' : t.result === 'Rejected' ? 'text-rose-400' : 'text-primary'}`}>{t.result}</div>
                            </div>
                            <button onClick={() => onNavigate && onNavigate(`tournament-${t.id}`)} className="px-4 min-h-[44px] bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/30 rounded-lg font-headline-md text-xs font-semibold transition-all">
                              Lobby Hub
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 3: Teams & Squads */}
              {activeTab === 'teams' && (
                <motion.div
                  key="teams"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6 sm:space-y-8"
                >
                  
                  {/* Saved Team Presets Section */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-6">
                    <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                      <div className="min-w-0">
                        <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background tracking-tight">
                          <span className="material-symbols-outlined text-secondary text-xl">bookmark_added</span> Saved Team Presets
                        </h3>
                        <p className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">Manage up to 4 squad configurations ({presets.length}/4 used)</p>
                      </div>
                      
                      {presets.length < 4 && !isCreatingPreset && (
                        <button 
                          onClick={() => {
                            setPresetTeamName('');
                            setPresetCaptain(currentUser?.gamerTag || '');
                            setPresetMembers(['', '', '']);
                            setIsCreatingPreset(true);
                            setIsEditingPreset(null);
                          }}
                          className="flex items-center gap-1 min-h-[44px] px-3 bg-secondary hover:bg-secondary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all active:scale-95 shadow-sm shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm font-bold">add</span> Add Preset
                        </button>
                      )}
                    </div>

                    {/* Inline Create Preset Form */}
                    {isCreatingPreset && (
                      <form onSubmit={handleCreatePreset} className="bg-surface-container-highest p-4 sm:p-5 rounded-xl border border-outline-variant/50 space-y-4 shadow-md animate-in slide-in-from-top-3 duration-200">
                        <h4 className="font-headline-md text-xs sm:text-sm font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base">group_add</span> Create New Preset
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider block font-bold">Team Name *</label>
                            <input 
                              type="text"
                              value={presetTeamName}
                              onChange={(e) => setPresetTeamName(e.target.value)}
                              placeholder="e.g. Soul Seekers"
                              required
                              className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-secondary transition-colors"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider block font-bold">Captain GamerTag *</label>
                            <input 
                              type="text"
                              value={presetCaptain}
                              onChange={(e) => setPresetCaptain(e.target.value)}
                              placeholder="e.g. Viper#1337"
                              required
                              className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-secondary transition-colors"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider block font-bold">Squad Members (GamerTags)</label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {presetMembers.map((m, mIdx) => (
                              <div key={mIdx} className="space-y-1">
                                <label className="text-[9px] text-on-surface-variant font-medium">Player {mIdx + 2}</label>
                                <input 
                                  type="text"
                                  value={m}
                                  onChange={(e) => {
                                    const updated = [...presetMembers];
                                    updated[mIdx] = e.target.value;
                                    setPresetMembers(updated);
                                  }}
                                  placeholder={`Player ${mIdx + 2} Tag`}
                                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-background focus:outline-none focus:border-secondary transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-2 border-t border-outline-variant/20">
                          <button 
                            type="button" 
                            onClick={() => setIsCreatingPreset(false)}
                            className="py-2 px-4 bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/40 rounded-lg font-headline-md text-xs font-semibold shadow-sm transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit"
                            className="py-2 px-5 bg-secondary hover:bg-secondary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm"
                          >
                            Save Preset
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Presets Grid */}
                    {presets.length === 0 ? (
                      <div className="text-center py-12 space-y-4 bg-surface-variant/10 rounded-xl border border-outline-variant/15 p-6">
                        <div className="w-12 h-12 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center mx-auto text-secondary">
                          <span className="material-symbols-outlined text-2xl">bookmark_add</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-headline-md text-xs sm:text-sm font-bold text-on-background">No Saved Presets</h4>
                          <p className="font-body-sm text-[11px] text-on-surface-variant max-w-xs mx-auto leading-relaxed">Save up to 4 squad configurations for one-click checkout and roster registrations.</p>
                        </div>
                        {!isCreatingPreset && (
                          <button 
                            onClick={() => setIsCreatingPreset(true)}
                            className="px-5 min-h-[44px] bg-secondary hover:bg-secondary/90 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 mx-auto"
                          >
                            <span className="material-symbols-outlined text-sm">add</span> Create Squad Preset
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {presets.map((preset) => {
                          const isEditing = isEditingPreset === preset.id;
                          let parsedMembers = [];
                          try {
                            parsedMembers = typeof preset.members === 'string' ? JSON.parse(preset.members) : preset.members;
                          } catch(e) {
                            parsedMembers = [];
                          }
                          
                          while (parsedMembers.length < 3) {
                            parsedMembers.push('');
                          }

                          if (isEditing) {
                            return (
                              <div key={preset.id} className="bg-surface-container-highest p-4 rounded-xl border border-secondary/50 space-y-4 shadow-lg animate-in fade-in duration-200">
                                <h4 className="font-headline-md text-xs sm:text-sm font-bold text-secondary uppercase tracking-wider flex items-center gap-1">
                                  <span className="material-symbols-outlined text-base">edit</span> Edit Preset
                                </h4>
                                
                                <div className="space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Team Name</label>
                                    <input 
                                      type="text"
                                      value={editTeamName}
                                      onChange={(e) => setEditTeamName(e.target.value)}
                                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-background focus:outline-none focus:border-secondary"
                                    />
                                  </div>
                                  
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Captain GamerTag</label>
                                    <input 
                                      type="text"
                                      value={editCaptain}
                                      onChange={(e) => setEditCaptain(e.target.value)}
                                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-background focus:outline-none focus:border-secondary"
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <label className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider block font-medium">Squad Members</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {editMembers.map((memberVal, mIdx) => (
                                        <div key={mIdx} className="space-y-0.5">
                                          <span className="text-[8px] text-on-surface-variant">Player {mIdx + 2}</span>
                                          <input 
                                            type="text"
                                            value={memberVal}
                                            onChange={(e) => {
                                              const updated = [...editMembers];
                                              updated[mIdx] = e.target.value;
                                              setEditMembers(updated);
                                            }}
                                            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-2 py-1.5 text-[11px] text-on-background focus:outline-none focus:border-secondary"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/10">
                                  <button 
                                    type="button"
                                    onClick={() => setIsEditingPreset(null)}
                                    className="py-1.5 px-3 bg-surface-container hover:bg-surface-variant text-on-background border border-outline-variant/40 rounded-lg font-headline-md text-[10px] font-semibold"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => handleUpdatePreset(preset.id, editTeamName, editCaptain, editMembers)}
                                    className="py-1.5 px-4 bg-secondary hover:bg-secondary/90 text-on-primary rounded-lg font-headline-md text-[10px] font-bold"
                                  >
                                    Save Changes
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={preset.id} className="bg-surface-container-highest/65 p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between gap-3 shadow-sm hover:border-outline-variant/60 transition-all">
                              <div>
                                <div className="flex justify-between items-center gap-2">
                                  <h4 className="font-headline-md text-sm font-bold text-on-background tracking-tight truncate">{preset.team_name}</h4>
                                  <div className="flex gap-1.5 shrink-0">
                                    <button 
                                      onClick={() => {
                                        setEditTeamName(preset.team_name);
                                        setEditCaptain(preset.captain);
                                        setEditMembers(parsedMembers);
                                        setIsEditingPreset(preset.id);
                                        setIsCreatingPreset(false);
                                      }}
                                      className="p-1 rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-background transition-colors"
                                      title="Edit preset"
                                    >
                                      <span className="material-symbols-outlined text-sm">edit</span>
                                    </button>
                                    <button 
                                      onClick={() => handleDeletePreset(preset.id)}
                                      className="p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 text-on-surface-variant transition-colors"
                                      title="Delete preset"
                                    >
                                      <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                  </div>
                                </div>
                                <div className="text-[10px] text-on-surface-variant font-medium pt-1">
                                  Captain: <strong className="text-on-background font-medium">{preset.captain}</strong>
                                </div>
                                {parsedMembers.filter(m => m !== '').length > 0 && (
                                  <div className="text-[9px] text-on-surface-variant/80 font-medium pt-1 truncate">
                                    Members: {parsedMembers.filter(m => m !== '').join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Registered Teams rosters display */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                    <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight">
                      <span className="material-symbols-outlined text-primary text-xl">groups</span> Active Rosters History ({teamMembers.length})
                    </h3>
                    
                    {teamMembers.length === 0 ? (
                      <div className="text-center py-12 space-y-4 bg-surface-variant/10 rounded-xl border border-outline-variant/15 p-6">
                        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                          <span className="material-symbols-outlined text-2xl animate-pulse">groups</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-headline-md text-xs sm:text-sm font-bold text-on-background">No Active Rosters</h4>
                          <p className="font-body-sm text-[11px] text-on-surface-variant max-w-xs mx-auto leading-relaxed">You aren't registered in any active tournament squad. Coordinate with your team and join an arena!</p>
                        </div>
                        <button 
                          onClick={() => onNavigate && onNavigate('tournaments')}
                          className="px-5 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl font-headline-md text-xs font-bold transition-all shadow-md flex items-center gap-1.5 mx-auto"
                        >
                          <span className="material-symbols-outlined text-sm">sports_esports</span> Join a Tournament
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {teamMembers.map((team, idx) => (
                          <div key={idx} className="bg-surface-container-highest/60 p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between gap-3 shadow-sm">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center gap-2">
                                <h4 className="font-headline-md text-sm sm:text-base font-bold text-on-background tracking-tight truncate">{team.name}</h4>
                                <span className={`px-2 py-0.5 rounded font-label-caps text-[8px] font-bold uppercase tracking-wider shrink-0 ${team.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-primary/20 text-primary border border-primary/30'}`}>{team.status}</span>
                              </div>
                              <p className="font-body-sm text-[10px] text-on-surface-variant/80 font-medium truncate">{team.tag}</p>
                              
                              <div className="pt-2 border-t border-outline-variant/20 space-y-1">
                                <div className="font-label-caps text-[8px] text-on-surface-variant font-bold uppercase">Roster Members</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {team.members.map((m, mIdx) => (
                                    <span key={mIdx} className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-[10px] text-on-background font-medium">{m}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Tab 4: Wallet & Payouts */}
              {activeTab === 'wallet' && (
                <motion.div
                  key="wallet"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6 sm:space-y-8"
                >
                  {/* Balance Showcase */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm flex flex-col justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="font-label-caps text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Available Balance</span>
                        <div className="font-prize-display text-2xl sm:text-3xl font-extrabold text-on-background flex items-baseline gap-1 pt-1">
                          ₹<CountUp end={currentUser?.wallet_balance || 0.00} decimals={2} />
                        </div>
                      </div>
                      <button onClick={() => triggerToast('Withdrawal gateway is opening soon...')} className="w-full min-h-[44px] bg-primary hover:bg-primary/95 active:scale-95 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">payments</span> Withdraw Funds
                      </button>
                    </div>

                    <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm flex flex-col justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="font-label-caps text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Total Earnings</span>
                        <div className="font-prize-display text-2xl sm:text-3xl font-extrabold text-secondary flex items-baseline gap-1 pt-1">
                          ₹<CountUp end={playerWalletTransactions.reduce((acc, t) => t.type === 'credit' ? acc + parseFloat(t.amount.replace(/[^0-9.]/g, '')) : acc, 0)} decimals={2} />
                        </div>
                      </div>
                      <span className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant/60 leading-tight">All tournament rewards and distributions.</span>
                    </div>

                    <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm flex flex-col justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="font-label-caps text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">KYC Verification</span>
                        <div className="font-headline-md text-lg font-bold text-emerald-400 flex items-center gap-1.5 pt-1 uppercase tracking-wider">
                          <span className="material-symbols-outlined text-xl">verified_user</span> Approved
                        </div>
                      </div>
                      <span className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant/60 leading-tight">Your KYC documents are verified — all withdrawal caps and fast-payout features are active.</span>
                    </div>
                  </div>

                  {/* Wallet History */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                    <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight"><span className="material-symbols-outlined text-primary text-xl">account_balance_wallet</span> Transaction Ledger</h3>
                    {playerWalletTransactions.length === 0 ? (
                      <div className="text-center py-8 space-y-2.5">
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">receipt_long</span>
                        <div className="font-headline-md text-sm text-on-surface-variant">No transaction history found on this wallet ledger.</div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left font-body-sm text-xs border-collapse min-w-[650px]">
                          <thead>
                            <tr className="border-b border-outline-variant/35 text-[10px] text-on-surface-variant/80 uppercase font-bold tracking-wider">
                              <th className="py-2.5 px-4 font-bold">Transaction Reference ID</th>
                              <th className="py-2.5 px-4 font-bold">Description</th>
                              <th className="py-2.5 px-4 font-bold">Type</th>
                              <th className="py-2.5 px-4 font-bold">Amount</th>
                              <th className="py-2.5 px-4 font-bold">Status</th>
                              <th className="py-2.5 px-4 font-bold text-right">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {playerWalletTransactions.map((tx, idx) => (
                              <tr key={tx.id || idx} className="hover:bg-surface-variant/20 transition-colors">
                                <td className="py-3 px-4 font-bold text-on-background truncate max-w-[120px]">{tx.id || `TXN-REF-${10293 + idx}`}</td>
                                <td className="py-3 px-4 font-medium max-w-[200px] truncate">{tx.desc}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded font-label-caps text-[8px] font-bold uppercase tracking-wider ${tx.type === 'credit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{tx.type}</span>
                                </td>
                                <td className={`py-3 px-4 font-bold font-prize-display ${tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>{tx.amount}</td>
                                <td className="py-3 px-4 font-medium text-on-surface-variant/80">{tx.status}</td>
                                <td className="py-3 px-4 text-right text-on-surface-variant">{tx.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              {/* Tab 5: Settings */}
              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6 sm:space-y-8"
                >
                  {/* Unified Profile Settings Card */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-6">
                    <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight">
                      <span className="material-symbols-outlined text-primary text-xl">settings</span> Profile Settings
                    </h3>

                    {/* Section 1: Gamer Tag / Username */}
                    <div className="space-y-4">
                      <h4 className="font-headline-md text-sm font-bold uppercase flex items-center gap-1.5 text-on-background tracking-tight">
                        <span className="material-symbols-outlined text-primary text-lg">alternate_email</span> Gamer Tag
                      </h4>
                      <div className="flex items-center justify-between gap-4 p-3 bg-surface-container rounded-xl border border-outline-variant/30">
                        <div className="min-w-0">
                          <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider block">Current Username</span>
                          <strong className="text-on-background text-sm">{playerData.gamerTag}</strong>
                        </div>
                        {gamertagCooldownDays > 0 ? (
                          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold shrink-0">
                            <span className="material-symbols-outlined text-base animate-pulse">schedule</span>
                            <span>{gamertagCooldownDays}d</span>
                          </div>
                        ) : (
                          !isEditingUsername && (
                            <button
                              type="button"
                              onClick={() => setIsEditingUsername(true)}
                              className="px-3.5 min-h-[44px] bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span> Edit
                            </button>
                          )
                        )}
                      </div>

                      {isEditingUsername && gamertagCooldownDays === 0 && (
                        <div className="space-y-4 pt-2 border-t border-outline-variant/20 animate-in slide-in-from-top-3 duration-200">
                          <div className="space-y-1">
                            <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">New Username</label>
                            <AbuseFieldWrapper fieldId="settings-playerTag" value={settingsGamerTag} onWarning={setPlayerTagAbuse}>
                              <input
                                type="text"
                                value={settingsGamerTag}
                                onChange={(e) => setSettingsGamerTag(e.target.value)}
                                placeholder="e.g. @new_tag"
                                className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                              />
                            </AbuseFieldWrapper>
                          </div>
                          {settingsGamerTag.trim() && settingsGamerTag.trim() !== playerData.gamerTag && (
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-3 animate-in fade-in duration-200">
                              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Verification Required</p>
                              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                                A one-time code will be sent to <strong className="text-on-background">{playerData.email}</strong>.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Enter 6-digit Code"
                                  value={playerOtpCode}
                                  onChange={(e) => setPlayerOtpCode(e.target.value)}
                                  maxLength={6}
                                  className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background text-xs outline-none focus:border-primary tracking-widest font-mono"
                                />
                                {playerOtpSent ? (
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyAndSaveUsername(true)}
className="px-4 min-h-[44px] bg-emerald-500 hover:bg-emerald-600 rounded-lg text-on-primary font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-sm">verified</span> Verify & Save
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isPlayerSendingOtp}
                                    onClick={() => sendProfileOtp(playerData.email, true)}
                                    className="px-4 min-h-[44px] bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-on-primary font-headline-md text-xs font-bold transition-all flex items-center gap-1.5"
                                  >
                                    {isPlayerSendingOtp ? (
                                      <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Sending…</>
                                    ) : (
                                      <><span className="material-symbols-outlined text-sm">send</span> Send Code</>
                                    )}
                                  </button>
                                )}
                              </div>
                              {playerOtpSent && playerOtpCountdown > 0 && (
                                <p className="text-[10px] text-on-surface-variant">Resend in <strong className="text-primary">{playerOtpCountdown}s</strong></p>
                              )}
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => { setIsEditingUsername(false); setSettingsGamerTag(''); }}
                              className="px-4 py-2 border border-outline hover:bg-surface-variant text-on-background rounded-lg font-headline-md text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Section 2: Change Email Address */}
                    <div className="border-t border-outline-variant/20 pt-5 space-y-4">
                      <h4 className="font-headline-md text-sm font-bold uppercase flex items-center gap-1.5 text-on-background tracking-tight">
                        <span className="material-symbols-outlined text-primary text-lg">mail</span> Change Email
                      </h4>
                      {emailCooldownDays > 0 ? (
                        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                          <span className="material-symbols-outlined text-amber-400 text-xl shrink-0">schedule</span>
                          <p className="text-xs text-amber-300 leading-relaxed">
                            Email was recently changed. You can change it again in <strong>{emailCooldownDays} days</strong>.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl border border-outline-variant/30">
                            <span className="material-symbols-outlined text-on-surface-variant text-lg shrink-0">info</span>
                            <p className="text-[11px] text-on-surface-variant leading-relaxed">
                              Current email: <strong className="text-on-background">{playerData.email || orgData.email}</strong>. Changing requires a verification code sent to your old email.
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">New Email Address</label>
                            <input
                              type="email"
                              value={settingsEmail}
                              onChange={(e) => setSettingsEmail(e.target.value)}
                              placeholder="e.g. newemail@domain.com"
                              className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                            />
                          </div>
                          {settingsEmail.trim() && settingsEmail.trim().toLowerCase() !== (playerData.email || orgData.email || '').toLowerCase() && (
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-3 animate-in fade-in duration-200">
                              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Verification Required</p>
                              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                                A code will be sent to your old email: <strong className="text-on-background">{playerData.email || orgData.email}</strong>
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Enter 6-digit Code"
                                  value={emailOtpCode}
                                  onChange={(e) => setEmailOtpCode(e.target.value)}
                                  maxLength={6}
                                  className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background text-xs outline-none focus:border-primary tracking-widest font-mono"
                                />
                                {emailOtpSent ? (
                                  <button
                                    type="button"
                                    onClick={handleVerifyAndSaveEmail}
className="px-4 min-h-[44px] bg-emerald-500 hover:bg-emerald-600 rounded-lg text-on-primary font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-sm">verified</span> Verify & Save
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isEmailSendingOtp}
                                    onClick={() => {
                                      sendEmailOtp(playerData.email || orgData.email)
                                    }}
                                    className="px-4 min-h-[44px] bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-on-primary font-headline-md text-xs font-bold transition-all flex items-center gap-1.5"
                                  >
                                    {isEmailSendingOtp ? (
                                      <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Sending…</>
                                    ) : (
                                      <><span className="material-symbols-outlined text-sm">send</span> Send Code</>
                                    )}
                                  </button>
                                )}
                              </div>
                              {emailOtpSent && emailOtpCountdown > 0 && (
                                <p className="text-[10px] text-on-surface-variant">Resend in <strong className="text-primary">{emailOtpCountdown}s</strong></p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Section 3: Change Password */}
                    <div className="border-t border-outline-variant/20 pt-5 space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <h4 className="font-headline-md text-sm font-bold uppercase flex items-center gap-1.5 text-on-background tracking-tight">
                          <span className="material-symbols-outlined text-primary text-lg">lock</span> Change Password
                        </h4>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="font-label-caps text-[10px] text-primary hover:text-primary uppercase transition-colors font-bold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">help_outline</span> Forget Password?
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Current Password</label>
                          <div className="relative">
                            <input
                              type={showCurrentPassword ? "text" : "password"}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="Enter current password"
                              className="w-full bg-surface-container border border-outline-variant rounded-lg pl-3 pr-10 py-2 text-on-background font-body-sm text-xs focus:border-primary outline-none transition-all shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background transition-colors focus:outline-none"
                            >
                              <span className="material-symbols-outlined text-base select-none">
                                {showCurrentPassword ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">New Password</label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Min 6 characters"
                              className="w-full bg-surface-container border border-outline-variant rounded-lg pl-3 pr-10 py-2 text-on-background font-body-sm text-xs focus:border-primary outline-none transition-all shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background transition-colors focus:outline-none"
                            >
                              <span className="material-symbols-outlined text-base select-none">
                                {showNewPassword ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Confirm Password</label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Re-type new password"
                              className="w-full bg-surface-container border border-outline-variant rounded-lg pl-3 pr-10 py-2 text-on-background font-body-sm text-xs focus:border-primary outline-none transition-all shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background transition-colors focus:outline-none"
                            >
                              <span className="material-symbols-outlined text-base select-none">
                                {showConfirmPassword ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => autoSavePassword(currentPassword, newPassword, confirmPassword)}
                          className="px-4 min-h-[44px] bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">lock_reset</span> Change Password
                        </button>
                      </div>
                    </div>

                    {/* Section 4: Contact Number */}
                    <div className="border-t border-outline-variant/20 pt-5 space-y-4">
                      <h4 className="font-headline-md text-sm font-bold uppercase flex items-center gap-1.5 text-on-background tracking-tight">
                        <span className="material-symbols-outlined text-primary text-lg">call</span> Contact Number
                      </h4>
                      <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1 w-full space-y-1">
                          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Phone Number</label>
                          <input 
                            type="tel" 
                            value={playerData.phone} 
                            onChange={(e) => setPlayerData({...playerData, phone: e.target.value})} 
                            placeholder="e.g. +91 98765 43210"
                            className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-primary outline-none transition-all shadow-sm" 
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveSettings({ phone: playerData.phone })}
                          className="w-full sm:w-auto px-4.5 min-h-[44px] bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm">save</span> Save
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* ---- Notification Settings ---- */}
                  <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                    <h3 className="font-headline-md text-base sm:text-lg font-bold uppercase flex items-center gap-2 text-on-background border-b border-outline-variant/30 pb-3 tracking-tight"><span className="material-symbols-outlined text-primary text-xl">notifications</span> Notification Settings</h3>
                    <div className="divide-y divide-outline-variant/20 pt-1">
                      {[
                        { id: 'matchReminders', label: 'Match Schedule Reminders', desc: 'Alert notifications 30 minutes before your registered squad match starts.' },
                        { id: 'prizePayouts', label: 'Prize Payout Notifications', desc: 'Instant notifications when tournament prize money is credited to your wallet.' },
                        { id: 'promotions', label: 'Platform Announcements', desc: 'Emails regarding platform updates, sponsored cups, and premium features.' }
                      ].map((pref) => (
                        <div key={pref.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                          <div className="space-y-0.5 min-w-0">
                            <h4 className="font-headline-md text-xs sm:text-sm font-semibold text-on-background truncate">{pref.label}</h4>
                            <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">{pref.desc}</p>
                          </div>
                          <div className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={playerData.notifications[pref.id]}
                            onClick={() => {
                              const updatedNotifications = {
                                ...playerData.notifications,
                                [pref.id]: !playerData.notifications[pref.id]
                              };
                              setPlayerData({
                                ...playerData,
                                notifications: updatedNotifications
                              });
                              triggerToast('Notification preferences updated!');
                            }}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${
                              playerData.notifications[pref.id] ? 'bg-primary shadow-[0_0_12px_rgba(90,93,250,0.35)]' : 'bg-surface-variant'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${
                                playerData.notifications[pref.id] ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    )}

      {/* Mobile Sticky Bottom Tab Navigation — hidden now that the horizontal bar shows on all screens */}
      {false && currentUser && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-low/95 backdrop-blur-2xl border-t border-outline-variant/30 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex">
            {[
              { id: 'overview', icon: 'dashboard' },
              { id: 'tournaments', icon: 'trophy' },
              { id: 'teams', icon: 'group' },
              { id: 'wallet', icon: 'account_balance_wallet' },
              { id: 'settings', icon: 'settings' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-all ${
                  activeTab === tab.id ? 'text-primary' : 'text-on-surface-variant'
                }`}
              >
                {activeTab === tab.id && (
                  <span className="absolute -top-px left-1/4 right-1/4 h-0.5 bg-primary rounded-full"></span>
                )}
                <span className={`material-symbols-outlined text-xl ${activeTab === tab.id ? 'font-variation-filled' : ''}`}
                  style={activeTab === tab.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                >{tab.icon}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">{tab.id === 'tournaments' ? 'Events' : tab.id === 'settings' ? 'Settings' : tab.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit Player Profile Modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="glass-card profile-edit-modal-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h3 className="font-headline-md text-lg font-bold text-on-background flex items-center gap-2 tracking-tight">
                  <span className="material-symbols-outlined text-primary text-xl">edit_square</span> Edit Profile
                </h3>
                <button onClick={() => setIsEditingProfile(false)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              <form onSubmit={handleSavePlayerModal} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Name</label>
                  <AbuseFieldWrapper fieldId="profile-playerName" value={playerEditForm.name} onWarning={setPlayerNameAbuse}>
                    <input type="text" value={playerEditForm.name} onChange={(e) => setPlayerEditForm({...playerEditForm, name: e.target.value})} className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" required />
                  </AbuseFieldWrapper>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 border-b border-outline-variant/30">
                  <div className="space-y-2 flex flex-col items-center">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block text-center">Avatar Profile Pic</label>
                    <div className="relative w-20 h-20 rounded-full p-[2px] bg-gradient-to-tr from-primary to-secondary shadow-[0_0_10px_rgba(90,93,250,0.2)] overflow-hidden border border-outline-variant bg-surface-container-low group flex items-center justify-center">
                      {uploadPreviewUrls.avatar || sanitizeImageUrl(playerEditForm.avatar) ? (
                        <img src={uploadPreviewUrls.avatar || sanitizeImageUrl(playerEditForm.avatar)} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant text-2xl">account_circle</span>
                      )}
                      {activeUploadField === 'avatar' && profileUploadProgress !== null && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 rounded-full">
                          <CircularUploadProgress progress={profileUploadProgress} />
                        </div>
                      )}
                      {!(activeUploadField === 'avatar' && profileUploadProgress !== null) && (
                        <label className="absolute inset-0 z-20 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200 rounded-full">
                          <span className="material-symbols-outlined text-white text-lg">cloud_upload</span>
                          <span className="text-[8px] text-white font-bold uppercase tracking-wider mt-0.5">Upload</span>
                          <input 
                            type="file" accept="image/*" className="hidden" disabled={isUploadingImage}
                            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleProfileImageSelect(file, 'avatar'); }} 
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 flex flex-col items-center">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block text-center">Banner Background</label>
                    <div className="relative w-full h-20 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low group flex items-center justify-center">
                      {uploadPreviewUrls.banner || sanitizeImageUrl(playerEditForm.banner) ? (
                        <img src={uploadPreviewUrls.banner || sanitizeImageUrl(playerEditForm.banner)} alt="Banner" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant text-2xl">image</span>
                      )}
                      {activeUploadField === 'banner' && profileUploadProgress !== null && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75">
                          <CircularUploadProgress progress={profileUploadProgress} />
                        </div>
                      )}
                      {!(activeUploadField === 'banner' && profileUploadProgress !== null) && (
                        <label className="absolute inset-0 z-20 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200">
                          <span className="material-symbols-outlined text-white text-lg">cloud_upload</span>
                          <span className="text-[8px] text-white font-bold uppercase tracking-wider mt-0.5">Upload</span>
                          <input 
                            type="file" accept="image/*" className="hidden" disabled={isUploadingImage}
                            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) performUpload(file, 'banner'); }} 
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">Short Bio</label>
                  <AbuseFieldWrapper fieldId="profile-playerBio" value={playerEditForm.bio} onWarning={setPlayerBioAbuse}>
                    <textarea 
                      rows="3" value={playerEditForm.bio} onChange={(e) => setPlayerEditForm({...playerEditForm, bio: e.target.value})} maxLength={120}
                      placeholder="Tell players what you compete in."
                      className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-background font-body-sm text-xs focus:border-primary outline-none transition-all shadow-sm resize-none" 
                    />
                  </AbuseFieldWrapper>
                  <div className="text-right text-[10px] text-on-surface-variant mt-1">
                    {playerEditForm.bio?.length || 0} / 120
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="px-5 py-2 border border-outline hover:bg-surface-variant text-on-background rounded-lg font-headline-md text-xs font-semibold transition-all">Cancel</button>
                  <button type="submit" disabled={isUploadingImage} className="px-5 py-2 bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-headline-md text-xs font-bold shadow-sm flex items-center gap-1 disabled:opacity-60"><span className="material-symbols-outlined text-sm">check</span> Save</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Organizer Modal */}
      <AnimatePresence>
        {isEditingOrg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="glass-card profile-edit-modal-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
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
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 border-b border-outline-variant/30">
                  <div className="space-y-2 flex flex-col items-center">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block text-center">Organization Logo</label>
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low group flex items-center justify-center p-1 bg-surface-container-highest">
                      {uploadPreviewUrls.orgLogo || sanitizeImageUrl(orgEditForm.logo) ? (
                        <img src={uploadPreviewUrls.orgLogo || sanitizeImageUrl(orgEditForm.logo)} alt="Logo Preview" className="w-full h-full object-contain" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant text-2xl">business</span>
                      )}
                      {activeUploadField === 'orgLogo' && profileUploadProgress !== null && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75">
                          <CircularUploadProgress progress={profileUploadProgress} />
                        </div>
                      )}
                      {!(activeUploadField === 'orgLogo' && profileUploadProgress !== null) && (
                        <label className="absolute inset-0 z-20 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200">
                          <span className="material-symbols-outlined text-white text-lg">cloud_upload</span>
                          <span className="text-[9px] text-white font-bold uppercase tracking-wider mt-0.5">Upload</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            disabled={isUploadingImage}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) {
                                handleProfileImageSelect(file, 'orgLogo');
                              }
                            }} 
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 flex flex-col items-center">
                    <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block text-center">Org Banner Background</label>
                    <div className="relative w-full h-20 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low group flex items-center justify-center">
                      {uploadPreviewUrls.orgBanner || sanitizeImageUrl(orgEditForm.banner) ? (
                        <img src={uploadPreviewUrls.orgBanner || sanitizeImageUrl(orgEditForm.banner)} alt="Banner Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant text-2xl">image</span>
                      )}
                      {activeUploadField === 'orgBanner' && profileUploadProgress !== null && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-2 text-center">
                          <CircularUploadProgress progress={profileUploadProgress} />
                        </div>
                      )}
                      {!(activeUploadField === 'orgBanner' && profileUploadProgress !== null) && (
                        <label className="absolute inset-0 z-20 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200">
                          <span className="material-symbols-outlined text-white text-lg">cloud_upload</span>
                          <span className="text-[9px] text-white font-bold uppercase tracking-wider mt-0.5">Upload</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            disabled={isUploadingImage}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) {
                                performUpload(file, 'orgBanner');
                              }
                            }} 
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

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
                  <button type="button" onClick={() => setIsEditingOrg(false)} className="px-5 py-2 border border-outline hover:bg-surface-variant transition-all text-on-background rounded-lg font-headline-md text-xs font-semibold">Cancel</button>
                  <button type="submit" disabled={isUploadingImage} className="px-5 py-2 bg-secondary hover:bg-secondary/90 active:scale-95 transition-all text-background rounded-lg font-headline-md text-xs font-bold shadow-sm flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"><span className="material-symbols-outlined text-sm">check</span> Save Changes</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">© 2024 MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>

      {/* Crop Modal */}
      <AnimatePresence>
        {cropState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="glass-card profile-edit-modal-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 relative"
            >
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h3 className="font-headline-md text-lg font-bold text-on-background flex items-center gap-2 tracking-tight">
                  <span className="material-symbols-outlined text-primary text-xl">crop</span> Crop Profile Picture
                </h3>
                <button onClick={() => setCropState(null)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div 
                  className="relative w-full max-w-[280px] aspect-square bg-black border border-outline-variant rounded-xl overflow-hidden cursor-move select-none"
                  onMouseDown={handleCropMouseDown}
                  onTouchStart={handleCropTouchStart}
                >
                  <img
                    src={cropState.src}
                    alt="To Crop"
                    className="absolute pointer-events-none origin-center"
                    style={{
                      transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                      left: '50%',
                      top: '50%',
                      marginLeft: `-${cropState.width / 2}px`,
                      marginTop: `-${cropState.height / 2}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }}
                    ref={cropImgRef}
                  />
                  <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none flex items-center justify-center">
                    <div className="w-[200px] h-[200px] rounded-full border border-dashed border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
                  </div>
                </div>

                <div className="w-full space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>Zoom</span>
                    <span>{Math.round(cropZoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default Profile
