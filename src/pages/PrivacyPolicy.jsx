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
    { id: 'third-party', label: 'Third-Party Services', icon: 'hub' },
    { id: 'retention', label: 'Data Retention', icon: 'history' },
    { id: 'contact', label: 'Contact Information', icon: 'contact_support' },
    { id: 'escrow', label: 'Tournament Escrow & Money', icon: 'account_balance' },
    { id: 'refund', label: 'Refund & Cancellation', icon: 'undo' }
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
        <div className="lg:flex lg:gap-10">

          {/* Desktop Sidebar */}
          <aside className="hidden lg:block lg:w-[260px] lg:shrink-0 sticky top-24 self-start space-y-4">
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
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Name of the user</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Email address</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Phone number</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
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
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Name</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Phone number</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 sm:col-span-2">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Government ID Proof (such as a PAN card, driving license, or other official government IDs) for identity verification</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                        <span className="text-sm text-slate-700">Location data (specific State and District)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section id="use" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">psychology</span>
                  </span>
                  2. How We Use Data
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  User data is processed strictly for identity verification, securing prize distribution via UPI, fraud prevention, and ensuring competitive integrity on the platform.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section id="cookies" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">cookie</span>
                  </span>
                  3. Cookies &amp; Tracking
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We utilize cookies and local browser storage to keep you securely signed in across sessions, preserve custom dashboard panel presets, and collect anonymous server performance telemetry.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  You can disable cookie collection in your browser parameters, though this will sign you out and limit dashboard access speeds.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section id="payments" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                  </span>
                  4. Payment Information
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  All tournament buy-ins, tickets, and payout transfers are managed securely. We process cards, banks, and UPI transactions via audited payment gateways.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We do not store your direct raw bank credentials or credit card numbers on our local databases.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section id="security" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">gpp_good</span>
                  </span>
                  5. Security Measures
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We deploy premium digital security protections: TLS 1.3 transmission encryptions, salted password hashing, access tokens validation, and automated firewall checks.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  In the event of a detected server security incident, we alert affected profiles within 72 hours under global compliance guidelines.
                </p>
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
            <section id="third-party" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">hub</span>
                  </span>
                  7. Third-Party Services
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We synchronize match logs with external game API endpoints (e.g. Steam Match API) to verify winners. These third parties maintain independent privacy agreements which we encourage players to review.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section id="retention" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">history</span>
                  </span>
                  8. Data Retention
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We store account coordinates only as long as your profile remains active. Unused, inactive profiles with no tournament logs are flagged and automatically deleted after 2 years.
                </p>
              </div>
            </section>

            {/* Section 9 */}
            <section id="contact" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">contact_support</span>
                  </span>
                  9. Contact Information
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  If you have concerns, queries, or requests regarding this Privacy Policy, connect with our DPO (Data Protection Officer):
                </p>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
                  <p className="font-semibold text-slate-800">Match District Privacy Team</p>
                  <p className="text-sm text-slate-600">Email: <a href="mailto:privacy@matchdistrict.com" className="text-blue-600 hover:underline font-medium">privacy@matchdistrict.com</a></p>
                  <p className="text-sm text-slate-600">Address: Tech Hub, Sector-V, Kolkata, India</p>
                </div>
              </div>
            </section>

            {/* Section 10 */}
            <section id="escrow" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">account_balance</span>
                  </span>
                  10. Tournament Escrow &amp; Money Management
                </h2>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Secure Wallets</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    All user deposits, entry fees, and prize allocations are managed through secure user accounts linked via integrated Indian payment gateways (RazorPay/Cashfree).
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Escrow Period</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    To guarantee competitive integrity, tournament entry fees are securely held by Match District during the tournament lifespan and an additional 24-hour dispute window post-completion before being released.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">KYC Safeguards</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    In absolute compliance with Indian financial guidelines, funds cannot be withdrawn to a user's personal bank account or UPI address until their Government ID Verification (Front &amp; Back) has been officially approved.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 11 */}
            <section id="refund" className="scroll-mt-28">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">undo</span>
                  </span>
                  11. Refund and Cancellation Policy (Gateway Compliant)
                </h2>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Platform/Organizer Cancellations</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    If a tournament is cancelled by the organizer or due to platform technical failures before its formal start time, a 100% refund of the entry fee will be automatically initiated to the user's platform balance or original source of payment.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Participant No-Shows &amp; Forfeits</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    No refunds will be issued if a participant fails to check-in, misses their scheduled match window, or is disqualified due to cheating, toxicity, or violating competitive rules.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Failed Gateway Transactions</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    In the event of a double-debit or a failed transaction where money is deducted from a user's bank account/UPI but not credited to the Match District wallet, the funds will be automatically rolled back to the original source payment method by the payment gateway provider within 5 to 7 business days.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Refund Processing Timeline</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Approved operational refunds initiated by Match District are processed immediately on our end. Depending on the user's banking partner or payment method (UPI, NetBanking, Debit/Credit Card), the refunded amount will reflect in the original source account within 5–7 operational business days.
                  </p>
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
              onClick={() => window.open('mailto:privacy@matchdistrict.com')}
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
