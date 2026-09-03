import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../UserContext.jsx';
import { hasOrganizerRights } from '../utils/iamRoles.js';

const features = [
  "Host tournaments",
  "Bracket generation",
  "Prize distribution",
  "Registration forms",
  "Match analytics",
  "Organizer profile",
];

const faqs = [
  {
    question: "How do payouts work for paid entry tournaments?",
    answer: "We handle the payment collection securely via our platform. Once the tournament concludes, prize pools are automatically distributed to the winners' platform wallets instantly, minus our standard processing fee."
  },
  {
    question: "Can I customize the registration form for my events?",
    answer: "Yes, Pro and Enterprise organizers can add custom fields to their registration forms to collect specific player IDs, Discord tags, or custom questions required for your event."
  },
  {
    question: "Do you support bracket generation?",
    answer: "Absolutely. We offer single-elimination, double-elimination, and round-robin brackets. Brackets are automatically generated once registration closes and update in real-time as match results are reported."
  },
  {
    question: "Is there a limit on the number of participants?",
    answer: "The Free plan supports up to 100 participants per tournament. Pro and Enterprise plans offer unlimited participants, scaling effortlessly with your community size."
  }
];

const OrganizerShowcase = ({ onNavigate }) => {
  const { currentUser } = useUser();
  const [openFaq, setOpenFaq] = useState(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 }
    }
  };

  return (
    <section id="organizer-showcase" className="relative w-full pt-6 pb-10 sm:pt-10 sm:pb-16 md:pt-12 md:pb-24 overflow-hidden bg-background isolate">
      {/* Cinematic Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full opacity-50 mix-blend-screen"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[500px] bg-tertiary/10 blur-[150px] rounded-full opacity-40 mix-blend-screen"></div>
      </div>

      <div className="max-w-container-max mx-auto px-4 sm:px-lg relative z-10">

        {/* Hero Showcase Section */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-8 mb-12 lg:mb-24">

          {/* Left Content */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="w-full lg:w-1/2 space-y-6 text-center lg:text-left pt-0"
          >
            <motion.h2 variants={itemVariants} className="font-display-lg text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
              Run eSports Tournaments <br className="hidden lg:block" />
              <span className="inline-block bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">Like a Pro</span>
            </motion.h2>

            <motion.p variants={itemVariants} className="font-body-lg text-xs sm:text-sm md:text-base text-on-surface-variant max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Powerful tools for organizers to manage tournaments, teams, brackets, payments, analytics, and growth — all from one premium dashboard.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-4">
              {hasOrganizerRights(currentUser) ? (
                <button
                  onClick={() => onNavigate && onNavigate('org-management')}
                  className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-green-600 text-white font-headline-md text-[11px] sm:text-sm font-bold rounded-xl hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] border border-green-500/20 flex items-center justify-center gap-2 group"
                >
                  Manage Tournaments
                  <span className="material-symbols-outlined text-sm sm:text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              ) : (
                <button
                  onClick={() => onNavigate && onNavigate('become-organizer')}
                  className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-primary text-on-primary font-headline-md text-[11px] sm:text-sm font-bold rounded-xl hover:bg-primary/95 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(192,193,255,0.4)] border border-primary/20 flex items-center justify-center gap-2 group"
                >
                  Start Hosting Free
                  <span className="material-symbols-outlined text-sm sm:text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              )}
              <button
                onClick={() => onNavigate && onNavigate('tournaments')}
                className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-surface-container-low/50 backdrop-blur-md text-white font-headline-md text-[11px] sm:text-sm font-bold rounded-xl hover:bg-surface-variant/80 border border-outline-variant/30 hover:border-primary/50 transition-all flex items-center justify-center gap-2"
              >
                Explore Dashboard
              </button>
            </motion.div>

            <motion.div variants={itemVariants} className="pt-6 flex items-center justify-center lg:justify-start gap-4 text-xs font-body-sm text-on-surface-variant/80">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-6 h-6 rounded-full border border-background bg-surface-variant flex items-center justify-center overflow-hidden z-[${4 - i}]`}>
                    <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="avatar" />
                  </div>
                ))}
              </div>
              <p>Trusted by <strong className="text-white">1.2K+</strong> competitive gaming communities</p>
            </motion.div>
          </motion.div>

          {/* Right Content - Interactive Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: 15, perspective: 1000 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
            className="w-full lg:w-1/2 relative h-[300px] sm:h-[400px] md:h-[500px] flex items-center justify-center lg:justify-end"
          >
            {/* 3D Dashboard Mockup Container */}
            <motion.div
              whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative w-full max-w-[600px] h-[250px] sm:h-[350px] md:h-[450px] rounded-2xl border border-outline-variant/30 bg-surface-container/60 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col transform-gpu"
            >
              {/* Mockup Header */}
              <div className="h-12 border-b border-outline-variant/20 flex items-center px-4 gap-4 bg-surface-container-high/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-error/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>
                <div className="h-6 w-48 bg-surface-container-highest rounded-md border border-outline-variant/20 flex items-center px-2 gap-1.5">
                  <span className="material-symbols-outlined text-[10px] text-on-surface-variant/50">search</span>
                  <span className="text-[10px] font-medium text-on-surface-variant/70 leading-none select-none">matchdistrict.in</span>
                </div>
              </div>

              {/* Mockup Body */}
              <div className="flex-1 p-4 sm:p-6 grid grid-cols-12 gap-4 relative overflow-hidden">

                {/* Floating Analytics Card */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="col-span-8 bg-surface-container-low border border-primary/20 rounded-xl p-4 shadow-lg relative z-10 flex flex-col justify-between"
                >
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="text-[10px] text-on-surface-variant font-label-caps uppercase tracking-wider mb-1">Total Revenue</div>
                      <div className="text-xl font-bold text-white font-prize-display">₹1,24,500</div>
                    </div>
                    <div className="px-2 py-1 bg-green-500/10 text-green-400 text-[10px] rounded font-bold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[12px]">trending_up</span> 14%
                    </div>
                  </div>

                  {/* Fake Chart Lines */}
                  <div className="h-16 w-full flex items-end gap-1 sm:gap-2">
                    {[30, 50, 40, 70, 60, 90, 80].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${h}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className="flex-1 bg-gradient-to-t from-primary/10 to-primary/80 rounded-t-sm"
                      ></motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* Right Side Widgets */}
                <div className="col-span-4 space-y-4">
                  {/* Active Tourney Widget */}
                  <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
                    className="bg-surface-container-low border border-primary/20 rounded-xl p-3 shadow-lg relative z-10"
                  >
                    <div className="text-[9px] text-primary font-label-caps font-bold mb-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> ACTIVE
                    </div>
                    <div className="text-xs font-bold text-white truncate">Valorant Masters</div>
                    <div className="text-[10px] text-on-surface-variant mt-1">64/64 Teams</div>
                    <div className="w-full bg-surface-variant h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="w-full h-full bg-primary"></div>
                    </div>
                  </motion.div>

                  {/* Registrations Widget */}
                  <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-3 shadow-lg relative z-10">
                    <div className="text-[9px] text-on-surface-variant font-label-caps mb-2">Recent Regs</div>
                    <div className="space-y-2">
                      {[1, 2].map(i => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-surface-container-highest"></div>
                          <div className="h-2 w-16 bg-surface-container-highest rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Absolute positioning glowing orb inside dashboard */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 blur-[60px] rounded-full pointer-events-none z-0"></div>
              </div>
            </motion.div>

            {/* Decorative Floating Elements */}
            <motion.div
              animate={{ y: [-15, 15], rotate: [0, 5] }}
              transition={{ repeat: Infinity, duration: 6, repeatType: "reverse" }}
              className="absolute -right-4 lg:-right-10 top-10 glass-card p-3 rounded-xl border border-white/10 shadow-2xl backdrop-blur-xl bg-surface-container-low/40 z-20 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                <span className="material-symbols-outlined text-[16px]">done_all</span>
              </div>
              <div>
                <div className="text-xs font-bold text-white">Match Resolved</div>
                <div className="text-[10px] text-on-surface-variant">Automated</div>
              </div>
            </motion.div>

            {/* Decorative Floating Elements */}
            <motion.div
              animate={{ y: [15, -15], rotate: [0, -5] }}
              transition={{ repeat: Infinity, duration: 7, repeatType: "reverse", delay: 1 }}
              className="absolute -left-4 lg:-left-10 bottom-10 glass-card p-3 rounded-xl border border-white/10 shadow-2xl backdrop-blur-xl bg-surface-container-low/40 z-20 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
              </div>
              <div>
                <div className="text-xs font-bold text-white">Payout Sent</div>
                <div className="text-[10px] text-on-surface-variant">₹50,000 to Team X</div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-12 lg:mb-24"
        >
          {features.map((feat, idx) => (
            <div key={idx} className="glass-card bg-surface-container-low/20 backdrop-blur-sm p-3 sm:p-4 rounded-xl flex items-center gap-2 sm:gap-3 hover:bg-surface-container-low/50 hover:border-primary/30 transition-all duration-300">
              <span className="material-symbols-outlined text-primary text-base sm:text-xl shrink-0">check_circle</span>
              <span className="font-body-md text-[11px] sm:text-sm text-white font-medium leading-tight">{feat}</span>
            </div>
          ))}
        </motion.div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto pb-8">
          <div className="text-center mb-8">
            <h2 className="font-display-lg text-xl sm:text-2xl lg:text-3xl text-white font-extrabold tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                initial={false}
                className="border border-outline-variant/20 bg-surface-container-low rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-3 sm:p-4 text-left hover:bg-surface-variant transition-colors"
                >
                  <span className="font-headline-md text-[11px] sm:text-sm font-bold text-white pr-4">{faq.question}</span>
                  <span className={`material-symbols-outlined text-primary transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="p-3 sm:p-4 pt-0 text-[11px] sm:text-sm text-on-surface-variant leading-relaxed border-t border-outline-variant/10">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};

export default OrganizerShowcase;
