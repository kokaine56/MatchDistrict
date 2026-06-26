import React from 'react';
import { ArrowRight, Trophy, Users, Zap } from 'lucide-react';

export const OrganizerOnboarding = () => {
  return (
    <div className="min-h-screen py-8 sm:py-12 bg-slate-50 font-sans overflow-x-hidden">
      
      <div className="max-w-7xl mx-auto text-center mt-6 sm:mt-16 px-4 sm:px-6 lg:px-8">
        
        <h1 className="text-lg sm:text-xl md:text-3xl lg:text-4xl xl:text-5xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap max-w-full">
          Become an organiser
        </h1>
        
        <p className="max-w-4xl mx-auto mt-4 sm:mt-6 text-sm text-slate-600 sm:text-xl leading-relaxed">
          Host tournaments, manage brackets, and secure payouts. Unlock professional toolsets to grow your competitive gaming community.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 mt-8 sm:mt-10 sm:flex-row sm:gap-6">
          <button className="flex items-center justify-center w-full px-6 py-3.5 text-sm sm:text-base font-bold text-white transition-all shadow-md sm:w-auto bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5">
            Start Application <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
          </button>
          <button className="flex items-center justify-center w-full px-6 py-3.5 text-sm sm:text-base font-bold transition-all bg-white border-2 sm:w-auto text-indigo-600 border-indigo-100 rounded-xl hover:bg-indigo-50">
            Explore Perks
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-8 sm:mt-12 text-xs sm:text-sm font-medium text-slate-500">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-[10px] sm:text-xs">✓</div>
            <span>Verified Accreditation</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] sm:text-xs">✓</div>
            <span>Secure Payouts</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-[10px] sm:text-xs">✓</div>
            <span>Reviews under 24h</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-20 sm:mt-24 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-12">
          <span className="text-xs sm:text-sm font-bold tracking-wider text-indigo-600 uppercase">Advantages</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 sm:text-4xl">EXCLUSIVE HOST BENEFITS</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-8 lg:grid-cols-3">
          <div className="p-6 sm:p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <Trophy className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-4 sm:mb-5 text-indigo-600" />
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Host Easily</h3>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-slate-500">Create brackets and run tournaments smoothly without the manual hassle.</p>
          </div>
          <div className="p-6 sm:p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <Users className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-4 sm:mb-5 text-emerald-600" />
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Grow Community</h3>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-slate-500">Attract competitive players and build your organization&apos;s loyal brand following.</p>
          </div>
          <div className="p-6 sm:p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <Zap className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-4 sm:mb-5 text-amber-600" />
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Automated Payouts</h3>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-slate-500">Prize pools are mathematically secured and distributed automatically to verified winners.</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-24 mb-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <span className="text-xs sm:text-sm font-bold tracking-wider text-indigo-600 uppercase">Onboarding</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 sm:text-4xl">VERIFICATION STEPS</h2>
        </div>

        <div className="flex flex-col items-center justify-center md:flex-row md:items-start md:justify-between max-w-4xl mx-auto">
          
          <div className="flex flex-col items-center w-full md:w-64 text-center">
            <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 mb-4 sm:mb-5 text-lg sm:text-xl font-bold text-indigo-600 bg-indigo-50 border-4 border-white rounded-full shadow-sm z-10">01</div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Submit Form</h3>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-500">Fill in details, organization image, and identity documents.</p>
          </div>

          <div className="hidden md:block flex-1 h-0.5 bg-slate-200 mt-7 mx-4"></div>
          <div className="md:hidden w-full flex justify-center my-2 sm:my-4">
            <div className="w-0.5 h-8 sm:h-12 bg-slate-200"></div>
          </div>

          <div className="flex flex-col items-center w-full md:w-64 text-center">
            <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 mb-4 sm:mb-5 text-lg sm:text-xl font-bold text-indigo-600 bg-indigo-50 border-4 border-white rounded-full shadow-sm z-10">02</div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Review &amp; Verify</h3>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-500">Admins verify your documents and KYC status within 24 hours.</p>
          </div>

          <div className="hidden md:block flex-1 h-0.5 bg-slate-200 mt-7 mx-4"></div>
          <div className="md:hidden w-full flex justify-center my-2 sm:my-4">
            <div className="w-0.5 h-8 sm:h-12 bg-slate-200"></div>
          </div>

          <div className="flex flex-col items-center w-full md:w-64 text-center">
            <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 mb-4 sm:mb-5 text-lg sm:text-xl font-bold text-indigo-600 bg-indigo-50 border-4 border-white rounded-full shadow-sm z-10">03</div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Access Portal</h3>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-500">Accreditation granted. Open your dashboard to build brackets.</p>
          </div>

        </div>
      </div>
    </div>
  );
};

