import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import { useUser } from '../UserContext.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';

function BecomeOrganizer({ onNavigate }) {
  const { currentUser } = useUser();
  const [activeFaq, setActiveFaq] = useState(null);
  const [allApps, setAllApps] = useState([]);

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

  const renderPendingView = () => (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center"
    >
      <div className="flex flex-col items-center gap-8 w-full max-w-sm mx-auto">
        <div className="relative inline-flex">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center animate-pulse">
            <span className="material-symbols-outlined text-3xl">hourglass_empty</span>
          </div>
          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-amber-400/20 animate-ping opacity-30" />
        </div>
        <div className="space-y-3">
          <h2 className="font-display-lg text-xl font-extrabold text-white uppercase tracking-tight">Application Under Review</h2>
          <p className="font-body-md text-sm text-amber-300/60 leading-relaxed">
            Your organizer application has been submitted and is currently pending admin review.
          </p>
        </div>
        <button onClick={() => onNavigate && onNavigate('home')}
          className="w-full py-3.5 min-h-[44px] bg-primary text-on-primary font-headline-md text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_8px_28px_rgba(59,130,246,0.45)] active:scale-[0.98]">
          Return Home
        </button>
      </div>
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

  return (
    <div className="min-h-screen bg-[#07080C] text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
      </div>

      <Header activePage="become-organizer" onNavigate={onNavigate} />

      <main className="w-full max-w-5xl mx-auto px-4 pt-20 sm:pt-28 pb-8 sm:pb-14 space-y-16 sm:space-y-24 relative z-10">

        {isPending && (
          <div className="max-w-lg mx-auto">
            {renderPendingView()}
          </div>
        )}

        {isRejected && (
          <div className="max-w-lg mx-auto">
            {renderRejectedView()}
          </div>
        )}

        {!isPending && !isRejected && (
          <>
            <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5 py-4">
              <h1
                className="font-display-lg font-extrabold text-white tracking-tight leading-tight"
                style={{ fontSize: 'clamp(1.25rem, 5vw, 3rem)', whiteSpace: 'nowrap' }}
              >
                Become an{' '}
                <span className="inline-block bg-gradient-to-r from-violet-400 via-indigo-400 to-indigo-500 bg-clip-text text-transparent">
                  organiser
                </span>
              </h1>
              <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                Host tournaments, manage brackets, and secure prize payouts. Unlock professional toolsets to grow your competitive gaming community.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 max-w-sm mx-auto">
                <button onClick={() => {
                  if (currentUser) {
                    onNavigate && onNavigate('organizer-form');
                  } else {
                    window.location.href = '/login?redirect=%2Forganizer-form';
                  }
                }}
                  className="w-full py-3.5 min-h-[44px] px-6 bg-primary text-on-primary font-headline-md text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-[0_0_15px_rgba(192,193,255,0.25)] flex items-center justify-center gap-1.5">
                  Apply Form
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

            <section className="space-y-8">
              <div className="text-center space-y-2">
                <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Onboarding</span>
                <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Verification Steps</h2>
              </div>
              <div className="glass-card p-6 sm:p-8 rounded-2xl border border-outline-variant/30 bg-[#07080C]/40 backdrop-blur-sm max-w-md mx-auto">
                <div className="flex flex-col gap-5">
                  {stepsOverview.map((step, idx) => (
                    <div key={idx} className="flex gap-4 items-start relative">
                      {idx !== 2 && (
                        <div className="absolute left-[18px] -translate-x-1/2 top-9 bottom-[-20px] w-[1px] bg-gradient-to-b from-primary/30 to-transparent"></div>
                      )}
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
          </>
        )}
      </main>

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
    </div>
  );
}

export default BecomeOrganizer;
