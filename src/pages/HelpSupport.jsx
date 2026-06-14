import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../UserContext.jsx';

function HelpSupport({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openFaqId, setOpenFaqId] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  // Form states
  const [ticketName, setTicketName] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Tournament Registration Issue');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  };

  const supportCategories = [
    { id: 'tournament', label: 'Tournament Support', icon: 'stadium', desc: 'Queries on seedings, match check-ins, or score reports.' },
    { id: 'organizer', label: 'Organizer Help', icon: 'manage_accounts', desc: 'Host guidelines, event setups, and platform tools.' },
    { id: 'payments', label: 'Payment Issues', icon: 'account_balance_wallet', desc: 'Handling entry ticket payouts and wallet cashouts.' },
    { id: 'account', label: 'Account & Login', icon: 'account_circle', desc: 'Linking credentials, Discord auths, or gamer tag updates.' },
    { id: 'reporting', label: 'Match Reporting', icon: 'sports_esports', desc: 'Uploading match results, screenshots, or logs.' },
    { id: 'technical', label: 'Technical Problems', icon: 'construction', desc: 'API connectivity, stream overlaps, or browser crashes.' }
  ];

  const faqs = [
    {
      id: 'join-tournaments',
      category: 'tournament',
      question: 'How do I join tournaments?',
      answer: 'Go to the Tournaments directory, choose the game you want to compete in, and select an active bracket. You can register as a solo free agent or sign up with your pre-made team roster. Make sure your game account is linked in your profile before checking in.'
    },
    {
      id: 'organizer-applications',
      category: 'organizer',
      question: 'How do organizer applications work?',
      answer: 'Head to our "Become an Organizer" section to submit your portal application. We verify tournament host credentials, community sizes, and gaming IDs to protect fair play. Once approved, you gain full bracket management, custom tournament lobbies, and secure prize distribution permissions.'
    },
    {
      id: 'approval-time',
      category: 'organizer',
      question: 'How long does approval take?',
      answer: 'Our accreditation review desk typically evaluates applications within 24 to 48 hours. You will receive an automated email confirmation and a Discord notification as soon as your organizer permissions are fully activated.'
    },
    {
      id: 'payments-secure',
      category: 'payments',
      question: 'Are payments secure?',
      answer: 'Absolutely. Match District secures all entry buy-ins and sponsor transactions in isolated, PCI-DSS compliant vault layers. Prize pools are legally protected and verified automatically before payouts are initialized.'
    },
    {
      id: 'prize-pools-distribution',
      category: 'payments',
      question: 'How are prize pools distributed?',
      answer: "Once bracket organizers submit verified lobby results, our smart ledger runs a 24-hour verification check to ensure fair play. Following validation, the prize funds are disbursed directly to the winning teams' digital Match District wallets."
    },
    {
      id: 'beginners-organizers',
      category: 'organizer',
      question: 'Can beginners become organizers?',
      answer: 'Yes, we welcome organizers of all experience levels! Beginners can start by hosting community matches or single-elimination brackets. We offer extensive onboarding guides, template rulesets, and active moderator support to help you scale.'
    },
    {
      id: 'supported-games',
      category: 'tournament',
      question: 'What games are supported?',
      answer: 'Currently, Match District officially supports BGMI. Support for other games is coming soon based on community demand and organizer requests.'
    },
    {
      id: 'refunds-work',
      category: 'payments',
      question: 'How do refunds work?',
      answer: 'Entry ticket purchases are fully refundable up to 24 hours before a tournament starts. If an organizer cancels or reschedules an event, all registration fees are automatically refunded back to player wallets without delay.'
    },
    {
      id: 'match-dispute',
      category: 'reporting',
      question: 'What happens if a match dispute occurs?',
      answer: 'If a player reports cheating, score manipulation, or lobby connection failures, they can file a dispute ticket inside their active match lobby. An accredited Match District arbiter will review uploaded media evidence and make a final ruling.'
    },
    {
      id: 'contact-support',
      category: 'technical',
      question: 'How can I contact support?',
      answer: 'You can submit a support ticket using the contact form below, start a live chat within your active match lobby, or join our official Discord server for real-time help from our community moderators.'
    }
  ];

  const trustMetrics = [
    { label: 'Avg Response Time', value: '< 12 Mins', desc: 'Fast, verified resolutions.', icon: 'bolt' },
    { label: 'Support Experts', desc: 'Active certified arbiters.', value: '24 / 7', icon: 'support_agent' },
    { label: 'Data Encryption', desc: 'TLS 1.3 socket paths.', value: '100% Safe', icon: 'encrypted' },
    { label: 'Organizer Support', desc: 'Direct host hotline.', value: 'Priority', icon: 'verified_user' }
  ];

  const filteredFaqs = faqs.filter(faq => {
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!ticketName || !ticketEmail || !ticketMessage) return;
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setTicketName('');
      setTicketEmail('');
      setTicketMessage('');
    }, 4500);
  };

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
          className="text-center space-y-5 pt-2 border-b border-outline-variant/10 pb-8"
        >

          <h1 className="font-display-lg text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase leading-tight">
            Help &amp; Support
          </h1>

          <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Have questions about brackets, check-ins, or payouts? Search our guide network or connect with verified arbiters directly.
          </p>

          {/* Search bar */}
          <div className="max-w-md mx-auto relative pt-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">search</span>
            <input 
              type="text" 
              placeholder="Search help articles or FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-primary transition-all focus:ring-2 focus:ring-primary/10 placeholder-on-surface-variant/60"
            />
          </div>
        </motion.section>

        {/* Support Categories Section */}
        <section className="space-y-6">
          <div className="text-center sm:text-left space-y-1">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Directories</span>
            <h2 className="font-display-lg text-lg sm:text-xl font-extrabold text-white uppercase">Support Categories</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {supportCategories.map((cat, idx) => (
              <div 
                key={idx}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  handleScrollTo('faq-anchor');
                }}
                className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/15 flex flex-col justify-between space-y-4 hover:border-primary/30 transition-all hover:-translate-y-0.5 cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors shrink-0">
                  <span className="material-symbols-outlined text-base">{cat.icon}</span>
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-white leading-tight">{cat.label}</h3>
                  <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{cat.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-primary font-bold group-hover:underline">
                  Browse FAQs <span className="material-symbols-outlined text-xs">arrow_right_alt</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq-anchor" className="scroll-mt-24 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-variant/10 pb-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Solutions</span>
              <h2 className="font-display-lg text-lg sm:text-xl font-extrabold text-white uppercase">Frequently Asked Questions</h2>
            </div>
            
            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 justify-start w-full">
              <button 
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all shrink-0 border ${
                  selectedCategory === 'all' 
                    ? 'bg-primary text-on-primary border-primary shadow-sm shadow-primary/20' 
                    : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-white hover:bg-surface-container/50'
                }`}
              >
                All
              </button>
              {supportCategories.map(cat => (
                <button 
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all shrink-0 border ${
                    selectedCategory === cat.id 
                      ? 'bg-primary text-on-primary border-primary shadow-sm shadow-primary/20' 
                      : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-white hover:bg-surface-container/50'
                  }`}
                >
                  {cat.label.replace(' Support', '').replace(' Help', '').replace(' Issues', '').replace(' Problems', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Accordion List */}
          <div className="space-y-3 max-w-3xl mx-auto">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq) => {
                const isOpen = openFaqId === faq.id;
                return (
                  <div 
                    key={faq.id}
                    className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                      isOpen 
                        ? 'border-primary/45 bg-surface-container shadow-[0_0_20px_rgba(99,102,241,0.12)]' 
                        : 'border-outline-variant/20 bg-surface-container-low hover:border-outline-variant/40 hover:bg-surface-variant'
                    }`}
                  >
                    <button 
                      onClick={() => toggleFaq(faq.id)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left transition-colors focus:outline-none touch-manipulation"
                    >
                      <span className="font-headline-md text-xs sm:text-sm font-bold text-white pr-4 leading-normal select-none">{faq.question}</span>
                      <motion.span 
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="material-symbols-outlined text-primary text-base select-none shrink-0"
                      >
                        expand_more
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-outline-variant/10 px-4 pb-4 sm:px-5 sm:pb-5 pt-3 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-on-surface-variant text-xs sm:text-sm border border-dashed border-outline-variant/20 rounded-xl">
                No matching FAQ guides found. Try searching for other terms.
              </div>
            )}
          </div>
        </section>

        {/* Response Metrics / Trust Section */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
          {trustMetrics.map((metric, idx) => (
            <div 
              key={idx}
              className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/15 text-center space-y-2"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto shrink-0 w-[28px] h-[28px]">
                <span className="material-symbols-outlined text-sm">{metric.icon}</span>
              </div>
              <div className="space-y-0.5">
                <p className="font-display-lg text-sm sm:text-base font-extrabold text-white leading-none">{metric.value}</p>
                <p className="font-label-caps text-[9px] text-primary uppercase font-bold leading-none">{metric.label}</p>
                <p className="font-body-sm text-[10px] text-on-surface-variant/80">{metric.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Contact & Support Section */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-8 border-t border-outline-variant/20 items-start">
          
          {/* Support Channels Column */}
          <div className="md:col-span-5 space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Channels</span>
              <h2 className="font-display-lg text-lg sm:text-xl font-extrabold text-white uppercase">Direct Contact</h2>
            </div>
            
            <div className="space-y-3">
              {/* Email */}
              <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/15 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-sm">mail</span>
                </div>
                <div>
                  <h4 className="font-headline-md text-xs font-bold text-white">Email Address</h4>
                  <a href="mailto:support@matchdistrict.com" className="font-body-sm text-[11px] sm:text-xs text-primary hover:underline">support@matchdistrict.com</a>
                </div>
              </div>

              {/* Discord */}
              <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/15 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-sm">forum</span>
                </div>
                <div>
                  <h4 className="font-headline-md text-xs font-bold text-white">Discord Guild</h4>
                  <a href="https://discord.gg/matchdistrict" target="_blank" rel="noreferrer" className="font-body-sm text-[11px] sm:text-xs text-primary hover:underline">discord.gg/matchdistrict</a>
                </div>
              </div>

              {/* Live Chat */}
              <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/15 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-sm">chat</span>
                </div>
                <div>
                  <h4 className="font-headline-md text-xs font-bold text-white">Lobby Live Chat</h4>
                  <p className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant">Active inside all match interface lobbies.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Submission Form Column */}
          <div className="md:col-span-7">
            <div className="glass-card p-5 sm:p-7 rounded-2xl border border-outline-variant/30 bg-surface-container-low/20 space-y-4">
              <h3 className="font-display-lg text-sm sm:text-base font-extrabold text-white uppercase text-center sm:text-left">Submit Ticket</h3>

              <AnimatePresence mode="wait">
                {isSubmitted ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-center space-y-2"
                  >
                    <span className="material-symbols-outlined text-emerald-400 text-3xl animate-bounce">check_circle</span>
                    <h4 className="font-headline-md text-xs sm:text-sm font-bold text-white">Ticket Submitted Successfully</h4>
                    <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant">Our game arbiters will contact your registered email address shortly.</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleFormSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Your Name</label>
                        <input 
                          type="text" 
                          required
                          value={ticketName}
                          onChange={(e) => setTicketName(e.target.value)}
                          className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-primary transition-all placeholder-on-surface-variant/40"
                          placeholder="Player name" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Email Address</label>
                        <input 
                          type="email" 
                          required
                          value={ticketEmail}
                          onChange={(e) => setTicketEmail(e.target.value)}
                          className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-primary transition-all placeholder-on-surface-variant/40"
                          placeholder="name@email.com" 
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Issue Category</label>
                      <select 
                        value={ticketCategory}
                        onChange={(e) => setTicketCategory(e.target.value)}
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-primary transition-all"
                      >
                        <option>Tournament Registration Issue</option>
                        <option>Match Dispute / Cheating Report</option>
                        <option>Prize Pool &amp; Wallet Payouts</option>
                        <option>Account Verification / Login</option>
                        <option>Other General Inquiry</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Description</label>
                      <textarea 
                        required
                        value={ticketMessage}
                        onChange={(e) => setTicketMessage(e.target.value)}
                        rows="3"
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-primary transition-all placeholder-on-surface-variant/40"
                        placeholder="Detail bracket round or player ID details..."
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-3 bg-primary text-on-primary hover:bg-primary-hover rounded-xl font-headline-md text-xs font-bold shadow-md hover:scale-[1.01] active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                    >
                      <span>Submit Ticket</span>
                      <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                  </form>
                )}
              </AnimatePresence>
            </div>
          </div>

        </section>

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

export default HelpSupport;
