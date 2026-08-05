import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import { hasOrganizerRights } from '../utils/iamRoles.js';
import OrganizerDashboard from '../components/OrganizerDashboard.jsx';
import SafeImage from '../components/SafeImage.jsx';
import { DEFAULT_AVATAR, DEFAULT_BANNER } from '../utils/defaults.js';
import { useUser } from '../UserContext.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';
import VerificationBadge from '../components/VerificationBadge';

const statsContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const statsCardVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24
    }
  }
};

function OrganizationManagement({ onNavigate }) {
  const { currentUser, setCurrentUser } = useUser();
  const [activeTab, setActiveTab] = useState('overview');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Org details data
  const [orgData, setOrgData] = useState({
    name: '',
    handle: '',
    email: '',
    phone: '',
    bio: '',
    tier: 'Free',
    logo: DEFAULT_AVATAR,
    banner: DEFAULT_BANNER,
    website: '',
    discord: '',
    twitter: '',
    kycStatus: 'Verified',
    staff: []
  });

  const [orgEditForm, setOrgEditForm] = useState({ ...orgData });
  const [tournamentsList, setTournamentsList] = useState([]);
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const quickButtonRef = useRef(null);
  const [openUp, setOpenUp] = useState(false);
  const [desktopDropdownPos, setDesktopDropdownPos] = useState({ top: 0, left: 0 });

  const [orgnameCooldownDays, setOrgnameCooldownDays] = useState(0);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 4000);
  };

  // Restrict access on mount
  useEffect(() => {
    if (!currentUser || !hasOrganizerRights(currentUser)) {
      onNavigate && onNavigate('profile');
    }
  }, [currentUser, onNavigate]);

  // Load initial settings and tournaments
  useEffect(() => {
    if (!currentUser) return;
    
    // Parse social links if present
    let parsedSocial = {};
    try {
      if (currentUser.socialLinks) {
        parsedSocial = typeof currentUser.socialLinks === 'string' ? JSON.parse(currentUser.socialLinks) : currentUser.socialLinks;
      }
    } catch (e) {
      console.log("Could not parse socialLinks", e);
    }

    setOrgData({
      name: currentUser.orgName || 'Organizer',
      handle: currentUser.orgHandle || '@' + (currentUser.orgName || 'organizer').toLowerCase().replace(/\s+/g, '_'),
      email: currentUser.email,
      phone: currentUser.phone || '',
      bio: currentUser.orgBio || currentUser.experience || currentUser.bio || '',
      tier: currentUser.tier || 'Free',
      logo: currentUser.orgImage || DEFAULT_AVATAR,
      banner: currentUser.orgBanner || currentUser.banner || DEFAULT_BANNER,
      website: parsedSocial.website || '',
      discord: parsedSocial.discord || '',
      twitter: parsedSocial.twitter || '',
      kycStatus: 'Verified',
      motto: currentUser.orgMotto || '',
      staff: [{ name: currentUser.name || 'Admin', role: 'Owner / Head Admin', email: currentUser.email }]
    });

    // Fetch tournaments
    async function fetchTournaments() {
      try {
        const token = await getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch('/api/organiser/tournaments', { headers });
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.tournaments)) {
          // Filter to only this organizer's tournaments
          const filtered = data.tournaments.filter(t => t.orgId === currentUser.id);
          setTournamentsList(filtered);
        }
      } catch (err) {
        console.error("Failed to fetch tournaments:", err);
      }
    }
    fetchTournaments();
  }, [currentUser]);

  // Track Name Change Cooldown (30 Days)
  useEffect(() => {
    if (!currentUser || !currentUser.orgname_last_changed) {
      setOrgnameCooldownDays(0);
      return;
    }
    const lastChanged = new Date(currentUser.orgname_last_changed);
    const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
    setOrgnameCooldownDays(daysDiff < 30 ? Math.ceil(30 - daysDiff) : 0);
  }, [currentUser]);

  // Escape key closes Quick Actions dropdown
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setQuickActionsOpen(false) }
    if (quickActionsOpen) { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey) }
  }, [quickActionsOpen]);

  const handleToggleQuickActions = useCallback(() => {
    if (quickActionsOpen) { setQuickActionsOpen(false); return }
    if (quickButtonRef.current) {
      const btnRect = quickButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const up = spaceBelow < 280 && btnRect.top > spaceBelow;
      setOpenUp(up);
      if (window.innerWidth >= 640) {
        const dropdownH = 176;
        setDesktopDropdownPos({
          top: up ? btnRect.top - dropdownH - 6 : btnRect.bottom + 6,
          left: Math.max(8, Math.min(btnRect.left, window.innerWidth - 260)),
        });
      }
    }
    setQuickActionsOpen(true);
  }, [quickActionsOpen]);

  useEffect(() => {
    if (!quickActionsOpen || window.innerWidth < 640) return;
    const updatePos = () => {
      if (!quickButtonRef.current) return;
      const btnRect = quickButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const up = spaceBelow < 280 && btnRect.top > spaceBelow;
      const dropdownH = 176;
      setDesktopDropdownPos({
        top: up ? btnRect.top - dropdownH - 6 : btnRect.bottom + 6,
        left: Math.max(8, Math.min(btnRect.left, window.innerWidth - 260)),
      });
      setOpenUp(up);
    };
    window.addEventListener('scroll', updatePos, { passive: true, capture: true });
    window.addEventListener('resize', updatePos, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePos, { capture: true });
      window.removeEventListener('resize', updatePos);
    };
  }, [quickActionsOpen]);

  const renderMenuItems = () => (
    <div className="p-2">
      <button onClick={(e) => { e.stopPropagation(); handleOpenCreateNew(); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 hover:bg-[#F0F3FF] transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">add_circle</span> Create Tournament
      </button>
      <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(window.location.origin + '/org/' + orgData.handle?.replace(/^@/, '')); triggerToast('Hub link copied successfully'); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 hover:bg-[#F0F3FF] transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">link</span> Copy Hub Link
      </button>
      <div className="h-px bg-gray-100 mx-4 my-1" />
      <button onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('subscription'); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 hover:bg-[#F0F3FF] transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">workspace_premium</span> Subscription
      </button>
    </div>
  );

  // Compute stats details dynamically
  const stats = useMemo(() => {
    const hosted = tournamentsList.length;
    const active = tournamentsList.filter(t => t.status === 'live').length;
    const rosters = tournamentsList.reduce((sum, t) => sum + (t.slotsFilled || 0), 0);
    return {
      hosted,
      active,
      rosters,
      tier: orgData.tier || 'Free'
    };
  }, [tournamentsList, orgData.tier]);

  if (!currentUser || !hasOrganizerRights(currentUser)) {
    return null;
  }

  const handleOpenCreateNew = () => {
    onNavigate && onNavigate('create-tournament');
  };

  const handleEditDetails = () => {
    setOrgEditForm({ ...orgData });
    setIsEditingOrg(true);
  };

  const handleSaveOrgSettingsTab = async (e) => {
    e.preventDefault();

    // Check client-side cooldown for organization name
    if (orgnameCooldownDays > 0 && orgData.name !== currentUser.orgName) {
      triggerToast(`You can only change your organization name once every 30 days. Remaining: ${orgnameCooldownDays} days.`);
      return;
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
          orgName: orgData.name,
          orgMotto: orgData.motto,
          orgImage: orgData.logo,
          orgBanner: orgData.banner,
          orgBio: orgData.bio
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        triggerToast('Organization profile settings saved successfully!');
      } else {
        triggerToast(data.error || 'Failed to save settings.');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Error saving settings.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      {/* Background Glowing Rings */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-primary/10 blur-[90px] sm:blur-[140px] rounded-full animate-pulse duration-[12s]"></div>
      </div>

      <Header activePage="org-management" onNavigate={onNavigate} />

      <main className="w-full max-w-container-max mx-auto px-4 pt-20 pb-8 sm:pt-28 sm:pb-12 space-y-6 sm:space-y-8 relative z-10">
        
        {/* Compact Organizer Header Hero Card */}
        <div className="glass-card rounded-[20px] sm:rounded-[24px] border border-outline-variant/35 shadow-2xl bg-surface/60 backdrop-blur-xl relative overflow-hidden">
          
          {/* Cover Banner — clean edge to edge, no overlays */}
          <div className="h-[180px] sm:h-[240px] lg:h-[280px] w-full relative overflow-hidden bg-slate-950">
            <img src={orgData.banner} alt="Organization Cover" className="w-full h-full object-cover object-center" />
          </div>

          {/* Logo — overlaps banner edge 50/50 */}
          <div className="flex justify-center sm:justify-start px-4 sm:px-6 relative z-10 -mt-10 sm:-mt-12 lg:-mt-14">
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl p-[3px] bg-gradient-to-tr from-primary via-primary/50 to-secondary shadow-lg transition-transform duration-300 hover:scale-[1.02] cursor-pointer">
              <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-surface bg-surface">
                <SafeImage src={orgData.logo} alt={orgData.name} className="avatar-img rounded-xl" />
              </div>
            </div>
          </div>

          {/* Content section */}
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 sm:pt-4 relative z-10">
            
            {/* Top row: Info + Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0 text-center sm:text-left">
                {/* Organization Name + Subscription Tick */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="font-headline-lg text-lg sm:text-xl md:text-2xl font-black text-on-background tracking-tight">{orgData.name}</h1>
                  <VerificationBadge tier={orgData.tier} size="md" />
                </div>

                {/* Username + Email */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 mt-1 text-on-surface-variant font-body-sm text-[11px] sm:text-xs">
                  <span className="inline-flex items-center gap-0.5 text-primary font-bold">
                    <span className="material-symbols-outlined text-xs">alternate_email</span>
                    {orgData.handle?.replace(/^@/, '')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-on-surface-variant/70">mail</span>
                    {orgData.email}
                  </span>
                </div>

                {/* Verified Status */}
                <div className="flex items-center justify-center sm:justify-start mt-2">
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[11px] sm:text-xs">
                    <span className="material-symbols-outlined text-xs">verified_user</span>
                    {orgData.kycStatus}
                  </span>
                </div>
              </div>

              {/* Desktop buttons — right side */}
              <div className="hidden sm:flex flex-row items-center gap-3 shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate && onNavigate('profile')}
                className="min-h-[48px] w-[240px] px-5 rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">person</span> Return to Profile
              </motion.button>
              <motion.button
                ref={quickButtonRef}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleToggleQuickActions}
                className="min-h-[48px] w-[240px] px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span className="material-symbols-outlined text-sm">bolt</span> Quick Actions
                <span className="material-symbols-outlined text-sm ml-0.5">expand_more</span>
              </motion.button>
            </div>
            </div>

            {/* Organization description */}
            <p className="mt-4 font-body-sm text-[11px] sm:text-xs text-on-surface-variant/90 max-w-[700px] mx-auto sm:mx-0 leading-relaxed text-center sm:text-left">
              {orgData.bio || 'Accredited Match District Tournament Organizer. Building high-tier competitive arenas.'}
            </p>

            {/* Mobile buttons — stacked, full width */}
            <div className="flex sm:hidden flex-col gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate && onNavigate('profile')}
                className="min-h-[48px] w-full px-5 rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">person</span> Return to Profile
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleToggleQuickActions}
                className="min-h-[48px] w-full px-5 rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span className="material-symbols-outlined text-sm">bolt</span> Quick Actions
                <span className="material-symbols-outlined text-sm ml-0.5">expand_more</span>
              </motion.button>
              {/* Mobile inline dropdown — normal flow, pushes content down */}
              <AnimatePresence>
                {quickActionsOpen && (
                  <motion.div
                    key="mobile-dropdown"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="rounded-[14px] border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden"
                  >
                    {renderMenuItems()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Premium Stats Grid Row */}
        <motion.div 
          variants={statsContainerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { label: 'EVENTS HOSTED', value: `${stats.hosted} Hosted`, icon: 'sports_esports', color: 'text-primary bg-primary/10 border-primary/20' },
            { label: 'ACTIVE EVENTS', value: `${stats.active} Live`, icon: 'sensors', color: 'text-secondary bg-secondary/10 border-secondary/20' },
            { label: 'PARTICIPANTS', value: `${stats.rosters} Rosters`, icon: 'groups', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { label: 'ACCOUNT TIER', value: `${stats.tier} Plan`, icon: 'workspace_premium', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
          ].map((item, index) => (
            <motion.div 
              key={index} 
              variants={statsCardVariants}
              whileHover={{ y: -3, scale: 1.02 }} 
              whileTap={{ scale: 0.98 }}
              className="glass-card p-3 sm:p-4 rounded-xl border border-outline-variant/30 bg-surface/40 flex items-center gap-3 group hover:border-primary/25 transition-all shadow-sm cursor-pointer"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${item.color} shrink-0`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[8px] font-bold tracking-wider text-on-surface-variant uppercase block">{item.label}</span>
                <span className="text-[11px] sm:text-xs font-black text-on-background block truncate">{item.value}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Dashboard component */}
        <OrganizerDashboard
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          tournamentsList={tournamentsList}
          setTournamentsList={setTournamentsList}
          triggerToast={triggerToast}
          handleOpenCreateNew={handleOpenCreateNew}
          handleEditDetails={handleEditDetails}
          orgData={orgData}
          setOrgData={setOrgData}
          handleSaveOrgSettingsTab={handleSaveOrgSettingsTab}
        />

      </main>

      {/* Quick Actions backdrop — fixed overlay outside main to catch clicks */}
      {window.innerWidth >= 640 && quickActionsOpen && (
        <div className="fixed inset-0 z-[99998]" onClick={() => setQuickActionsOpen(false)} />
      )}

      {/* Desktop portal dropdown — fixed at viewport coordinates, escapes card stacking context */}
      {window.innerWidth >= 640 && quickActionsOpen && createPortal(
        <AnimatePresence>
          <motion.div
            key="desktop-portal-dropdown"
            initial={{ opacity: 0, y: openUp ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 4 : -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: desktopDropdownPos.top,
              left: desktopDropdownPos.left,
              width: 240,
              zIndex: 99999,
              transformOrigin: openUp ? 'bottom' : 'top',
            }}
            className="rounded-[14px] border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden"
          >
            {renderMenuItems()}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Sleek Toast Alerts */}
      {showToast && (
        <div className="fixed bottom-5 right-5 z-[99999] px-4 py-3 bg-surface-container-highest text-on-background text-xs font-bold rounded-xl border border-outline-variant/50 shadow-2xl animate-in slide-in-from-bottom duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default OrganizationManagement;
