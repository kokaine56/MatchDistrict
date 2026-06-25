import React, { useRef } from 'react';
import { ArrowRight, ShieldCheck, Lock, Clock, Trophy, Users, Zap } from 'lucide-react';

export const OrganizerOnboarding = () => {
  const advantagesRef = useRef(null)

  const scrollToAdvantages = () => {
    advantagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen px-4 py-12 bg-gradient-to-b from-indigo-50/50 via-white to-slate-50 sm:px-6 lg:px-8 font-sans antialiased">

      {/* --- HERO SECTION --- */}
      <div className="max-w-3xl mx-auto text-center mt-8 sm:mt-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          BECOME AN <br className="sm:hidden" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            ORGANIZER
          </span>
        </h1>

        <p className="max-w-2xl mx-auto mt-6 text-base text-slate-600 sm:text-lg lg:text-xl leading-relaxed">
          Host tournaments, manage brackets, and secure prize payouts. Unlock professional toolsets to grow your competitive gaming community.
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-center justify-center gap-4 mt-10 sm:flex-row sm:gap-6">
          <button className="flex items-center justify-center w-full px-8 py-4 text-base font-bold text-white transition-all shadow-lg sm:w-auto bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-0.5">
            Start Application <ArrowRight className="w-5 h-5 ml-2" />
          </button>
          <button
            onClick={scrollToAdvantages}
            className="flex items-center justify-center w-full px-8 py-4 text-base font-bold transition-all bg-white border-2 sm:w-auto text-indigo-600 border-indigo-100 rounded-xl hover:bg-indigo-50 hover:border-indigo-200"
          >
            Explore Perks
          </button>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-10 text-sm font-medium text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            <span>Verified Accreditation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-emerald-500" />
            <span>Secure Payouts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Reviews under 24h</span>
          </div>
        </div>
      </div>

      {/* --- ADVANTAGES SECTION --- */}
      <div ref={advantagesRef} className="max-w-5xl mx-auto mt-24 mb-16">
        <div className="text-center mb-12">
          <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">Advantages</span>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">EXCLUSIVE HOST BENEFITS</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">

          {/* Benefit Card 1 */}
          <div className="p-6 transition-all bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-100">
            <div className="flex items-center justify-center w-12 h-12 mb-5 bg-indigo-50 rounded-xl">
              <Trophy className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Host Tournaments Easily</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Set up brackets, manage registrations, and run your events smoothly with our intuitive organizer dashboard.
            </p>
          </div>

          {/* Benefit Card 2 */}
          <div className="p-6 transition-all bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-100">
            <div className="flex items-center justify-center w-12 h-12 mb-5 bg-emerald-50 rounded-xl">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Grow Your Community</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Attract top-tier competitive gamers, build a loyal following, and establish your organization&apos;s brand.
            </p>
          </div>

          {/* Benefit Card 3 */}
          <div className="p-6 transition-all bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-100">
            <div className="flex items-center justify-center w-12 h-12 mb-5 bg-amber-50 rounded-xl">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Automated Payouts</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Forget manual transfers. Prize pools are mathematically secured and distributed automatically to verified winners.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default OrganizerOnboarding;
