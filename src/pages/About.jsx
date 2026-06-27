import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import CountUp from '../components/CountUp';
import { useUser } from '../UserContext.jsx';
import { hasOrganizerRights } from '../utils/iamRoles.js';

function About({ onNavigate }) {
  const { currentUser } = useUser();

  // Animation variants
  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
  };

  const whyChooseUs = [
    {
      icon: 'shield',
      title: 'Uncompromised Fairness',
      desc: 'Built-in anti-cheat guidelines, fair-play matches verification, and automated admin dispute checks.'
    },
    {
      icon: 'lock',
      title: 'Smart Prize Management',
      desc: 'Prize pools are securely locked in smart platform wallets and disbursed instantly to winners.'
    },
    {
      icon: 'sports_esports',
      title: 'End-to-End Hosting',
      desc: 'Brackets seeding, team checks, schedules, and live communication from a single unified panel.'
    }
  ];

  const highlights = [
    { title: 'Tournament Seeding', icon: 'stadium', desc: 'Single elimination, double, and round-robin structures built-in.' },
    { title: 'Host Toolsets', icon: 'dashboard', desc: 'Track player registrations, bracket flows, and lobby alerts.' },
    { title: 'Secure Payouts', icon: 'payments', desc: 'Accept entry fees and award players instantly.' },
    { title: 'Visual Telemetry', icon: 'analytics', desc: 'Real-time turnout reports, bracket completion rates, and cash graphs.' },
    { title: 'Gamer Profile Hubs', icon: 'sports_esports', desc: 'Connect gaming IDs, earn tournament badges, and track match histories.' }
  ];

  const milestones = [
    { year: '2026', title: 'District Launch', desc: 'Match District founded, enabling direct player matching and simple tournaments.' },
    { year: '2026', title: 'Payout Integration', desc: 'Released secure digital wallet payouts to automate prize distribution globally.' },
    { year: '2026', title: 'Global SaaS Expansion', desc: 'Introduced accredited organizer panels, 3D telemetry tracking, and advanced scaling.' }
  ];

  return (
    <div className="min-h-screen bg-background text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      {/* Premium responsive grid background design */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Ambient glow meshes */}
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
      </div>

      {/* Header is now rendered at App level to prevent remount flicker */}

      {/* Main Container */}
      <main className="w-full max-w-4xl mx-auto px-4 pt-20 sm:pt-28 pb-8 sm:pb-14 space-y-16 sm:space-y-24 relative z-10">
        
        {/* 1. Hero / Intro Section */}
        <motion.section 
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="text-center space-y-5 pt-2"
        >

          <h1 className="font-display-lg text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight uppercase leading-tight">
            Bridging Competitive <br />
            Esports and <span className="inline-block bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(99,102,241,0.35)]">Community</span>
          </h1>

          <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Match District is a state-of-the-art competitive gaming network built for players, organizers, and fans. We streamline tournament management, secure prize transactions, and foster gamer portfolios.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 max-w-sm mx-auto">
            <button
              onClick={() => onNavigate && onNavigate('tournaments')}
              className="w-full sm:w-48 px-6 py-3 bg-primary text-on-primary font-headline-md text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-[0_0_15px_rgba(192,193,255,0.25)] flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">stadium</span>
              Tournaments
            </button>
            {hasOrganizerRights(currentUser) ? (
              <button
                onClick={() => onNavigate && onNavigate('org-management')}
                className="w-full sm:w-48 px-6 py-3 bg-green-600 text-white font-headline-md text-xs font-bold rounded-xl hover:bg-green-700 transition-all shadow-[0_0_15px_rgba(34,197,94,0.25)] flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">dashboard</span>
                Host Dashboard
              </button>
            ) : (
              <button
                onClick={() => onNavigate && onNavigate('become-organizer')}
                className="w-full sm:w-48 px-6 py-3 bg-surface-container-high border border-outline-variant/30 text-white font-headline-md text-xs font-bold rounded-xl hover:bg-surface-variant transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">app_registration</span>
                Apply as a Host
              </button>
            )}
          </div>
        </motion.section>


        {/* 2. Mission and Vision Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/20 backdrop-blur-sm relative overflow-hidden group hover:border-primary/20 transition-all min-h-[160px] flex flex-col justify-between">
            <div className="absolute right-[-15px] bottom-[-15px] opacity-[0.02] text-primary pointer-events-none group-hover:scale-105 transition-transform duration-500">
              <span className="material-symbols-outlined text-[140px]">ads_click</span>
            </div>
            <div className="space-y-2 relative z-10">
              <div className="flex items-center gap-2 text-primary font-label-caps text-xs font-bold tracking-wider uppercase">
                <span className="material-symbols-outlined text-lg">ads_click</span> Our Mission
              </div>
              <p className="text-on-surface-variant text-xs leading-relaxed max-w-sm">
                Empower grassroots and professional competitive gaming by providing transparent bracket execution, fair verification standards, and automated rewards.
              </p>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/20 backdrop-blur-sm relative overflow-hidden group hover:border-primary/20 transition-all min-h-[160px] flex flex-col justify-between">
            <div className="absolute right-[-15px] bottom-[-15px] opacity-[0.02] text-primary pointer-events-none group-hover:scale-105 transition-transform duration-500">
              <span className="material-symbols-outlined text-[140px]">visibility</span>
            </div>
            <div className="space-y-2 relative z-10">
              <div className="flex items-center gap-2 text-primary font-label-caps text-xs font-bold tracking-wider uppercase">
                <span className="material-symbols-outlined text-lg">visibility</span> Our Vision
              </div>
              <p className="text-on-surface-variant text-xs leading-relaxed max-w-sm">
                Become the ultimate global digital district that shapes future esports careers, unites regional clans, and secures payouts seamlessly.
              </p>
            </div>
          </div>
        </section>


        {/* 3. Why Choose Us Section */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Why Host or Play</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Why Choose Match District?</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {whyChooseUs.map((item, idx) => (
              <div 
                key={idx}
                className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/15 flex flex-col justify-between space-y-3 hover:border-primary/20 transition-all"
              >
                <div className="w-8.5 h-8.5 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 w-[34px] h-[34px]">
                  <span className="material-symbols-outlined text-base">{item.icon}</span>
                </div>
                <div className="space-y-1">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-white leading-tight">{item.title}</h3>
                  <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* 4. Platform Highlights Section */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Features Highlight</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">End-to-End Tournament Management</h2>
          </div>

          <p className="text-on-surface-variant text-xs sm:text-sm text-center max-w-2xl mx-auto leading-relaxed">
            We provide organizers with all the automated tools they need to host, manage, and distribute prize pools seamlessly — no technical expertise required.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {highlights.map((highlight, idx) => (
              <div 
                key={idx}
                className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-high flex items-center gap-3.5"
              >
                <div className="w-7.5 h-7.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 w-[30px] h-[30px]">
                  <span className="material-symbols-outlined text-sm">{highlight.icon}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-headline-md text-xs font-bold text-white truncate">{highlight.title}</h3>
                  <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">{highlight.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* 5. Stats / Trust Section — hidden during development */}
        <section className="space-y-8 hidden">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Platform Stats</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">Our Competitive Scale</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { icon: 'trophy', label: 'Tournaments Host', end: 2.4, suffix: 'K+', decimals: 1 },
              { icon: 'groups', label: 'Registered Players', end: 187, suffix: 'K+', decimals: 0 },
              { icon: 'corporate_fare', label: 'Active Esports Guilds', end: 1.2, suffix: 'K+', decimals: 1 },
              { icon: 'workspace_premium', label: 'Distributed Prize Pools', end: 2.8, prefix: '$', suffix: 'M+', decimals: 1 },
              { icon: 'sports_esports', label: 'Gaming Titles', end: 15, suffix: '+', decimals: 0 },
              { icon: 'public', label: 'Represented Countries', end: 120, suffix: '+', decimals: 0 }
            ].map((stat, idx) => (
              <div 
                key={idx}
                className="glass-card p-4 rounded-xl border border-outline-variant/35 flex items-center gap-3.5 bg-surface-container-low/20"
              >
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 w-[34px] h-[34px]">
                  <span className="material-symbols-outlined text-base">{stat.icon}</span>
                </div>
                <div>
                  <div className="text-sm sm:text-base font-bold text-white">
                    <CountUp endValue={stat.end} prefix={stat.prefix} suffix={stat.suffix} decimals={stat.decimals} />
                  </div>
                  <div className="text-[10px] text-on-surface-variant font-medium leading-none">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* 6. Values / Milestones Timeline */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] text-primary font-label-caps tracking-wider uppercase font-bold">Our Milestones</span>
            <h2 className="font-display-lg text-xl sm:text-2xl font-extrabold text-white uppercase">The Platform Journey</h2>
          </div>

          <div className="glass-card p-6 sm:p-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low/20 backdrop-blur-sm max-w-md mx-auto">
            <div className="flex flex-col gap-5">
              {milestones.map((milestone, idx) => (
                <div key={idx} className="flex gap-4 items-start relative">
                  {idx !== 2 && (
                    <div className="absolute left-4 top-10 bottom-[-20px] w-[1px] bg-gradient-to-b from-primary/30 to-transparent"></div>
                  )}
                  <div className="w-8.5 h-8.5 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary font-bold text-[10px] shrink-0 w-[32px] h-[32px]">
                    {milestone.year}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-headline-lg text-xs sm:text-sm font-bold text-white">{milestone.title}</h3>
                    <p className="font-body-sm text-[11px] sm:text-xs text-on-surface-variant leading-normal">{milestone.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* 7. Final CTA Section */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="glass-card p-6 sm:p-10 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/5 to-transparent text-center space-y-5 shadow-xl"
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary w-[48px] h-[48px]">
            <span className="material-symbols-outlined text-xl">sports_esports</span>
          </div>

          <div className="space-y-1">
            <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase">Ready to Join the District?</h2>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto">
              Compete in verified tournaments or set up your own organizer credentials today. Let's elevate your game.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-xs mx-auto">
            <button
              onClick={() => onNavigate && onNavigate('register')}
              className="w-full py-3 bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold shadow-md hover:scale-[1.01] transition-transform"
            >
              Sign Up Now
            </button>
            {hasOrganizerRights(currentUser) ? (
              <button
                onClick={() => onNavigate && onNavigate('org-management')}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-headline-md text-xs font-bold shadow-md hover:scale-[1.01] transition-transform"
              >
                Host Dashboard
              </button>
            ) : (
              <button
                onClick={() => onNavigate && onNavigate('become-organizer')}
                className="w-full py-3 bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold"
              >
                Apply as Host
              </button>
            )}
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
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">&copy; 2026 MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default About;
