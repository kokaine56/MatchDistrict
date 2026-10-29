import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '../components/Header.jsx';
import { hasOrganizerRights } from '../utils/iamRoles.js';
import OrganizerDashboard from '../components/OrganizerDashboard.jsx';
import { DEFAULT_AVATAR, DEFAULT_BANNER } from '../utils/defaults.js';
import { useUser } from '../UserContext.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';

function OrganizationManagement({ onNavigate }) {
  const { currentUser, setCurrentUser } = useUser();
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
    kycStatus: '',
    staff: []
  });

  const [orgEditForm, setOrgEditForm] = useState({ ...orgData });
  const [tournamentsList, setTournamentsList] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState('');
  const [organizationVerified, setOrganizationVerified] = useState(false);
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

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
      kycStatus: '',
      motto: currentUser.orgMotto || '',
      staff: [{ name: currentUser.name || 'Admin', role: 'Owner / Head Admin', email: currentUser.email }]
    });

  }, [currentUser]);

  // Fetch the authenticated organiser's tournaments once per account.
  useEffect(() => {
    if (!currentUser?.id) {
      setTournamentsLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchTournaments() {
      setTournamentsLoading(true);
      setTournamentsError('');
      setOrganizationVerified(false);
      try {
        const token = await getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch('/api/organiser/tournaments', { headers });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.tournaments)) throw new Error(data.message || data.error || 'Could not load tournaments.');
        if (!cancelled) {
          setTournamentsList(data.tournaments);
          setOrganizationVerified(data.verifiedOrganizer === true);
        }
      } catch (err) {
        console.error("Failed to fetch tournaments:", err);
        if (!cancelled) setTournamentsError(err.message || 'Could not load tournaments.');
      } finally {
        if (!cancelled) setTournamentsLoading(false);
      }
    }
    fetchTournaments();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

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
    setQuickActionsOpen(open => !open);
  }, []);

  const renderMenuItems = () => (
    <div className="p-2 bg-surface">
      <button onClick={(e) => { e.stopPropagation(); handleOpenCreateNew(); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-on-background hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-on-surface-variant shrink-0">add_circle</span> Create Tournament
      </button>
      <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(window.location.origin + '/org/' + orgData.handle?.replace(/^@/, '')); triggerToast('Hub link copied successfully'); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-on-background hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-on-surface-variant shrink-0">link</span> Copy Hub Link
      </button>
      <div className="h-px bg-outline-variant/40 mx-4 my-1" />
      <button onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('subscription'); setQuickActionsOpen(false); }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-on-background hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-on-surface-variant shrink-0">workspace_premium</span> Subscription
      </button>
    </div>
  );

  // Compute stats details dynamically
  const stats = useMemo(() => {
    const hosted = tournamentsList.length;
    const active = tournamentsList.filter(t => String(t.status || '').toLowerCase() === 'live').length;
    const rosters = tournamentsList.reduce((sum, t) => sum + (Number(t.slotsFilled) || 0), 0);
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
      <Header activePage="org-management" onNavigate={onNavigate} />

      <main className="w-full max-w-container-max mx-auto px-4 pt-20 pb-8 sm:pt-28 sm:pb-12 space-y-6 sm:space-y-8 relative z-10">
        
        <section className="rounded-2xl border border-outline-variant/40 bg-surface p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-on-background truncate">{orgData.name}</h1>
                {organizationVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <span className="material-symbols-outlined text-sm">verified</span> Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">Tournament organiser dashboard</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <button onClick={() => onNavigate && onNavigate('profile')} className="min-h-11 rounded-lg border border-outline-variant px-4 text-sm font-semibold text-on-background hover:bg-surface-variant">Return to Profile</button>
              <button onClick={handleOpenCreateNew} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:brightness-95">Create Tournament</button>
              <button onClick={handleToggleQuickActions} className="min-h-11 rounded-lg border border-outline-variant px-4 text-sm font-semibold text-on-background hover:bg-surface-variant" aria-expanded={quickActionsOpen}>More actions</button>
            </div>
          </div>
          {quickActionsOpen && <div className="mt-3 rounded-lg border border-outline-variant bg-surface">{renderMenuItems()}</div>}
        </section>

        {/* Premium Stats Grid Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'EVENTS HOSTED', value: tournamentsLoading ? 'Loading…' : tournamentsError ? 'Unavailable' : `${stats.hosted} Hosted`, icon: 'sports_esports', color: 'text-primary bg-primary/10 border-primary/20' },
            { label: 'ACTIVE EVENTS', value: tournamentsLoading ? 'Loading…' : tournamentsError ? 'Unavailable' : `${stats.active} Live`, icon: 'sensors', color: 'text-secondary bg-secondary/10 border-secondary/20' },
            { label: 'PARTICIPANTS', value: tournamentsLoading ? 'Loading…' : tournamentsError ? 'Unavailable' : `${stats.rosters} Rosters`, icon: 'groups', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { label: 'ACCOUNT TIER', value: `${stats.tier} Plan`, icon: 'workspace_premium', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
          ].map((item, index) => (
            <div 
              key={index} 
              className="rounded-xl border border-outline-variant/40 bg-surface p-3 sm:p-4 flex items-center gap-3 shadow-sm"
            >
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

        {/* Dashboard component */}
        <OrganizerDashboard
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          tournamentsList={tournamentsList}
          setTournamentsList={setTournamentsList}
          tournamentsLoading={tournamentsLoading}
          tournamentsError={tournamentsError}
          organizationVerified={organizationVerified}
          triggerToast={triggerToast}
          handleOpenCreateNew={handleOpenCreateNew}
          handleEditDetails={handleEditDetails}
          orgData={orgData}
          setOrgData={setOrgData}
          handleSaveOrgSettingsTab={handleSaveOrgSettingsTab}
        />

      </main>

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
