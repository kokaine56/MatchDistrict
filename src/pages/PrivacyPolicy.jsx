import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../UserContext.jsx';

function PrivacyPolicy({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [activeSection, setActiveSection] = useState('collect');

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  };

  const navItems = [
    { id: 'collect', label: 'Information We Collect', icon: 'inventory_2' },
    { id: 'use', label: 'How We Use Data', icon: 'psychology' },
    { id: 'cookies', label: 'Cookies & Tracking', icon: 'cookie' },
    { id: 'payments', label: 'Payment Information', icon: 'account_balance_wallet' },
    { id: 'security', label: 'Security Measures', icon: 'gpp_good' },
    { id: 'rights', label: 'User Rights', icon: 'person_search' },
    { id: 'retention', label: 'Data Retention', icon: 'history' },
    { id: 'contact', label: 'Contact Information', icon: 'contact_support' },
    { id: 'escrow', label: 'Payment, Pricing & Escrow Policy', icon: 'account_balance' },
    { id: 'refund', label: 'Refund & Cancellation Policy', icon: 'undo' }
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
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-mono font-medium tracking-wide">
            LAST UPDATED: MAY 20, 2026
          </p>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            At Match District, we prioritize user trust and transparency. This policy outlines exactly how we gather, encrypt, and manage player data to maintain a safe competitive gaming district.
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

            {/* Section 1 */}
            <section id="collect" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">inventory_2</span>
                  </span>
                  1. Information We Collect
                </h2>

                <div className="space-y-5">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-500 text-base">person</span>
                      For Users
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Name of the user</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Email address</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Phone number</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">UPI number (strictly for secure prize pool distribution)</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-500 text-base">verified_user</span>
                      For Organizers (KYC &amp; Verification)
                    </h3>
                    <p className="text-sm text-slate-600">
                      To become an approved organizer, we collect mandatory Know Your Customer (KYC) data, which includes:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Name</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Phone number</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 sm:col-span-2">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Government ID Proof (such as a PAN card, driving license, or other official government IDs) for identity verification</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                        <svg className="w-4 h-4 shrink-0 text-blue-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 8.5 6.5 12 13 4.5" />
                        </svg>
                        <span className="text-sm text-slate-700">Location data (specific State and District)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section id="use" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">psychology</span>
                  </span>
                  2. How We Use Data
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  We believe in keeping your privacy simple and transparent. The information we collect from you is strictly used for only two purposes:
                </p>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1.5L3 4v4c0 3.25 1.75 6.25 5 7 3.25-0.75 5-3.75 5-7V4L8 1.5z" />
                        <path d="M6 8.5l1.5 1.5L10 6.5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Identity Verification</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        We use your details and ID proof to verify who you are, ensuring a safe, trusted, and fair competitive environment for everyone on the platform.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1.5" y="4.5" width="13" height="10" rx="1.5" />
                        <path d="M5 4.5V3.5a3 3 0 016 0v1" />
                        <path d="M8 9.5v3" />
                        <path d="M6.5 11h3" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Secure Prize Payouts</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        We use your UPI information solely to process and distribute your tournament winnings securely and promptly.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed italic border-t border-slate-100 pt-5">
                  We do not sell your personal data, nor do we use it for any hidden tracking or marketing purposes.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section id="cookies" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">cookie</span>
                  </span>
                  3. Cookies &amp; Tracking
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  We respect your digital footprint and believe in absolute minimal tracking. Our platform does not use any third-party tracking cookies or collect anonymous server performance telemetry.
                </p>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="5.5" />
                        <path d="M4 4l8 8" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Zero Third-Party Tracking</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Your data stays with us. We do not use external trackers or marketing cookies.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
                        <path d="M4.5 8l2.5 2.5L11.5 5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Session Control</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        You have full control over your session history. If you prefer not to have your session saved, you can simply opt out by leaving the <span className="font-medium text-slate-700">'Remember Me'</span> tick box unchecked when signing in.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="payments" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                  </span>
                  4. Payment Information
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  We believe in a frictionless and secure financial experience. Currently, our platform operates exclusively via UPI for all entry fees and prize distributions.
                </p>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
                        <path d="M5 5.5h6" />
                        <path d="M5 8h6" />
                        <path d="M5 10.5h3" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">UPI Exclusive</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        We only collect and securely store your UPI ID to facilitate seamless transactions and ensure you receive your prize payouts promptly.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="10" height="10" rx="1.5" />
                        <path d="M5 8h6" />
                        <path d="M10 5l-4 6" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">No Card Data Stored</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Your security is our priority. We do not use traditional payment gateways, nor do we process, collect, or store any sensitive banking information, credit card numbers, or debit card details on our servers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="security" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">gpp_good</span>
                  </span>
                  5. Security Measures
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  We deploy premium digital security protections to ensure your data remains safe and secure:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="5.5" width="11" height="9" rx="1.5" />
                        <path d="M5.5 5.5V4a2.5 2.5 0 015 0v1.5" />
                        <path d="M8 9v2.5" />
                        <circle cx="8" cy="10" r="3" fill="none" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-900">TLS 1.3 Transmission Encryptions</span>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1.5l2.5 3-2.5 1.5L5.5 4.5 8 1.5z" />
                        <path d="M8 6l2.5 3L8 10.5 5.5 9 8 6z" />
                        <path d="M8 10.5l2.5 3L8 15l-2.5-1.5L8 10.5z" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-900">Salted Password Hashing</span>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 8l2.5 2.5L11.5 4" />
                        <circle cx="8" cy="8" r="5.5" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-900">Access Tokens Validation</span>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="3" width="11" height="11" rx="1.5" />
                        <path d="M5.5 3V1.5h5V3" />
                        <path d="M8 7v3" />
                        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-900">Automated Firewall Checks</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section id="rights" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">person_search</span>
                  </span>
                  6. User Rights
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  As a player in our district, you hold full authority over your data parameters:
                </p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                    <span><strong className="text-slate-800">Review &amp; Access:</strong> Download a package containing all details linked to your gamer tag.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                    <span><strong className="text-slate-800">Rectification:</strong> Edit and update your personal coordinates directly from your Profile settings.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                    <span><strong className="text-slate-800">Erase Data:</strong> Request deletion of your account metadata and historical logs at any time.</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section id="retention" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">history</span>
                  </span>
                  7. Data Retention
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We store account coordinates only as long as your profile remains active. Unused, inactive profiles with no tournament logs are flagged and automatically deleted after 2 years.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section id="contact" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">contact_support</span>
                  </span>
                  8. Contact Information
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  If you have concerns, queries, or requests regarding this Privacy Policy, connect with our DPO (Data Protection Officer):
                </p>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                  <p className="font-semibold text-slate-800">Match District Support Team</p>
                  {(() => {
                    const email = import.meta.env.VITE_PRIVACY_EMAIL;
                    return (
                      <p className="text-sm text-slate-600">
                        Email: <a href={`mailto:${email}`} className="text-blue-600 hover:text-blue-700 font-medium transition-colors">{email}</a>
                      </p>
                    );
                  })()}
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section id="escrow" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">account_balance</span>
                  </span>
                  9. Payment, Pricing &amp; Escrow Policy
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  Match District acts as a secure facilitator for competitive gaming. To ensure fairness and transparency, all financial transactions comply with standard payment gateway guidelines:
                </p>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="3.5" width="11" height="11" rx="1.5" />
                        <path d="M5.5 3.5V2.5a2.5 2.5 0 015 0v1" />
                        <path d="M8 8.5v3" />
                        <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Entry Fees &amp; Escrow</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Any entry fees collected for tournaments are held securely until the tournament concludes. We do not utilize your funds for platform operations.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1.5" y="3.5" width="13" height="10" rx="1.5" />
                        <path d="M8 6v5" />
                        <path d="M5.5 8.5h5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Prize Pool Transparency</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        The total prize pool distribution is fixed, predetermined, and clearly displayed on the tournament page prior to user registration.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
                        <path d="M5.5 4.5h5" />
                        <path d="M5.5 7.5h5" />
                        <path d="M5.5 10.5h3" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Secure UPI Processing</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        All transactions are processed directly via secure UPI (Unified Payments Interface) channels. Match District strictly uses UPI for all entries and payouts, and we do not process, collect, or store any sensitive credit/debit card details or traditional bank account credentials on our servers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 10 */}
            <section id="refund" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">undo</span>
                  </span>
                  10. Refund &amp; Cancellation Policy
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  We adhere to a transparent refund policy to protect our users. Please read the conditions carefully:
                </p>

                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="5.5" />
                        <path d="M8 4.5v3.5l2 2" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Cancellations by User</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Users may cancel their registration and request a full refund up to 24 hours before the scheduled tournament start time, provided the tournament brackets have not yet been generated.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 8l4-4 2 2 5-4.5" />
                        <path d="M2.5 11.5h11" />
                        <path d="M2.5 11.5l1.5 2.5" />
                        <path d="M13.5 11.5l-1.5 2.5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Platform/Organizer Cancellations</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        If a tournament is cancelled by the organizer or due to platform technical failures, all registered participants will receive a 100% full refund automatically.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="5.5" />
                        <path d="M4 4l8 8" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">No-Shows &amp; Disqualifications</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        No refunds will be issued for players or teams who fail to check in, do not show up for their scheduled matches, or are disqualified for violating fair play and competitive integrity rules (e.g., cheating, scripting, smurfing).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="5.5" />
                        <path d="M8 4.5V8l2.5 1.5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Refund Processing Timeline</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        All approved refunds will be processed and credited back to the original payment method (UPI) within 5 to 7 business days.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 1.5v2" />
                        <path d="M8 12.5v2" />
                        <path d="M1.5 8h2" />
                        <path d="M12.5 8h2" />
                        <path d="M3.5 3.5l1.5 1.5" />
                        <path d="M11 11l1.5 1.5" />
                        <path d="M11 3.5L9.5 5" />
                        <path d="M3.5 12.5L5 11" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">Disputes</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        For any payment disputes or refund requests, please contact our support team immediately at {import.meta.env.VITE_PRIVACY_EMAIL}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* Trust Section */}
        <section className="mt-14 pt-10 border-t border-slate-200 text-center space-y-6">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Our Security Standards</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-lg">encrypted</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Secure Payments</h3>
                <p className="text-xs text-slate-500 leading-relaxed">PCI-DSS compliant prize pool security.</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-lg">shield_lock</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Encrypted Handling</h3>
                <p className="text-xs text-slate-500 leading-relaxed">End-to-end TLS 1.3 encryption on user data.</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-lg">key</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Account Protection</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Secure hashing algorithms for credentials.</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-lg">verified_user</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Safe Ecosystem</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Vetted tournament rules and host KYC protocols.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl border border-blue-100 shadow-sm p-8 text-center space-y-5 max-w-xl mx-auto"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-xl">contact_support</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Need Privacy Assistance?</h2>
            <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              Our privacy desk is ready to assist with account deletion requests, data package exports, or reports.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-1 max-w-xs mx-auto">
            <button
              onClick={() => window.open(`mailto:${import.meta.env.VITE_PRIVACY_EMAIL}`)}
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

export default PrivacyPolicy;
