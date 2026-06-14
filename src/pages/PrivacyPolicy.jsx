import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../UserContext.jsx';

function PrivacyPolicy({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [activeSection, setActiveSection] = useState('collect');
  const [isScrolled, setIsScrolled] = useState(false);

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
    { id: 'contact', label: 'Contact Information', icon: 'contact_support' }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
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
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 90;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setActiveSection(id);
    }
  };

  const trustBadges = [
    { title: 'Secure Payments', desc: 'PCI-DSS compliant prize pool security.', icon: 'encrypted' },
    { title: 'Encrypted Handling', desc: 'End-to-end TLS 1.3 encryption on user data.', icon: 'shield_lock' },
    { title: 'Account Protection', desc: 'Secure hashing algorithms for credentials.', icon: 'key' },
    { title: 'Safe Ecosystem', desc: 'Vetted tournament rules and host KYC protocols.', icon: 'verified_user' }
  ];

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      {/* Premium responsive grid background design */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Ambient glow meshes */}
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
      </div>

      {/* Header rendered persistently at App level */}

      {/* Main Container */}
      <main className="w-full max-w-4xl mx-auto px-4 pt-20 sm:pt-28 pb-8 sm:pb-14 space-y-12 sm:space-y-16 relative z-10">

        {/* Hero Section */}
        <motion.section 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 pt-2 border-b border-outline-variant/10 pb-8"
        >

          <h1 className="font-display-lg text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase leading-tight">
            Privacy Policy
          </h1>

          <p className="text-[10px] sm:text-xs text-on-surface-variant/80 font-mono">
            LAST UPDATED: MAY 20, 2026
          </p>

          <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            At Match District, we prioritize user trust and transparency. This policy outlines exactly how we gather, encrypt, and manage player data to maintain a safe competitive gaming district.
          </p>
        </motion.section>

        {/* Responsive Layout wrapper */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Mobile TOC Swiper / Navigation Bar (Visible on < lg screens) */}
          <div className="lg:hidden w-full overflow-x-auto no-scrollbar py-2.5 border-y border-outline-variant/20 flex gap-2 shrink-0">
            {navItems.map(item => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleScrollTo(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase shrink-0 transition-all border ${
                    isActive 
                      ? 'bg-primary text-on-primary border-primary shadow-sm' 
                      : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Desktop Table of Contents Sidebar (Visible on >= lg screens) */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-24 space-y-4">
            <div className="glass-card p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/20 space-y-3">
              <span className="font-label-caps text-[10px] font-bold text-primary tracking-wider uppercase block">Document Sections</span>
              
              <div className="flex flex-col gap-1">
                {navItems.map(item => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleScrollTo(item.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all ${
                        isActive 
                          ? 'bg-primary/10 text-primary border-l-2 border-primary pl-2.5' 
                          : 'text-on-surface-variant hover:text-white hover:bg-surface-container/50 border-l-2 border-transparent'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Policy Contents Column */}
          <div className="lg:col-span-8 space-y-8 sm:space-y-12">
            
            {/* Section 1 */}
            <section id="collect" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">inventory_2</span>
                1. Information We Collect
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  To host competitive lobbies and distribute prize money, we collect information you provide directly:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li><strong>Account Metadata:</strong> Username, email address, password hashes, and phone numbers.</li>
                  <li><strong>Gaming Identifiers:</strong> Game client publisher IDs (e.g. Riot ID, SteamID, BGMI Character UID) to verify bracket matches.</li>
                  <li><strong>KYC Documentation:</strong> Verified identity documents uploaded by tournament hosts to conform with fraud auditing standards.</li>
                </ul>
              </div>
            </section>

            {/* Section 2 */}
            <section id="use" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">psychology</span>
                2. How We Use Data
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  Your information is handled strictly for gaming execution and security compliance:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li>Generating brackets, managing seeding positions, and coordinating match check-ins.</li>
                  <li>Preventing competitive integrity violations (smurfing, script hacking, double-registrations).</li>
                  <li>Calculating, processing, and recording cash prize payouts.</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section id="cookies" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">cookie</span>
                3. Cookies &amp; Tracking
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  We utilize cookies and local browser storage to keep you securely signed in across sessions, preserve custom dashboard panel presets, and collect anonymous server performance telemetry.
                </p>
                <p>
                  You can disable cookie collection in your browser parameters, though this will sign you out and limit dashboard access speeds.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section id="payments" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">account_balance_wallet</span>
                4. Payment Information
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  All tournament buy-ins, tickets, and payout transfers are managed securely. We process cards, banks, and UPI transactions via audited payment gateways.
                </p>
                <p>
                  We do not store your direct raw bank credentials or credit card numbers on our local databases.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section id="security" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">gpp_good</span>
                5. Security Measures
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  We deploy premium digital security protections: TLS 1.3 transmission encryptions, salted password hashing, access tokens validation, and automated firewall checks. 
                </p>
                <p>
                  In the event of a detected server security incident, we alert affected profiles within 72 hours under global compliance guidelines.
                </p>
              </div>
            </section>

            {/* Section 6 */}
            <section id="rights" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">person_search</span>
                6. User Rights
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  As a player in our district, you hold full authority over your data parameters:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li><strong>Review &amp; Access:</strong> Download a package containing all details linked to your gamer tag.</li>
                  <li><strong>Rectification:</strong> Edit and update your personal coordinates directly from your Profile settings.</li>
                  <li><strong>Erase Data:</strong> Request deletion of your account metadata and historical logs at any time.</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section id="third-party" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">hub</span>
                7. Third-Party Services
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  We synchronize match logs with external game API endpoints (e.g. Steam Match API) to verify winners. These third parties maintain independent privacy agreements which we encourage players to review.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section id="retention" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">history</span>
                8. Data Retention
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  We store account coordinates only as long as your profile remains active. Unused, inactive profiles with no tournament logs are flagged and automatically deleted after 2 years.
                </p>
              </div>
            </section>

            {/* Section 9 */}
            <section id="contact" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">contact_support</span>
                9. Contact Information
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  If you have concerns, queries, or requests regarding this Privacy Policy, connect with our DPO (Data Protection Officer):
                </p>
                <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/40 space-y-1">
                  <p className="font-semibold text-white">Match District Privacy Team</p>
                  <p>Email: <a href="mailto:privacy@matchdistrict.com" className="text-primary hover:underline">privacy@matchdistrict.com</a></p>
                  <p>Address: Tech Hub, Sector-V, Kolkata, India</p>
                </div>
              </div>
            </section>

          </div>

        </div>

        {/* 4. Security / Trust Section */}
        <section className="space-y-8 pt-8 border-t border-outline-variant/20">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Data Trust</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Our Security Standards</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {trustBadges.map((badge, idx) => (
              <div 
                key={idx}
                className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/15 flex flex-col justify-between space-y-3 hover:border-primary/20 transition-all text-center sm:text-left"
              >
                <div className="w-8.5 h-8.5 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto sm:mx-0 shrink-0 w-[34px] h-[34px]">
                  <span className="material-symbols-outlined text-base">{badge.icon}</span>
                </div>
                <div className="space-y-1">
                  <h3 className="font-headline-md text-xs font-bold text-white leading-tight">{badge.title}</h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant leading-relaxed">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Contact / Support Section */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="glass-card p-6 sm:p-10 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/5 to-transparent text-center space-y-5 shadow-xl max-w-xl mx-auto"
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary w-[48px] h-[48px]">
            <span className="material-symbols-outlined text-xl">contact_support</span>
          </div>

          <div className="space-y-1">
            <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase font-extrabold">Need Privacy Assistance?</h2>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto">
              Our privacy desk is ready to assist with account deletion requests, data package exports, or reports.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-xs mx-auto">
            <button 
              onClick={() => window.open('mailto:privacy@matchdistrict.com')}
              className="w-full py-3 bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold shadow-md hover:scale-[1.01] transition-transform"
            >
              Contact Support
            </button>
            <button 
              onClick={() => onNavigate && onNavigate('help-support')} 
              className="w-full py-3 bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold"
            >
              Help Center
            </button>
          </div>
        </motion.section>

      </main>

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

export default PrivacyPolicy;
