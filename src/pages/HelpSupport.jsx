import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { DISCORD_INVITE_URL } from '../config/links.js';

function DiscordIcon({ className = 'w-5 h-5', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function HelpSupport({ onNavigate }) {
  const [openFaqId, setOpenFaqId] = useState(null);
  const shouldReduceMotion = useReducedMotion();

  const toggleFaq = (id) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  const supportCategories = [
    {
      id: 'tournaments',
      title: 'Tournament Support',
      icon: 'emoji_events',
      iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      description: 'Registration, tournament schedules, match details, and participation issues.'
    },
    {
      id: 'payments',
      title: 'Payment & Registration',
      icon: 'payments',
      iconColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      description: 'Payment submission, verification delays, and registration status.'
    },
    {
      id: 'account',
      title: 'Account & Technical Issues',
      icon: 'manage_accounts',
      iconColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      description: 'Login, account linking, website errors, and technical difficulties.'
    },
    {
      id: 'organizers',
      title: 'Organizer Assistance',
      icon: 'shield_person',
      iconColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
      description: 'Tournament setup, bracket configuration, and organizer-related questions.'
    },
    {
      id: 'community',
      title: 'Community & Announcements',
      icon: 'campaign',
      iconColor: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      description: 'Platform updates, competitive discussions, and official announcements.'
    }
  ];

  const steps = [
    {
      step: '01',
      title: 'Join the Official Server',
      desc: 'Click the Discord invite link to enter the official MatchDistrict community. The invite works via your web browser or Discord app.'
    },
    {
      step: '02',
      title: 'Navigate to Support Channels',
      desc: 'Browse to the dedicated support channels based on whether you need tournament, payment, account, or organizer help.'
    },
    {
      step: '03',
      title: 'Describe Your Issue',
      desc: 'Provide details such as your tournament name, registered in-game name (IGN), or transaction reference. Include screenshots if applicable.'
    }
  ];

  const faqs = [
    {
      id: 'where-help',
      question: 'Where can I get help with MatchDistrict?',
      answer: 'All support is now centralized in our official MatchDistrict Discord server. Join the community to chat directly with moderators, arbiters, and team members.'
    },
    {
      id: 'tournament-issue',
      question: 'Where should I report a tournament registration issue?',
      answer: 'Join our Discord server and navigate to the tournament support channel. Post your MatchDistrict account name, Tournament ID, and any relevant details or screenshots so staff can assist you promptly.'
    },
    {
      id: 'pending-payment',
      question: 'What should I do if my payment or registration is pending?',
      answer: 'If your payment or slot verification is taking longer than expected, head over to the payment support channel on our Discord server. Share your UPI transaction reference number. For your protection, never share sensitive banking PINs or OTPs.'
    },
    {
      id: 'website-bug',
      question: 'Where can I report a website bug?',
      answer: 'You can report bugs or interface glitches in our technical issues channel on Discord. Please include your browser, device type, and a short explanation or screenshot of what occurred.'
    },
    {
      id: 'need-discord',
      question: 'Do I need Discord to contact MatchDistrict support?',
      answer: 'Yes. Discord is now our primary support destination for real-time communication, rapid dispute resolution, and community announcements. Old website-based submission forms have been retired to ensure all inquiries are handled quickly in one unified hub.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07080C] text-slate-900 dark:text-slate-100 selection:bg-primary selection:text-white relative overflow-x-hidden transition-colors duration-200">
      {/* Background ambient gradient & grid */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #3B82F6 1px, transparent 1px),
              linear-gradient(to bottom, #3B82F6 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px'
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-primary/10 dark:bg-primary/15 blur-[90px] sm:blur-[140px] rounded-full" />
        <div className="absolute top-1/3 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-[#5865F2]/10 blur-[80px] sm:blur-[120px] rounded-full" />
      </div>

      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-16 sm:pb-24 relative z-10 space-y-16 sm:space-y-24">

        {/* 1. HERO SECTION */}
        <motion.section
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center space-y-5 max-w-3xl mx-auto"
        >
          {/* Subtle Discord brand indicator */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#5865F2]/10 text-[#5865F2] dark:text-[#7983F5] border border-[#5865F2]/25 shadow-sm">
            <DiscordIcon className="w-4 h-4 text-[#5865F2] dark:text-[#7983F5]" />
            <span>Official Support Community</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            Need Help? We're on Discord.
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Get assistance with MatchDistrict, tournament registrations, payments, account issues, and competitive events through our official Discord community.
          </p>

          {/* Primary CTA (Immediately visible above the fold) */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the official MatchDistrict Discord server for support"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm sm:text-base shadow-lg shadow-[#5865F2]/25 hover:shadow-xl hover:shadow-[#5865F2]/30 active:scale-[0.98] transition-all cursor-pointer"
            >
              <DiscordIcon className="w-5 h-5 text-white" />
              <span>Join Official Discord</span>
              <span className="material-symbols-outlined text-base">open_in_new</span>
            </a>

            <a
              href="#support-categories"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-sm sm:text-base shadow-sm active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Explore Topics</span>
              <span className="material-symbols-outlined text-base">arrow_downward</span>
            </a>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
            No Discord app installed? The invite link opens seamlessly in your web browser.
          </p>
        </motion.section>


        {/* 2. SUPPORT CATEGORIES */}
        <section id="support-categories" className="space-y-6 scroll-mt-24">
          <div className="text-center sm:text-left space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Assistance Hub</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              What Can We Help You With?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Select a category to learn what assistance is available on our Discord server.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supportCategories.map((cat) => (
              <a
                key={cat.id}
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 hover:border-primary/40 dark:hover:border-primary/40 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cat.iconColor}`}>
                    <span className="material-symbols-outlined text-xl">{cat.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      {cat.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {cat.description}
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary group-hover:translate-x-1 transition-transform pt-1">
                  <span>Get help on Discord</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </a>
            ))}
          </div>
        </section>


        {/* 3. HOW TO GET SUPPORT */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Simple Steps</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              How to Get Support
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Follow these three simple steps to connect with our support team and receive fast resolution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((item, index) => (
              <div
                key={index}
                className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="text-3xl font-black text-slate-200 dark:text-slate-800 leading-none">
                  {item.step}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Security guidance callout */}
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">security</span>
            </div>
            <div className="text-xs sm:text-sm space-y-0.5">
              <span className="font-bold">Protect Your Account & Credentials:</span>
              <p className="text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
                Never post passwords, one-time passwords (OTPs), UPI PINs, or private payment secrets in any server channels or direct messages. MatchDistrict staff will never ask for your confidential authentication codes.
              </p>
            </div>
          </div>
        </section>


        {/* 4. FAQ SECTION */}
        <section className="space-y-6">
          <div className="text-center sm:text-left space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Help & Clarifications</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Common questions regarding our support process and migration to Discord.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`bg-white dark:bg-slate-900/60 rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'border-primary/40 dark:border-primary/40 shadow-sm'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between p-4 sm:p-5 text-left focus:outline-none cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white pr-4 leading-snug">
                      {faq.question}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="material-symbols-outlined text-primary text-xl shrink-0"
                    >
                      expand_more
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={shouldReduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-slate-100 dark:border-white/5 px-4 sm:px-5 pb-5 pt-3.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>


        {/* 5. FINAL CTA SECTION */}
        <section className="rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/5 dark:to-transparent border border-primary/20 p-6 sm:p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#5865F2] text-white flex items-center justify-center mx-auto shadow-md shadow-[#5865F2]/30">
            <DiscordIcon className="w-6 h-6" />
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Join the MatchDistrict Community
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Connect with the community, get help, and stay informed about tournaments and updates.
            </p>
          </div>

          <div className="pt-2">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join MatchDistrict on Discord"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm sm:text-base shadow-lg shadow-[#5865F2]/25 hover:shadow-xl hover:shadow-[#5865F2]/30 active:scale-[0.98] transition-all cursor-pointer"
            >
              <DiscordIcon className="w-5 h-5 text-white" />
              <span>Join MatchDistrict on Discord</span>
              <span className="material-symbols-outlined text-base">open_in_new</span>
            </a>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="w-full bg-white dark:bg-[#07080C] border-t border-slate-200 dark:border-white/10 py-6 px-4">
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-6 border-b border-slate-100 dark:border-white/5 pb-4">
            <button
              onClick={() => onNavigate && onNavigate('terms-service')}
              className="text-xs text-slate-500 hover:text-primary transition-colors font-medium cursor-pointer"
            >
              Terms
            </button>
            <button
              onClick={() => onNavigate && onNavigate('privacy-policy')}
              className="text-xs text-slate-500 hover:text-primary transition-colors font-medium cursor-pointer"
            >
              Privacy
            </button>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-xs text-slate-500 hover:text-primary transition-colors font-medium cursor-pointer"
            >
              Support
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <button
              onClick={() => onNavigate && onNavigate('home')}
              className="text-base font-extrabold text-primary tracking-tight hover:opacity-85 transition-opacity cursor-pointer"
            >
              Match District
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              &copy; {new Date().getFullYear()} MATCH DISTRICT. ALL RIGHTS RESERVED.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HelpSupport;
