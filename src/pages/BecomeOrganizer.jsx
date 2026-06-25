import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx';
import { useUser } from '../UserContext.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';
import { uploadImage } from '../utils/cloudinaryUpload.js';

const countriesList = ["India", "United States", "United Kingdom", "Other"];

const locationData = {
  "India": {
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Navi Mumbai", "Aurangabad", "Solapur"],
    "Karnataka": ["Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum", "Dharwad", "Kalaburagi"],
    "Delhi": ["New Delhi", "Dwarka", "Rohini", "Vasant Kunj", "Saket", "Janakpuri", "Connaught Place"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Trichy", "Tiruppur", "Vellore"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam"],
    "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Siliguri", "Asansol", "Durgapur"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Ghaziabad", "Agra", "Varanasi", "Meerut"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar"],
    "Other State": ["Other City"]
  },
  "United States": {
    "California": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Oakland"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse", "Yonkers"],
    "Texas": ["Houston", "Austin", "Dallas", "San Antonio", "Fort Worth", "El Paso"],
    "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee", "Fort Lauderdale"],
    "Other State": ["Other City"]
  },
  "United Kingdom": {
    "England": ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Newcastle"],
    "Scotland": ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"],
    "Wales": ["Cardiff", "Swansea", "Newport", "Bangor"],
    "Other State": ["Other City"]
  },
  "Other": {
    "Other State": ["Other City"]
  }
};

const STEPS = [
  { id: 1, title: 'Personal Verification', subtitle: 'Verify your identity', icon: 'verified_user' },
  { id: 2, title: 'Organization', subtitle: 'Create your esports org', icon: 'workspaces' },
  { id: 3, title: 'Experience', subtitle: 'Your organizer journey', icon: 'trending_up' },
  { id: 4, title: 'Operations', subtitle: 'Tournament plans', icon: 'sports_esports' },
  { id: 5, title: 'Trust & Safety', subtitle: 'Commit to fair play', icon: 'shield' },
  { id: 6, title: 'Review', subtitle: 'Final review & submit', icon: 'task_alt' },
];

const ageGroups = ['Under 18', '18–24', '25–34', '35+'];
const idTypes = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Other'];
const tournamentsOrg = ['None', '1–5', '6–10', '11–25', '26–50', '50+'];
const expLevels = ['First Time Organizer', 'Beginner', 'Intermediate', 'Experienced', 'Professional'];
const monthlyTourneys = ['1', '2–3', '4–5', '6–10', '10+'];
const hearAbout = ['Google Search', 'Instagram', 'Facebook', 'YouTube', 'Discord', 'Friend Recommendation', 'Tournament Organizer', 'Gaming Community', 'Influencer / Creator', 'Advertisement', 'Other'];
const adSources = ['Instagram Ad', 'Facebook Ad', 'Google Ad', 'YouTube Ad', 'Other'];
const gameOptions = ['BGMI', 'Valorant', 'CS2', 'Free Fire Max', 'Call of Duty Mobile', 'PUBG PC', 'Dota 2', 'League of Legends', 'Apex Legends', 'EA FC', 'Rocket League', 'Other'];
const formatOptions = ['Solo', 'Duo', 'Squad', '5v5', 'Custom'];
const participantRanges = ['Under 50', '50–100', '100–250', '250–500', '500+'];
const prizeRanges = ['No Prize Pool', 'Under ₹5,000', '₹5,000–₹25,000', '₹25,000–₹1 Lakh', '₹1 Lakh+'];

const STORAGE_KEY = 'md_org_onboarding';

function BecomeOrganizer({ onNavigate }) {
  const { currentUser } = useUser();
  const [allApps, setAllApps] = useState([]);
  const [activeFaq, setActiveFaq] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);

  const [applicantNameAbuse, setApplicantNameAbuse] = useState(false);
  const [orgNameAbuse, setOrgNameAbuse] = useState(false);
  const [orgMottoAbuse, setOrgMottoAbuse] = useState(false);
  const [orgDescAbuse, setOrgDescAbuse] = useState(false);

  const [cropImageSrc, setCropImageSrc] = useState('');
  const [cropImageName, setCropImageName] = useState('');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [kycFileInfo, setKycFileInfo] = useState({ size: 0, isValid: true, sizeText: '' });
  const [isUploadingKyc, setIsUploadingKyc] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const formInit = {
    applicantName: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: '',
    country: '',
    state: '',
    city: '',
    ageGroup: '',
    idType: '',
    kycImage: '',
    kycName: '',
    orgName: '',
    orgLogo: '',
    orgLogoName: '',
    orgBanner: '',
    orgBannerName: '',
    orgTagline: '',
    orgDescription: '',
    website: '',
    discord: '',
    instagram: '',
    youtube: '',
    twitter: '',
    tournamentsOrganized: '',
    hostingLevel: '',
    tournamentsPerMonth: '',
    heardFrom: '',
    adSource: '',
    games: [],
    formats: [],
    expectedParticipants: '',
    prizePool: '',
    policies: {
      fairPlay: false,
      antiCheat: false,
      refund: false,
      prizeDist: false,
      terms: false,
    }
  };

  const [form, setForm] = useState(formInit);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.currentStep) {
          setResumeAvailable(true);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (currentUser?.email && !form.email) {
      setForm(prev => ({ ...prev, email: currentUser.email }));
    }
    if (currentUser?.name && !form.applicantName) {
      setForm(prev => ({ ...prev, applicantName: currentUser.name }));
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'organiser') {
      onNavigate && onNavigate('profile');
    }
  }, [currentUser, onNavigate]);

  useEffect(() => {
    async function fetchOrgApps() {
      const token = await getAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch('/api/org/applications', { headers })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.applications) setAllApps(data.applications);
        })
        .catch(() => {});
    }
    fetchOrgApps();
  }, []);

  const autoSave = useCallback(() => {
    const payload = { ...form, currentStep };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [form, currentStep]);

  useEffect(() => {
    const timer = setTimeout(autoSave, 800);
    return () => clearTimeout(timer);
  }, [autoSave]);

  const resumeDraft = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { currentStep: step, ...rest } = parsed;
        setForm(prev => ({ ...prev, ...rest }));
        setCurrentStep(step);
        setResumeAvailable(false);
      } catch {}
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    setForm(formInit);
    setCurrentStep(1);
    setResumeAvailable(false);
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updatePolicy = (key) => {
    setForm(prev => ({ ...prev, policies: { ...prev.policies, [key]: !prev.policies[key] } }));
  };

  const toggleArrayItem = (key, item) => {
    setForm(prev => {
      const arr = prev[key] || [];
      const next = arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
      return { ...prev, [key]: next };
    });
  };

  const validateStep = (step) => {
    const errors = [];
    if (step === 1) {
      if (!form.applicantName.trim()) errors.push('Full name is required');
      if (!form.phone.trim() || form.phone.length !== 10) errors.push('Valid 10-digit phone number required');
      if (!form.country) errors.push('Country is required');
      if (!form.state) errors.push('State is required');
      if (!form.city) errors.push('City is required');
      if (!form.ageGroup) errors.push('Age group is required');
      if (!form.idType) errors.push('ID type is required');
    }
    if (step === 2) {
      if (!form.orgName.trim()) errors.push('Organization name is required');
    }
    if (step === 5) {
      const p = form.policies;
      if (!p.fairPlay) errors.push('Please accept the Fair Play Policy');
      if (!p.antiCheat) errors.push('Please accept the Anti-Cheating Rules');
      if (!p.refund) errors.push('Please accept the Refund Policy');
      if (!p.prizeDist) errors.push('Please accept the Prize Distribution Policy');
      if (!p.terms) errors.push('Please accept Match District Terms & Conditions');
    }
    return errors;
  };

  const canProceed = (step) => {
    return validateStep(step).length === 0;
  };

  const handleNext = () => {
    if (!canProceed(currentStep)) {
      const errs = validateStep(currentStep);
      alert(errs.join('\n'));
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const jumpToStep = (step) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(step);
  };

  const getTrustScore = () => {
    let score = 0;
    if (form.applicantName) score += 5;
    if (form.phone) score += 5;
    if (form.country && form.state && form.city) score += 10;
    if (form.ageGroup) score += 5;
    if (form.idType && form.kycImage) score += 10;
    if (form.orgName) score += 10;
    if (form.orgLogo) score += 5;
    if (form.orgTagline) score += 5;
    if (form.tournamentsOrganized) score += 5;
    if (form.hostingLevel) score += 5;
    if (form.tournamentsPerMonth) score += 5;
    if (form.games.length > 0) score += 10;
    if (form.formats.length > 0) score += 5;
    if (form.expectedParticipants) score += 5;
    if (form.prizePool) score += 5;
    const policyCount = Object.values(form.policies).filter(Boolean).length;
    score += policyCount * 2;
    return Math.min(score, 100);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (applicantNameAbuse || orgNameAbuse || orgMottoAbuse || orgDescAbuse) {
      alert('Cannot submit: one or more fields contain inappropriate words.');
      setSubmitting(false);
      return;
    }

    const policyKeys = ['fairPlay', 'antiCheat', 'refund', 'prizeDist', 'terms'];
    const allChecked = policyKeys.every(k => form.policies[k]);
    if (!allChecked) {
      alert('Please accept all policies to submit your application.');
      setSubmitting(false);
      return;
    }

    const experienceStr = [
      `Tournaments Organized: ${form.tournamentsOrganized || 'N/A'}`,
      `Hosting Level: ${form.hostingLevel || 'N/A'}`,
      `Monthly Tournaments: ${form.tournamentsPerMonth || 'N/A'}`,
      `Heard From: ${form.heardFrom || 'N/A'}${form.adSource ? ` (Ad: ${form.adSource})` : ''}`,
      `Age Group: ${form.ageGroup || 'N/A'}`,
      `ID: ${form.idType || 'N/A'}`,
    ].join(' | ');

    const newReq = {
      applicantName: form.applicantName,
      orgName: form.orgName,
      email: form.email,
      phone: form.phone,
      cityRegion: `Country: ${form.country} | State: ${form.state} | City: ${form.city}`,
      games: form.games.length > 0 ? form.games : ['All Games'],
      experience: experienceStr,
      orgImage: form.orgLogo,
      socialLinks: JSON.stringify({
        website: form.website,
        discord: form.discord,
        instagram: form.instagram,
        youtube: form.youtube,
        twitter: form.twitter,
      }),
      discordLink: form.discord || 'N/A',
      additionalNotes: `Tagline: ${form.orgTagline} | Description: ${form.orgDescription} | Formats: ${(form.formats || []).join(', ')} | Participants: ${form.expectedParticipants || 'N/A'} | Prize: ${form.prizePool || 'N/A'}`,
      kycDoc: `Doc Type: ${form.idType || 'N/A'} | File: ${form.kycImage || 'N/A'}`,
      portfolio: form.orgBanner || '',
      selectedPlan: 'Free',
    };

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/org/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify(newReq),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAllApps(prev => [...prev, data.application]);
        setSubmitted(true);
        localStorage.removeItem(STORAGE_KEY);
        if (currentUser) {
          currentUser.orgApplicationStatus = 'pending';
        }
      } else {
        alert(data.error || 'Failed to submit application.');
      }
    } catch (err) {
      alert('Server error. Please check your connection.');
    }
    setSubmitting(false);
  };

  const statesList = form.country ? Object.keys(locationData[form.country] || {}) : [];
  const citiesList = (form.country && form.state) ? (locationData[form.country][form.state] || []) : [];
  const filteredCities = citiesList.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));

  const userApps = allApps.filter(app => app.email === currentUser?.email);
  const latestApp = userApps[userApps.length - 1];
  const isApproved = currentUser?.role === 'organiser' || latestApp?.status === 'approved';
  const isPending = !isApproved && (currentUser?.orgApplicationStatus === 'pending' || latestApp?.status === 'pending');

  let isRejected = false;
  let daysLeft = 0;
  if (!isApproved && !isPending && (currentUser?.orgApplicationStatus === 'rejected' || latestApp?.status === 'rejected')) {
    const rejTime = latestApp?.reviewed_at ? new Date(latestApp.reviewed_at).getTime() : Date.now();
    const daysPassed = (Date.now() - rejTime) / (1000 * 60 * 60 * 24);
    if (daysPassed < 7) {
      isRejected = true;
      daysLeft = Math.ceil(7 - daysPassed);
    }
  }

  const orgImageInputRef = useRef(null);
  const kycInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const handleLogoUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Logo must be under 5MB.'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result);
      setCropImageName(file.name);
      setZoomPercent(100);
      setOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Banner must be under 10MB.'); return; }
    setIsUploadingBanner(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        updateForm('orgBanner', url);
        updateForm('orgBannerName', file.name);
      }
    } catch {}
    setIsUploadingBanner(false);
  };

  const handleKycUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) { alert('Please upload a valid document format (PDF, JPG, PNG).'); return; }
    const sizeMB = file.size / (1024 * 1024);
    const isValid = file.size <= 5 * 1024 * 1024;
    setKycFileInfo({ size: file.size, isValid, sizeText: sizeMB.toFixed(2) + ' MB' });
    if (!isValid) return;
    setIsUploadingKyc(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        updateForm('kycImage', url);
        updateForm('kycName', file.name);
      }
    } catch {}
    setIsUploadingKyc(false);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
    }
  };
  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
  };

  const handleCropConfirm = () => {
    const img = new Image();
    img.src = cropImageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const containerSize = 256;
      const imgRatio = img.width / img.height;
      let renderW = containerSize, renderH = containerSize;
      if (imgRatio > 1) renderW = containerSize * imgRatio;
      else renderH = containerSize / imgRatio;
      const effZoom = zoomPercent / 100
      const zoomedW = renderW * effZoom;
      const zoomedH = renderH * effZoom;
      const scale = 512 / containerSize;
      const tx = ((containerSize - zoomedW) / 2 + offset.x) * scale;
      const ty = ((containerSize - zoomedH) / 2 + offset.y) * scale;
      ctx.fillStyle = '#07080C';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, tx, ty, zoomedW * scale, zoomedH * scale);
      const base64 = canvas.toDataURL('image/png');
      uploadCropped(base64);
    };
  };

  const uploadCropped = async (base64) => {
    setIsUploadingLogo(true);
    setCropImageSrc('');
    try {
      const url = await uploadImage(base64);
      if (url) {
        updateForm('orgLogo', url);
        updateForm('orgLogoName', cropImageName);
      }
    } catch {}
    setIsUploadingLogo(false);
  };

  const progress = Math.round((currentStep / 6) * 100);

  const benefits = [
    { icon: 'sports_esports', title: 'Host Tournaments Easily', desc: 'Setup single/double elimination brackets in seconds with automated seeding.' },
    { icon: 'dashboard', title: 'Organizer Tools Panel', desc: 'Manage lobbies, chat check-ins, and schedule events from a single panel.' },
    { icon: 'payments', title: 'Registrations & Payouts', desc: 'Secure team entry fees and automate prize distributions with smart payouts.' },
    { icon: 'analytics', title: 'Real-Time Event Analytics', desc: 'Track participant turnout ratios, match duration charts, and growth stats.' },
    { icon: 'groups', title: 'Grow Your Community', desc: 'Establish your brand presence and gather a loyal follower base.' },
    { icon: 'support_agent', title: 'Premium Partner Support', desc: 'Get dedicated 24/7 organizer assistance and anti-cheat consulting.' }
  ];

  const eligibility = [
    { title: 'Age Criteria', desc: 'Must be 18 years of age or older to host payout tournaments.', icon: 'child_care' },
    { title: 'Clean Standing', desc: 'No history of toxic behavior or anti-cheat match reporting bans.', icon: 'gavel' },
    { title: 'KYC Document', desc: 'Valid government identity proof or team registration details.', icon: 'badge' },
    { title: 'Fair Play Policy', desc: 'Agreement to follow Match District standards for fair tournament hosting.', icon: 'handshake' }
  ];

  const stepsOverview = [
    { number: '01', title: 'Submit Form', desc: 'Fill in details, organization image, and identity documents.' },
    { number: '02', title: 'Review & Verify', desc: 'Admins verify documents and KYC status within 24 hours.' },
    { number: '03', title: 'Access Portal', desc: 'Accreditation granted. Open dashboard to build brackets.' }
  ];

  const faqs = [
    { q: 'How long does the approval process take?', a: 'We evaluate KYC applications within 24 hours. You will receive an email notice and see your status update live on this page.' },
    { q: 'What verification documents are required?', a: 'We accept Aadhaar Card, PAN Card, Driving License, Voter ID, or Passport. Make sure files are clear and names match your application.' },
    { q: 'Can beginners apply to host tournaments?', a: 'Yes, we support organizers of all tiers. Select "Beginner" so our platform success team can help guide your first bracket.' },
    { q: 'What exclusive benefits are included?', a: 'Verified hosts receive direct homepage feature listings, bracket automated sync, customized form builders, and secure prize management.' },
    { q: 'How can I contact host support?', a: 'Reach our team via the Help & Support page or email us directly at organizers@matchdistrict.com.' }
  ];

  const renderDropdown = (label, value, options, onChange, placeholder, disabled) => (
    <div className="space-y-1.5">
      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner appearance-none cursor-pointer disabled:opacity-40"
        >
          <option value="">{placeholder || 'Select...'}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
          <span className="material-symbols-outlined text-sm">expand_more</span>
        </span>
      </div>
    </div>
  );

  const renderMultiSelect = (label, options, selected, onChange) => (
    <div className="space-y-2">
      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSel = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                isSel
                  ? 'bg-primary text-on-primary border-primary shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                  : 'bg-surface-container border-outline-variant/40 text-on-surface-variant hover:text-white hover:border-primary/40'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSectionBlock = (title, icon, children) => (
    <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm space-y-4">
      <div className="flex items-center gap-2.5 pb-1 border-b border-outline-variant/10">
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
        <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Full Name *</label>
          <AbuseFieldWrapper fieldId="org-applicantName" value={form.applicantName} onWarning={setApplicantNameAbuse}>
            <input
              type="text"
              value={form.applicantName}
              onChange={(e) => updateForm('applicantName', e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          </AbuseFieldWrapper>
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Email *</label>
          <input
            type="email"
            disabled
            value={form.email}
            className="w-full px-4 py-3 rounded-xl bg-surface-container/60 border border-outline-variant/40 text-white/50 text-xs sm:text-sm outline-none cursor-not-allowed shadow-inner font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Phone Number *</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              updateForm('phone', val);
            }}
            placeholder="10-digit mobile number"
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderDropdown('Country *', form.country, countriesList, (v) => {
          updateForm('country', v);
          updateForm('state', '');
          updateForm('city', '');
        })}

        {form.country === 'Other' ? (
          <div className="space-y-1.5">
            <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">State *</label>
            <input
              type="text"
              value={form.state}
              onChange={(e) => { updateForm('state', e.target.value); updateForm('city', ''); }}
              placeholder="Enter state"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          </div>
        ) : (
          renderDropdown('State *', form.state, statesList, (v) => { updateForm('state', v); updateForm('city', ''); }, 'Select state', !form.country)
        )}

        <div className="space-y-1.5 relative">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">City *</label>
          {form.country === 'Other' || form.state === 'Other State' ? (
            <input
              type="text"
              value={form.city}
              onChange={(e) => updateForm('city', e.target.value)}
              placeholder="Enter city"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          ) : (
            <div className="relative">
              <input
                type="text"
                placeholder={form.state ? 'Search city...' : 'Select state first'}
                disabled={!form.state}
                value={form.city || citySearch}
                onChange={(e) => { setCitySearch(e.target.value); updateForm('city', e.target.value); setShowCityDropdown(true); }}
                onFocus={() => { if (form.state) setShowCityDropdown(true); }}
                className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner disabled:opacity-40"
              />
              {form.city && (
                <button type="button" onClick={() => { updateForm('city', ''); setCitySearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
              {showCityDropdown && filteredCities.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-surface-container border border-outline-variant/50 rounded-xl z-20 shadow-xl custom-scrollbar">
                  {filteredCities.map((c) => (
                    <div key={c} onClick={() => { updateForm('city', c); setCitySearch(''); setShowCityDropdown(false); }}
                      className="px-4 py-2.5 text-xs text-white hover:bg-primary/20 cursor-pointer transition-colors">{c}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderDropdown('Age Group *', form.ageGroup, ageGroups, (v) => updateForm('ageGroup', v))}
        {renderDropdown('Government ID Type *', form.idType, idTypes, (v) => updateForm('idType', v))}
      </div>

      <div className="space-y-2">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Upload Government ID *</label>
        <input ref={kycInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleKycUpload(e.target.files?.[0])} />
        {!form.kycImage ? (
          <div onClick={() => kycInputRef.current?.click()} className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors">
            {isUploadingKyc ? (
              <div className="flex items-center gap-2 py-1">
                <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <span className="text-xs text-primary font-bold">Uploading...</span>
              </div>
            ) : (
              <>
                <span className="material-symbols-outlined text-primary text-xl">cloud_upload</span>
                <div className="text-center">
                  <p className="text-xs text-white font-semibold">Upload ID Scan (PDF, JPG, PNG)</p>
                  <p className="text-[9px] text-on-surface-variant mt-0.5">Max 5MB</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="material-symbols-outlined text-primary text-lg shrink-0">draft</span>
              <span className="font-semibold text-white truncate">{form.kycName || 'document.pdf'}</span>
              <span className={`text-[10px] font-bold ${kycFileInfo.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {kycFileInfo.sizeText}
              </span>
            </div>
            <button type="button" onClick={() => { updateForm('kycImage', ''); updateForm('kycName', ''); setKycFileInfo({ size: 0, isValid: true, sizeText: '' }); }}
              className="w-7 h-7 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors shrink-0">
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Name *</label>
          <AbuseFieldWrapper fieldId="org-orgName" value={form.orgName} onWarning={setOrgNameAbuse}>
            <input
              type="text"
              value={form.orgName}
              onChange={(e) => updateForm('orgName', e.target.value)}
              placeholder="e.g. Nexus Gaming Guild"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          </AbuseFieldWrapper>
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Logo (512×512) *</label>
          <input ref={orgImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
          {form.orgLogo ? (
            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <span className="material-symbols-outlined text-primary text-lg">image</span>
                <span className="font-semibold text-white truncate text-[11px]">{form.orgLogoName || 'logo.png'}</span>
              </div>
              <button type="button" onClick={() => { updateForm('orgLogo', ''); updateForm('orgLogoName', ''); }}
                className="w-6 h-6 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ) : (
            <div onClick={() => orgImageInputRef.current?.click()}
              className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              {isUploadingLogo ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <span className="text-[11px] text-primary font-bold">Uploading...</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-primary text-lg">cloud_upload</span>
                  <span className="text-[11px] text-white font-semibold">Upload Logo (Max 5MB)</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Banner</label>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerUpload(e.target.files?.[0])} />
          {form.orgBanner ? (
            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <span className="material-symbols-outlined text-primary text-lg">photo</span>
                <span className="font-semibold text-white truncate text-[11px]">{form.orgBannerName || 'banner.png'}</span>
              </div>
              <button type="button" onClick={() => { updateForm('orgBanner', ''); updateForm('orgBannerName', ''); }}
                className="w-6 h-6 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ) : (
            <div onClick={() => bannerInputRef.current?.click()}
              className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              {isUploadingBanner ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <span className="text-[11px] text-primary font-bold">Uploading...</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-primary text-lg">wallpaper</span>
                  <span className="text-[11px] text-white font-semibold">Upload Banner (Max 10MB)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Tagline *</label>
        <AbuseFieldWrapper fieldId="org-motto" value={form.orgTagline} onWarning={setOrgMottoAbuse}>
          <input
            type="text"
            value={form.orgTagline}
            onChange={(e) => updateForm('orgTagline', e.target.value)}
            placeholder="e.g. Elevating Competitive Gaming"
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </AbuseFieldWrapper>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Description</label>
          <span className="text-[9px] text-on-surface-variant/50 font-medium italic">Optional</span>
        </div>
        <AbuseFieldWrapper fieldId="org-description" value={form.orgDescription} onWarning={setOrgDescAbuse}>
          <textarea
            rows={3}
            value={form.orgDescription}
            onChange={(e) => updateForm('orgDescription', e.target.value)}
            placeholder="Describe your organization's mission, history, and goals..."
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm resize-none outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </AbuseFieldWrapper>
        <p className="text-[9px] text-on-surface-variant/50">Can be edited later from Organization Settings</p>
      </div>

      <div className="glass-card p-4 rounded-xl border border-primary/10 bg-primary/[0.02] backdrop-blur-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-sm">link</span>
          <h4 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">Social Links</h4>
          <span className="text-[9px] text-on-surface-variant/50 font-medium italic">Optional</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Website</label>
            <input type="url" value={form.website} onChange={(e) => updateForm('website', e.target.value)} placeholder="https://yourorg.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Discord Server</label>
            <input type="url" value={form.discord} onChange={(e) => updateForm('discord', e.target.value)} placeholder="https://discord.gg/..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Instagram</label>
            <input type="text" value={form.instagram} onChange={(e) => updateForm('instagram', e.target.value)} placeholder="@yourorg"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">YouTube</label>
            <input type="text" value={form.youtube} onChange={(e) => updateForm('youtube', e.target.value)} placeholder="Channel name or URL"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">X (Twitter)</label>
            <input type="text" value={form.twitter} onChange={(e) => updateForm('twitter', e.target.value)} placeholder="@yourorg"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <div className="glass-card p-4 rounded-xl border border-outline-variant/40 bg-gradient-to-r from-primary/[0.04] via-surface-container-high/30 to-secondary/[0.02] backdrop-blur-md flex items-center gap-4 relative overflow-hidden shadow-lg">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/20 rounded-full blur-xl pointer-events-none"></div>
            <div className="w-14 h-14 rounded-xl border border-outline-variant/40 bg-surface-container overflow-hidden shrink-0 shadow-md">
              {form.orgLogo ? (
                <img src={form.orgLogo} alt="Logo preview" className="avatar-img" />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant/40 text-2xl">business</span>
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-headline-md text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-[240px]">
                {form.orgName.trim() || 'Your Organization'}
              </h4>
              <span className="material-symbols-outlined text-[15px] text-[#1d9bf0] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            </div>
            <p className="font-body-sm text-[10px] text-on-surface-variant">{form.orgTagline || 'Tagline here'}</p>
            <div className="flex gap-2 text-[9px] font-bold text-primary-light mt-0.5">
              <span>Accredited Tournament Host</span>
              <span>•</span>
              <span>Status: Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-5">
      {renderDropdown('How many tournaments have you organized?', form.tournamentsOrganized, tournamentsOrg, (v) => updateForm('tournamentsOrganized', v))}
      {renderDropdown('Hosting Experience Level', form.hostingLevel, expLevels, (v) => updateForm('hostingLevel', v))}
      {renderDropdown('Expected Tournaments Per Month', form.tournamentsPerMonth, monthlyTourneys, (v) => updateForm('tournamentsPerMonth', v))}

      <div className="space-y-1.5">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">How did you hear about Match District?</label>
        <div className="relative">
          <select
            value={form.heardFrom}
            onChange={(e) => updateForm('heardFrom', e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner appearance-none cursor-pointer"
          >
            <option value="">Select...</option>
            {hearAbout.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            <span className="material-symbols-outlined text-sm">expand_more</span>
          </span>
        </div>
      </div>

      {form.heardFrom === 'Advertisement' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-1.5 pl-4 border-l-2 border-primary/30"
        >
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Where did you see the advertisement?</label>
          <div className="relative">
            <select
              value={form.adSource}
              onChange={(e) => updateForm('adSource', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner appearance-none cursor-pointer"
            >
              <option value="">Select...</option>
              {adSources.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </span>
          </div>
        </motion.div>
      )}

      <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-primary/[0.02] backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-sm">insights</span>
          <span className="text-[10px] text-on-surface-variant font-semibold">Your Organizer Profile Strength</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500" style={{ width: `${Math.min(40 + (form.tournamentsOrganized ? 15 : 0) + (form.hostingLevel ? 15 : 0) + (form.tournamentsPerMonth ? 15 : 0) + (form.heardFrom ? 15 : 0), 100)}%` }} />
          </div>
          <span className="text-xs font-bold text-white">{Math.min(40 + (form.tournamentsOrganized ? 15 : 0) + (form.hostingLevel ? 15 : 0) + (form.tournamentsPerMonth ? 15 : 0) + (form.heardFrom ? 15 : 0), 100)}%</span>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-5">
      {renderMultiSelect('Games Planned *', gameOptions, form.games, (opt) => toggleArrayItem('games', opt))}

      {renderMultiSelect('Tournament Formats', formatOptions, form.formats, (opt) => toggleArrayItem('formats', opt))}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderDropdown('Expected Participants Per Event', form.expectedParticipants, participantRanges, (v) => updateForm('expectedParticipants', v))}
        {renderDropdown('Prize Pool Range', form.prizePool, prizeRanges, (v) => updateForm('prizePool', v))}
      </div>

      {form.games.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-emerald-400 text-sm">checklist</span>
            <span className="text-[10px] text-emerald-400 font-semibold">Games Selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {form.games.map(g => (
              <span key={g} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-semibold">{g}</span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );

  const renderStep5 = () => {
    const policyItems = [
      { key: 'fairPlay', label: 'Fair Play Policy', desc: 'I agree to uphold fair competition standards and ensure all matches are conducted with integrity.' },
      { key: 'antiCheat', label: 'Anti-Cheating Rules', desc: 'I agree to enforce anti-cheating measures and report any suspicious activity to Match District.' },
      { key: 'refund', label: 'Refund Policy', desc: 'I acknowledge and agree to the platform refund and cancellation policies.' },
      { key: 'prizeDist', label: 'Prize Distribution Policy', desc: 'I agree to distribute prizes fairly and in accordance with the tournament rules.' },
      { key: 'terms', label: 'Match District Terms & Conditions', desc: 'I have read and agree to the Match District Terms & Conditions and Privacy Policy.' },
    ];

    const score = getTrustScore();

    return (
      <div className="space-y-5">
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.03] to-transparent backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-lg">security</span>
              <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">Organizer Trust Score</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${score}%` }} />
              </div>
              <span className={`text-sm font-extrabold ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-primary' : 'text-amber-400'}`}>{score}%</span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[20, 40, 60, 80, 100].map((t) => (
              <div key={t} className={`text-center text-[8px] font-bold uppercase tracking-wider ${score >= t ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                <span className={`block w-full h-1 rounded-full mb-1 ${score >= t ? 'bg-primary/30' : 'bg-surface-container'}`} />
                {t === 100 ? 'Excellent' : t === 80 ? 'Strong' : t === 60 ? 'Good' : t === 40 ? 'Fair' : 'Basic'}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {policyItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => updatePolicy(item.key)}
              className={`w-full flex items-start gap-3.5 p-4 rounded-xl border transition-all text-left ${
                form.policies[item.key]
                  ? 'bg-primary/[0.06] border-primary/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-surface-container border-outline-variant/30 hover:border-outline-variant/60'
              }`}
            >
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                form.policies[item.key]
                  ? 'bg-primary text-on-primary shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                  : 'bg-surface-container-high border border-outline-variant/50'
              }`}>
                {form.policies[item.key] && <span className="material-symbols-outlined text-[10px]">check</span>}
              </div>
              <div className="min-w-0">
                <span className={`font-headline-md text-xs font-bold transition-colors ${form.policies[item.key] ? 'text-white' : 'text-on-surface-variant'}`}>
                  {item.label}
                </span>
                <p className="font-body-sm text-[10px] text-on-surface-variant/70 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderStep6 = () => {
    const sections = [
      {
        title: 'Personal Details',
        icon: 'verified_user',
        items: [
          { label: 'Full Name', value: form.applicantName },
          { label: 'Email', value: form.email },
          { label: 'Phone', value: form.phone },
          { label: 'Location', value: `${form.city}, ${form.state}, ${form.country}` },
          { label: 'Age Group', value: form.ageGroup },
          { label: 'ID Type', value: form.idType },
        ]
      },
      {
        title: 'Organization Details',
        icon: 'workspaces',
        items: [
          { label: 'Name', value: form.orgName },
          { label: 'Tagline', value: form.orgTagline },
          { label: 'Description', value: form.orgDescription || '—' },
          { label: 'Website', value: form.website || '—' },
          { label: 'Discord', value: form.discord || '—' },
        ]
      },
      {
        title: 'Experience',
        icon: 'trending_up',
        items: [
          { label: 'Tournaments Organized', value: form.tournamentsOrganized || '—' },
          { label: 'Experience Level', value: form.hostingLevel || '—' },
          { label: 'Tournaments Per Month', value: form.tournamentsPerMonth || '—' },
          { label: 'Heard From', value: form.heardFrom || '—' },
        ]
      },
      {
        title: 'Tournament Plans',
        icon: 'sports_esports',
        items: [
          { label: 'Games', value: form.games.length > 0 ? form.games.join(', ') : '—' },
          { label: 'Formats', value: form.formats.length > 0 ? form.formats.join(', ') : '—' },
          { label: 'Participants', value: form.expectedParticipants || '—' },
          { label: 'Prize Pool', value: form.prizePool || '—' },
        ]
      },
    ];

    return (
      <div className="space-y-5">
        {sections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">{section.icon}</span>
                <h3 className="font-headline-md text-[11px] font-bold text-white uppercase tracking-wider">{section.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => jumpToStep(idx + 1)}
                className="text-[10px] text-primary hover:text-primary/80 font-semibold flex items-center gap-0.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">edit</span>
                Edit
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between sm:flex-col gap-1 py-0.5">
                  <span className="text-[9px] text-on-surface-variant/60 uppercase tracking-wider font-semibold">{item.label}</span>
                  <span className="text-[11px] text-white font-semibold truncate">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}

        {form.orgLogo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/20">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container shrink-0">
              <img src={form.orgLogo} alt="Org logo" className="avatar-img" />
            </div>
            <div className="text-[10px] text-on-surface-variant">
              <span className="text-white font-semibold">{form.orgLogoName || 'Logo'}</span>
              <span className="block text-[9px]">Organization logo uploaded</span>
            </div>
          </motion.div>
        )}

        <div className="glass-card p-4 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.03] to-transparent backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-on-surface-variant font-semibold">Trust Score</span>
            <span className="text-sm font-extrabold text-emerald-400">{getTrustScore()}%</span>
          </div>
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${getTrustScore()}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 min-h-[44px] bg-gradient-to-r from-primary to-indigo-500 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Submitting...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">rocket_launch</span>
              Submit Application
            </>
          )}
        </button>
      </div>
    );
  };

  const renderPostSubmission = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-transparent space-y-6 shadow-xl max-w-lg mx-auto"
    >
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <div className="space-y-1">
          <h2 className="font-display-lg text-lg sm:text-xl font-extrabold text-white uppercase tracking-tight">Application Submitted!</h2>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            Thank you for applying. Our team will review your application and notify you once your Organizer Portal is activated.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-emerald-400 text-sm">check</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Application Submitted</p>
            <p className="text-[10px] text-emerald-400/70">Your application is in our system</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-amber-400 text-sm">hourglass_empty</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Under Review</p>
            <p className="text-[10px] text-amber-400/70">Our team is evaluating your details</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 opacity-60">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-sm">gavel</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Verification</p>
            <p className="text-[10px] text-on-surface-variant/70">Identity & document verification</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 opacity-60">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-sm">rocket_launch</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Organizer Activation</p>
            <p className="text-[10px] text-on-surface-variant/70">Portal access granted</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-secondary/[0.02] backdrop-blur-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-sm">schedule</span>
          <span className="text-xs text-white font-bold">Estimated Review Time</span>
        </div>
        <p className="text-lg font-extrabold text-primary">24–72 Hours</p>
      </div>

      <button
        onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold hover:bg-surface-variant transition-all"
      >
        Return Home
      </button>
    </motion.div>
  );

  const renderPendingView = () => (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent space-y-6 shadow-xl">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-2xl">hourglass_empty</span>
        </div>
        <div className="space-y-1">
          <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase tracking-tight">Application Under Review</h2>
          <p className="font-body-md text-xs sm:text-sm text-amber-300/80 leading-relaxed font-semibold">
            Your organizer application has been submitted and is currently pending admin review.
          </p>
        </div>
      </div>
      <button onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold">
        Return Home
      </button>
    </motion.div>
  );

  const renderRejectedView = () => (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-500/5 to-transparent text-center space-y-5 shadow-xl">
      <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-2xl">block</span>
      </div>
      <div className="space-y-1">
        <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase">Accreditation Not Approved</h2>
        <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">Submission details did not pass verification criteria.</p>
        <p className="text-xs text-rose-400 font-semibold pt-1">You can reapply in <strong>{daysLeft} days</strong>.</p>
      </div>
      <button onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold">
        Return Home
      </button>
    </motion.div>
  );

  const renderStepNav = () => (
    <div className="flex items-center gap-2 sm:gap-3 mb-6 overflow-x-auto no-scrollbar pb-1">
      {STEPS.map((step) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => { if (isDone) jumpToStep(step.id); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all text-[10px] font-bold uppercase tracking-wider ${
              isActive
                ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                : isDone
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer'
                  : 'bg-surface-container text-on-surface-variant/50 border border-outline-variant/20'
            }`}
          >
            {isDone ? (
              <span className="material-symbols-outlined text-[10px]">check</span>
            ) : (
              <span>{step.id}</span>
            )}
            <span className="hidden sm:inline">{step.title}</span>
          </button>
        );
      })}
    </div>
  );

  const renderWizard = () => (
    <>
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">{STEPS[currentStep - 1]?.icon}</span>
            <div>
              <h3 className="font-headline-md text-sm font-bold text-white">{STEPS[currentStep - 1]?.title}</h3>
              <p className="text-[10px] text-on-surface-variant">{STEPS[currentStep - 1]?.subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-extrabold text-primary">{progress}%</span>
            <p className="text-[9px] text-on-surface-variant/60">Step {currentStep} of 6</p>
          </div>
        </div>
        <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-indigo-400 to-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        {renderStepNav()}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="glass-card p-5 sm:p-6 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-2xl shadow-xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
                {currentStep === 4 && renderStep4()}
                {currentStep === 5 && renderStep5()}
                {currentStep === 6 && renderStep6()}
              </motion.div>
            </AnimatePresence>

            {currentStep < 6 && (
              <div className="flex gap-3 mt-6 pt-5 border-t border-outline-variant/10">
                {currentStep > 1 ? (
                  <button type="button" onClick={handleBack}
                    className="flex-1 py-3 min-h-[44px] bg-surface-container-high text-on-surface-variant hover:text-white rounded-xl font-headline-md text-xs font-bold border border-outline-variant/30 transition-all flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    Back
                  </button>
                ) : <div className="flex-1" />}
                <button type="button" onClick={handleNext}
                  className="flex-1 py-3 min-h-[44px] bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_12px_rgba(99,102,241,0.2)] hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center justify-center gap-1.5">
                  Next
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {currentStep < 6 && (
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-24 space-y-4">
              <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-outline-variant/10">
                  <span className="material-symbols-outlined text-primary text-sm">quicktips</span>
                  <span className="text-[10px] text-white font-bold uppercase tracking-wider">Quick Guide</span>
                </div>
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  {currentStep === 1 && 'Verify your identity with accurate personal details. Your email is pre-filled from your account.'}
                  {currentStep === 2 && 'Create your esports organization profile. Add your logo and social links to build credibility.'}
                  {currentStep === 3 && 'Share your tournament organizing experience. Don\'t worry if you\'re new — all levels welcome!'}
                  {currentStep === 4 && 'Select the games and formats you plan to host. This helps us match you with the right tools.'}
                  {currentStep === 5 && 'Review and accept our platform policies. Your Trust Score increases with profile completeness.'}
                </p>
              </div>

              <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-outline-variant/10">
                  <span className="material-symbols-outlined text-amber-400 text-sm">auto_save</span>
                  <span className="text-[10px] text-white font-bold uppercase tracking-wider">Auto-Save Active</span>
                </div>
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  Your progress is automatically saved. You can leave and resume later anytime.
                </p>
                <button type="button" onClick={clearDraft}
                  className="mt-2 text-[9px] text-on-surface-variant/50 hover:text-red-400 transition-colors underline">
                  Clear saved draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#07080C] text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
      </div>

      <Header activePage="become-organizer" onNavigate={onNavigate} />

      <main className="w-full max-w-5xl mx-auto px-4 pt-20 sm:pt-28 pb-8 sm:pb-14 space-y-16 sm:space-y-24 relative z-10">

        {!submitted && !isPending && !isRejected && resumeAvailable && currentStep === 1 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/[0.06] to-secondary/[0.02] backdrop-blur-sm flex items-center justify-between gap-4 max-w-2xl mx-auto"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-lg">history</span>
              <div>
                <p className="text-xs text-white font-bold">Resume your application?</p>
                <p className="text-[10px] text-on-surface-variant">You have a saved draft from your previous session.</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={clearDraft}
                className="px-3 py-1.5 text-[10px] text-on-surface-variant hover:text-red-400 font-semibold border border-outline-variant/30 rounded-lg transition-colors">
                Discard
              </button>
              <button type="button" onClick={resumeDraft}
                className="px-3 py-1.5 min-h-[44px] text-[10px] bg-primary text-on-primary font-bold rounded-lg shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all">
                Resume
              </button>
            </div>
          </motion.div>
        )}

        {/* Hero Section */}
        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5 py-4">
          <h1 className="font-display-lg text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight uppercase leading-tight">
            Become an <br />
            <span className="inline-block bg-gradient-to-r from-violet-400 via-indigo-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(99,102,241,0.45)]">Organizer</span>
          </h1>
          <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-lg mx-auto leading-relaxed">
            Host tournaments, manage brackets, and secure prize payouts. Unlock professional toolsets to grow your competitive gaming community.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 max-w-sm mx-auto">
            <button onClick={() => document.getElementById('application-form-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full py-3.5 min-h-[44px] px-6 bg-primary text-on-primary font-headline-md text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-[0_0_15px_rgba(192,193,255,0.25)] flex items-center justify-center gap-1.5">
              Start Application
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
            <button onClick={() => document.getElementById('benefits-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full py-3.5 min-h-[44px] px-6 bg-surface-container-high border border-outline-variant/30 text-white font-headline-md text-xs font-bold rounded-xl hover:bg-surface-variant transition-all">
              Explore Perks
            </button>
          </div>
          <div className="pt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] text-on-surface-variant/75 font-body-sm">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-primary text-sm">verified</span> Verified Accreditation</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-emerald-400 text-sm">lock</span> Secure Payouts</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-secondary text-sm">speed</span> Reviews under 24h</span>
          </div>
        </motion.section>

        {/* Benefits */}
        <section id="benefits-section" className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Advantages</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Exclusive Host Benefits</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {benefits.map((benefit, idx) => (
              <div key={idx}
                className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-sm flex items-start gap-3.5 hover:border-primary/20 transition-all">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">{benefit.icon}</span>
                </div>
                <div className="space-y-1">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-white leading-tight">{benefit.title}</h3>
                  <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Eligibility */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Accreditation Criteria</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Eligibility Standards</h2>
          </div>
          <div className="glass-card p-5 sm:p-6 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {eligibility.map((item, idx) => (
                <div key={idx}
                  className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/10 hover:bg-surface-container-high/20 transition-all flex items-center gap-3.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-xs">check</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-headline-md text-xs font-bold text-white truncate">{item.title}</h3>
                    <p className="font-body-sm text-[11px] text-on-surface-variant truncate">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Onboarding</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Verification Steps</h2>
          </div>
          <div className="glass-card p-6 sm:p-8 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-sm max-w-md mx-auto">
            <div className="flex flex-col gap-5">
              {stepsOverview.map((step, idx) => (
                <div key={idx} className="flex gap-4 items-start relative">
                  {idx !== 2 && (<div className="absolute left-4.5 top-10 bottom-[-20px] w-[1px] bg-gradient-to-b from-primary/30 to-transparent"></div>)}
                  <div className="w-9 h-9 rounded-xl bg-surface-container-high border border-outline-variant/50 flex items-center justify-center text-primary font-bold text-xs shrink-0 shadow-md">
                    {step.number}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-headline-lg text-xs sm:text-sm font-bold text-white">{step.title}</h3>
                    <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant leading-normal">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Form or Status */}
        <section id="application-form-section" className="scroll-mt-20">
          <div className="max-w-3xl mx-auto">
            {isPending ? renderPendingView() : isRejected ? renderRejectedView() : (
              submitted ? renderPostSubmission() : renderWizard()
            )}
          </div>
        </section>

        {/* FAQs */}
        <section className="space-y-8 max-w-xl mx-auto">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Answers</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Onboarding FAQ</h2>
          </div>
          <div className="glass-card p-5 sm:p-6 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-sm">
            <div className="divide-y divide-outline-variant/20">
              {faqs.map((faq, idx) => {
                const isOpen = activeFaq === idx;
                return (
                  <div key={idx} className={`${idx === 0 ? 'pb-3' : idx === faqs.length - 1 ? 'pt-3' : 'py-3'}`}>
                    <button onClick={() => setActiveFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between text-left py-2 hover:opacity-80 transition-opacity">
                      <span className="font-headline-md text-xs sm:text-sm font-bold text-white pr-4">{faq.q}</span>
                      <span className={`material-symbols-outlined text-primary text-lg transition-transform duration-200 ${isOpen ? 'rotate-185' : ''}`}>expand_more</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15, ease: 'easeInOut' }}>
                          <div className="pb-3 pt-1.5 text-xs text-on-surface-variant leading-relaxed">{faq.a}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </main>

      {/* Crop Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 relative bg-[#07080C]/90 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-md text-sm font-bold text-white flex items-center gap-2 tracking-tight">
                <span className="material-symbols-outlined text-primary text-lg">crop_free</span> Crop Organization Logo
              </h3>
              <button onClick={() => { setCropImageSrc(''); setCropImageName(''); }}
                className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <p className="text-[10px] text-on-surface-variant/90 leading-normal">Organizers require a 512x512 logo. Drag to pan and use the slider below to zoom.</p>
            <div className="relative w-56 sm:w-64 h-56 sm:h-64 mx-auto rounded-xl border border-outline-variant/50 overflow-hidden bg-black/40 select-none touch-none">
              <div className="absolute inset-0 z-10 border-2 border-primary/50 pointer-events-none rounded-xl" style={{ boxShadow: '0 0 0 9999px rgba(7, 8, 12, 0.7)' }} />
              <div className="w-full h-full cursor-move"
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}>
                <img src={cropImageSrc} alt="Crop preview" draggable={false} className="max-w-none origin-center select-none"
                  style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomPercent / 100})`, transition: isDragging ? 'none' : 'transform 0.1s ease-out', width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span>Zoom</span>
                <span>{zoomPercent}%</span>
              </div>
              <input type="range" min="10" max="200" step="1" value={zoomPercent} onChange={(e) => setZoomPercent(Number(e.target.value))}
                className="w-full h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setCropImageSrc(''); setCropImageName(''); }}
                className="flex-1 py-2.5 min-h-[44px] bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-white rounded-xl font-headline-md text-xs font-bold border border-outline-variant/30 transition-all">
                Cancel
              </button>
              <button type="button" onClick={handleCropConfirm}
                className="flex-1 py-2.5 min-h-[44px] bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_12px_rgba(192,193,255,0.2)]">
                Crop & Save
              </button>
            </div>
          </div>
        </div>
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
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">© 2024 MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default BecomeOrganizer;
