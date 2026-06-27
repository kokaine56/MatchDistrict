import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../UserContext.jsx';

function TermsService({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [activeSection, setActiveSection] = useState('obligations');

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  };

  const navItems = [
    { id: 'obligations', label: 'User Obligations & Account Security', icon: 'verified_user' },
    { id: 'fairplay', label: 'Competitive Rules & Fair Play', icon: 'sports_esports' },
    { id: 'disputes', label: 'Tournament Rules & Dispute Resolution', icon: 'gavel' },
    { id: 'financial', label: 'Financial Agreement & UPI Terms', icon: 'account_balance' },
    { id: 'refund', label: 'Binding Refund & Cancellation Policy', icon: 'undo' },
    { id: 'liability', label: 'Limitation of Liability', icon: 'shield' },
    { id: 'modifications', label: 'Modifications to Terms & Policies', icon: 'update' }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 130;
      for (const item of navItems) {
        const el = document.getElementById(item.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(item.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 100;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 relative selection:bg-blue-200 selection:text-blue-900">
      {/* Subtle grid background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #3B82F6 1px, transparent 1px),
              linear-gradient(to bottom, #3B82F6 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px'
          }}
        />
        <div className="absolute top-0 left-1/3 w-[400px] h-[400px] bg-blue-400/8 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-indigo-400/6 blur-[80px] rounded-full pointer-events-none" />
      </div>

      <main className="w-full max-w-6xl mx-auto px-4 pt-24 sm:pt-32 pb-12 sm:pb-20 relative z-10">

        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 pb-8 mb-8 border-b border-slate-200"
        >
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Terms of Service
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-mono font-medium tracking-wide">
            LAST UPDATED: MAY 20, 2026
          </p>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Welcome to the Match District platform. By registering an account, joining tournaments, or hosting events, you enter into a binding agreement with the following Terms of Service. Please read each clause carefully.
          </p>
        </motion.section>

        {/* Mobile: Sticky Horizontal Scrollable Chips */}
        <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md py-3 mb-5 md:hidden -mx-4 px-4 border-b border-slate-200/60">
          <div className="flex gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
            {navItems.map(item => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleScrollTo(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="lg:flex lg:gap-10 items-start">

          {/* Desktop Sidebar */}
          <aside className="hidden lg:block lg:w-[260px] lg:shrink-0 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-1">
              <span className="text-[10px] font-bold text-blue-600 tracking-wider uppercase block px-3 pt-1 pb-2">
                Document Sections
              </span>
              <div className="flex flex-col gap-0.5">
                {navItems.map(item => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleScrollTo(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-all ${
                        isActive
                          ? 'bg-blue-50 text-slate-900 font-bold shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 min-w-0 space-y-8 mt-8 lg:mt-0">

            {/* Section 1 — User Obligations & Account Security */}
            <section id="obligations" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">verified_user</span>
                  </span>
                  1. User Obligations &amp; Account Security
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1.5L3 4v4c0 3.25 1.75 6.25 5 7 3.25-0.75 5-3.75 5-7V4L8 1.5z" />
                        <path d="M6 8.5l1.5 1.5L10 6.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Account Accuracy</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        By registering, you agree to provide accurate, current, and complete information, including a valid UPI ID for payouts. You are strictly prohibited from creating multiple accounts or using false identities.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
                        <path d="M5.5 2V1h5v1" />
                        <path d="M5.5 8l2 2 3-3.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Organizer KYC Liability</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Organizers must pass mandatory KYC verification. Falsifying Government ID or location data will result in immediate termination and potential legal action.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="4.5" width="11" height="10" rx="1.5" />
                        <path d="M5.5 4.5V3a2.5 2.5 0 015 0v1.5" />
                        <circle cx="8" cy="9" r="1.5" />
                        <path d="M8 9v2" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Account Liability</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You are solely responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 — Competitive Rules & Fair Play */}
            <section id="fairplay" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">sports_esports</span>
                  </span>
                  2. Competitive Rules &amp; Fair Play
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="6" />
                        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
                        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Zero Tolerance Policy</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You agree to compete fairly. The use of cheats, third-party scripts, exploits, smurf accounts, or engaging in match-fixing/collusion is strictly prohibited.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l10 10" />
                        <path d="M13 3L3 13" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Consequences of Violation</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Match District reserves the right to immediately disqualify any user or team found violating these rules. Such disqualification will result in a permanent account ban and the absolute forfeiture of any entry fees or pending prize pool payouts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3 — Tournament Rules & Dispute Resolution */}
            <section id="disputes" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">gavel</span>
                  </span>
                  3. Tournament Rules &amp; Dispute Resolution
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
                        <line x1="5" y1="5" x2="11" y2="5" />
                        <line x1="5" y1="8" x2="11" y2="8" />
                        <line x1="5" y1="11" x2="9" y2="11" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Game-Specific Rules</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Users must adhere to the specific rulesets, settings, and guidelines provided by the organizer for each individual tournament.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1.5L3 4v4c0 3.25 1.75 6.25 5 7 3.25-0.75 5-3.75 5-7V4L8 1.5z" />
                        <path d="M6 8.5l1.5 1.5L10 6.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Final Authority</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        In the event of any disputes regarding match outcomes, rule interpretations, scoring, or competitive integrity, Match District's administration and support team hold the right to make the final, binding decision.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4 — Financial Agreement & UPI Terms */}
            <section id="financial" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">account_balance</span>
                  </span>
                  4. Financial Agreement &amp; UPI Terms
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="3" width="14" height="10" rx="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <line x1="5" y1="8" x2="3" y2="8" />
                        <line x1="13" y1="8" x2="11" y2="8" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">UPI Exclusive Transactions</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You acknowledge and agree that all financial transactions, including tournament entry fees and prize pool distributions, are processed exclusively via UPI.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="12" height="10" rx="1" />
                        <line x1="5" y1="8" x2="11" y2="8" />
                        <path d="M8 8l-2 2" />
                        <path d="M8 8l2 2" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Escrow Agreement</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You agree that entry fees are placed in a secure escrow system. Funds are released strictly according to the finalized, verified tournament results. Match District acts solely as a facilitator for these transactions.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1v14" />
                        <path d="M2 8h12" />
                        <circle cx="8" cy="8" r="6.5" />
                        <path d="M5.5 5.5l2.5 1.5 2.5-1.5" />
                        <path d="M5.5 10.5l2.5-1.5 2.5 1.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Tax Liabilities</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Users are solely responsible for reporting and paying any applicable taxes on prize pool winnings according to local jurisdictions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 5 — Binding Refund & Cancellation Policy */}
            <section id="refund" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">undo</span>
                  </span>
                  5. Binding Refund &amp; Cancellation Policy
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l-3-3 3-3" />
                        <path d="M2 10h8a3 3 0 0 0 3-3V3" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">User Eligibility</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You may cancel your registration and receive a full refund only if the request is submitted at least 24 hours prior to the tournament start time, and provided the brackets have not been generated.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1v14" />
                        <path d="M3 6l5-4 5 4" />
                        <path d="M13 10l-5 4-5-4" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Platform Failures</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        In the event of an organizer cancellation or critical platform failure, you are entitled to a 100% refund.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3l2 2" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Settlement Timeline</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        All approved refunds will be credited back to the original UPI payment method within 5 to 7 business days.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="6" />
                        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
                        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Voided Refunds</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        No refunds will be granted for no-shows, voluntary withdrawals within 24 hours of the event, or disqualifications due to ToS violations.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 6 — Limitation of Liability */}
            <section id="liability" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">shield</span>
                  </span>
                  6. Limitation of Liability
                </h2>

                <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 1.5l-5 5a1 1 0 000 1.4l6 6a1 1 0 001.4 0l5-5a1 1 0 000-1.4l-6-6a1 1 0 00-1.4 0z" />
                      <path d="M9.5 4L12 6.5" />
                    </svg>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Match District provides the platform on an <strong className="text-slate-800">&ldquo;AS IS&rdquo;</strong> basis. We are not liable for external internet disruptions, game-server outages, or disputes strictly between users and third-party game publishers.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="6" />
                        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
                        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
                      </svg>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-800">External Disruptions</p>
                      <p className="text-xs text-slate-500">Not liable for internet or game-server outages.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1v14" />
                        <path d="M2 8h12" />
                        <circle cx="8" cy="8" r="6.5" />
                      </svg>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-800">Third-Party Disputes</p>
                      <p className="text-xs text-slate-500">Not liable for disputes with game publishers.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="5.5" width="11" height="9" rx="1.5" />
                        <path d="M5.5 5.5V4a2.5 2.5 0 015 0v1.5" />
                        <path d="M8 9v2.5" />
                        <circle cx="8" cy="10" r="3" fill="none" />
                      </svg>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-800">Platform as Is</p>
                      <p className="text-xs text-slate-500">Match District provided without warranty.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 7 — Modifications to Terms & Policies */}
            <section id="modifications" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">update</span>
                  </span>
                  7. Modifications to Terms &amp; Policies
                </h2>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="5.5" />
                        <path d="M2.5 8h11" />
                        <path d="M8 2.5v11" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Policy Updates</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Match District reserves the right to update, modify, or revise these Terms of Service and the Privacy Policy at any time to reflect operational or legal changes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 9.5l-3-3 3-3" />
                        <path d="M2 6.5h8a2.5 2.5 0 012.5 2.5V10" />
                        <path d="M10.5 12.5l3-3-3-3" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-800">Notification of Changes</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        We will actively notify users and organizers of any material changes via platform notifications or registered email before the changes take effect. Continued use of the platform after such notifications constitutes your acceptance of the updated terms.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Contact CTA */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl border border-blue-100 shadow-sm p-8 text-center space-y-5 max-w-xl mx-auto"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-xl">description</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">Need Terms Clarification?</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                  Our team is ready to answer bracket eligibility questions or handle platform dispute filings.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-1 max-w-xs mx-auto">
                <button
                  onClick={() => window.open('mailto:support@matchdistrict.com')}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition-all active:scale-[0.98]"
                >
                  Contact Support
                </button>
                <button
                  onClick={() => onNavigate && onNavigate('help-support')}
                  className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  Help Center
                </button>
              </div>
            </motion.section>

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-6 px-4">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-5 border-b border-slate-100 pb-4">
            <button onClick={() => onNavigate && onNavigate('terms-service')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Terms</button>
            <button onClick={() => onNavigate && onNavigate('privacy-policy')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Privacy</button>
            <button onClick={() => onNavigate && onNavigate('help-support')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Support</button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <button onClick={() => onNavigate && onNavigate('home')} className="text-base font-extrabold text-blue-600 tracking-tight hover:opacity-80 transition-opacity">
              Match District
            </button>
            <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default TermsService;
