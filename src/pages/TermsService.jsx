import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../UserContext.jsx';

function TermsService({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [activeSection, setActiveSection] = useState('acceptance');
  const [isScrolled, setIsScrolled] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  };

  const navItems = [
    { id: 'acceptance', label: 'Acceptance of Terms', icon: 'gpp_maybe' },
    { id: 'eligibility', label: 'Eligibility Requirements', icon: 'check_circle' },
    { id: 'accounts', label: 'Accounts & Credentials', icon: 'account_circle' },
    { id: 'tournaments', label: 'Tournaments & Brackets', icon: 'stadium' },
    { id: 'payouts', label: 'Payouts & Fees', icon: 'account_balance_wallet' },
    { id: 'behavior', label: 'Player Conduct Rules', icon: 'groups' },
    { id: 'disputes', label: 'Disputes & Arbiters', icon: 'gavel' },
    { id: 'intellectual', label: 'Intellectual Property', icon: 'copyright' },
    { id: 'termination', label: 'Account Termination', icon: 'cancel' }
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
    { title: 'Tournament Fairness', desc: 'Standardized check-ins, seedings, and automated bracket resolution.', icon: 'balance' },
    { title: 'Community Standards', desc: 'Zero tolerance for griefing, toxicity, or harassment.', icon: 'groups' },
    { title: 'Safe Organizer Ecosystem', desc: 'All tournament host applicants submit verification KYC reviews.', icon: 'verified_user' }
  ];

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      {/* Premium responsive grid background design */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Ambient glow meshes */}
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
        
        {/* Subtle glowing intersections */}
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
            Terms of Service
          </h1>

          <p className="text-[10px] sm:text-xs text-on-surface-variant/80 font-mono">
            LAST UPDATED: MAY 20, 2026
          </p>

          <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Welcome to the Match District platform. By registering an account, joining lobbies, or hosting community brackets, you agree to comply with our Terms of Service outlined below.
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
            <section id="acceptance" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">gpp_maybe</span>
                1. Acceptance of Terms
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  By logging into Match District, creating matches, or utilizing payment gateway checkouts, you certify that you have read and consent to these Terms, our Privacy Policy, and community game rule guidelines.
                </p>
                <p>
                  We reserve the right to revise these terms as necessary. Continued play in our lobbies represents validation of the modified terms.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section id="eligibility" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">check_circle</span>
                2. Eligibility Requirements
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  To participate in paid tournament brackets, you must:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li>Be at least 13 years of age. Players under 18 require parental supervision.</li>
                  <li>Reside in a jurisdiction where online competitive skill tournaments are legally permitted.</li>
                  <li>Maintain active accounts in good standing on publisher platforms (e.g. Riot, Steam).</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section id="accounts" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">account_circle</span>
                3. Accounts &amp; Credentials
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  You are responsible for keeping your login credentials secure. You agree to link only authentic gaming IDs matching your active profile. Accounts found using fake UIDs or linked smurf profiles will face immediate suspension.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section id="tournaments" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">stadium</span>
                4. Tournaments &amp; Brackets
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  Organizers design their own specific bracket formats and check-in timelines. Match District is not liable for organizer failures, match scheduling shifts, or incorrect lobby seeding parameters. 
                </p>
                <p>
                  However, we maintain quality checks and will sanction organizers who violate structural policies.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section id="payouts" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">account_balance_wallet</span>
                5. Payouts &amp; Fees
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  Ticket purchases and cash disbursements are completed via our payment gateway interfaces.
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li><strong>Prize Vaults:</strong> Funds are locked securely during active play.</li>
                  <li><strong>Ledge Audits:</strong> Disbursements occur 24 hours post lobby resolution to ensure fair-play checks.</li>
                  <li><strong>Fee structures:</strong> Platform maintenance fees are subtracted directly at payout checkout.</li>
                </ul>
              </div>
            </section>

            {/* Section 6 */}
            <section id="behavior" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">groups</span>
                6. Player Conduct Rules
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  Match District strictly bans:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1.5">
                  <li>Software hacks, map script modifications, or DDoS coordination.</li>
                  <li>Toxicity, hate speech, or harassment directed at players or hosts.</li>
                  <li>Match fixing, intentional bracket throws, or lobby collusion.</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section id="disputes" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">gavel</span>
                7. Disputes &amp; Arbiters
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  If score disputes occur, players must upload screenshot logs or client stream records. Accreditated Match District arbiters investigate disputes and render final rulings. By playing, you agree to respect and abide by arbiter rulings.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section id="intellectual" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">copyright</span>
                8. Intellectual Property
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  All assets, brand logos, code structures, and dashboard designs are owned by Match District. You may not copy, scrape, or recreate platform panels without express written permission.
                </p>
              </div>
            </section>

            {/* Section 9 */}
            <section id="termination" className="scroll-mt-24 space-y-3.5">
              <h2 className="text-sm sm:text-base font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">cancel</span>
                9. Account Termination
              </h2>
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/10 space-y-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                <p>
                  We reserve the right to ban players and close profiles that violate conduct policies. Terminated profiles forfeit remaining digital wallet balances linked to active disputes.
                </p>
              </div>
            </section>

          </div>

        </div>

        {/* 4. Security / Trust Section */}
        <section className="space-y-8 pt-8 border-t border-outline-variant/20">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Rule Ecosystem</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">District Rules</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
            <span className="material-symbols-outlined text-xl">gavel</span>
          </div>

          <div className="space-y-1">
            <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase font-extrabold">Need Terms Clarification?</h2>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto">
              Our legal and moderation desks are happy to answer bracket eligibility questions or handle platform dispute filings.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-xs mx-auto">
            <button 
              onClick={() => window.open('mailto:legal@matchdistrict.com')}
              className="w-full py-3 bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold shadow-md hover:scale-[1.01] transition-transform"
            >
              Contact Legal
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

export default TermsService;
