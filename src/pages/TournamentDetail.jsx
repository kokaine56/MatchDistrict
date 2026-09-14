import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useUser } from '../UserContext.jsx';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js';
import { fetchJsonWithRetry, normalizeTournamentRow } from '../utils/api.js';
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle.js';
import { supabase } from '../utils/supabaseClient';
import { getAuthToken } from '../utils/getAuthToken.js';
import { uploadImage } from '../utils/cloudinaryUpload.js';
import VerificationBadge from '../components/VerificationBadge.jsx';
import { DEFAULT_CATEGORIES } from '../components/tournament-creation/steps/Step7Rules.jsx';
import { formatDate, formatDateTime } from '../utils/timeFormat';
import SponsorCardItem from '../components/SponsorCardItem.jsx';
import RoomSlotGrid from '../components/RoomSlotGrid.jsx';
import { generateTournamentShareCard, ensureShareTemplateReady, dataURLToFile, downloadDataURL } from '../utils/shareCardImage.js';
import TournamentLeaderboard from '../components/TournamentLeaderboard.jsx';

import gameBgmi from '../assets/supported_games/bgmi.png';
import gameFreeFire from '../assets/supported_games/freefire.png';
import gameCodm from '../assets/supported_games/codm.png';
import gameValorant from '../assets/supported_games/valorant.png';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80';

const GAME_BADGE = {
  bgmi: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'battlegrounds mobile india': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  valorant: 'bg-red-500/20 text-red-400 border-red-500/30',
  codm: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'cod mobile': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'free fire': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cs2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'counter-strike 2': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const GAME_LOGOS = {
  bgmi: gameBgmi,
  'battlegrounds mobile india': gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant
};

function getGameBadge(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_BADGE[key] || 'bg-primary/20 text-primary border-primary/25';
}

// Helper to resolve dynamic class list strings cleanly
const clsx = (...classes) => classes.filter(Boolean).join(' ');

function getGameLogo(game) {
  const key = (game || '').toLowerCase().trim();
  return GAME_LOGOS[key] || null;
}

function getDetailPageTheme(themeKey) {
  const config = getThemeConfig(themeKey)
  
  // Use the native glow color but reduce opacity for large auras
  // Example config.glowColor: "rgba(59, 130, 246, 0.15)"
  const aura1 = config.glowColor.replace(/0\.\d+\)/, '0.12)')
  const aura2 = config.glowColor.replace(/0\.\d+\)/, '0.08)')
  
  return {
    bg: config.pageBg || '#07080C',
    auras: [
      `radial-gradient(circle at 15% 15%, ${aura1} 0%, transparent 65%)`,
      `radial-gradient(circle at 85% 65%, ${aura2} 0%, transparent 65%)`
    ],
    gridColor: `rgba(255, 255, 255, 0.03)`
  }
}

const formatRoadmapDateDetails = (dateStr) => {
  if (!dateStr) return { weekday: '', dateFormatted: 'TBD' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { weekday: '', dateFormatted: String(dateStr) };
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { weekday, dateFormatted };
  } catch (_) {
    return { weekday: '', dateFormatted: String(dateStr) };
  }
};

const formatRoadmapTimeIST = (timeStr, dateStr) => {
  if (!timeStr) return 'TBD';
  const cleanTime = String(timeStr).trim();

  let hours = NaN;
  let minutes = NaN;

  const match24 = cleanTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else if (dateStr) {
    try {
      const combined = new Date(`${dateStr}T${cleanTime}`);
      if (!isNaN(combined.getTime())) {
        hours = combined.getHours();
        minutes = combined.getMinutes();
      }
    } catch (_) {}
  }

  if (isNaN(hours) || isNaN(minutes)) {
    if (/AM|PM/i.test(cleanTime)) {
      return cleanTime.includes('IST') ? cleanTime : `${cleanTime} IST`;
    }
    return cleanTime;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const formattedHours = String(displayHours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');

  return `${formattedHours}:${formattedMinutes} ${period} IST`;
};

const DesktopRoadmapView = ({ roadmap }) => {
  const N = roadmap.length;
  const stepY = 190;
  const startY = 80;
  // Ample vertical padding so the final round card is never cut off or cropped
  const totalHeight = Math.max(380, (N - 1) * stepY + 260);

  // Left nodes at x = 260 (26%), Right nodes at x = 740 (74%)
  const getCoords = (index) => {
    if (N === 1) return { x: 500, y: startY };
    const x = index % 2 === 0 ? 260 : 740;
    const y = index * stepY + startY;
    return { x, y };
  };

  // Build continuous cubic bezier S-curve SVG path
  let pathD = '';
  if (N > 1) {
    const p0 = getCoords(0);
    pathD = `M ${p0.x} ${p0.y}`;
    for (let i = 0; i < N - 1; i++) {
      const curr = getCoords(i);
      const next = getCoords(i + 1);
      const midY = (curr.y + next.y) / 2;
      pathD += ` C ${curr.x} ${midY}, ${next.x} ${midY}, ${next.x} ${next.y}`;
    }
  }

  return (
    <div className="relative w-full max-w-5xl mx-auto pb-12 select-none" style={{ height: `${totalHeight}px` }}>
      {/* Winding SVG Route */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
        viewBox={`0 0 1000 ${totalHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="realGoldenRoadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A5A00" />
            <stop offset="25%" stopColor="#C69214" />
            <stop offset="50%" stopColor="#FFE082" />
            <stop offset="75%" stopColor="#E6B93C" />
            <stop offset="100%" stopColor="#9E740E" />
          </linearGradient>
          <filter id="royalGoldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {pathD && (
          <>
            {/* Dark Golden Asphalt Road Shoulder / Base */}
            <path
              d={pathD}
              fill="none"
              stroke="#3A2800"
              strokeWidth="34"
              strokeLinecap="round"
              opacity="0.8"
              filter="url(#royalGoldGlow)"
            />
            {/* Outer Metallic Golden Curb Edges */}
            <path
              d={pathD}
              fill="none"
              stroke="#8A5A00"
              strokeWidth="28"
              strokeLinecap="round"
              opacity="0.9"
            />
            {/* Main Solid Golden Highway Surface */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#realGoldenRoadGrad)"
              strokeWidth="22"
              strokeLinecap="round"
            />
            {/* Animated Golden Surface Glow */}
            <motion.path
              d={pathD}
              fill="none"
              stroke="#FFF4C2"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.25"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: "easeInOut" }}
            />
            {/* Real Highway Center Divider (Painted Dashed White Lane Lines) */}
            <motion.path
              d={pathD}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeDasharray="8 16"
              strokeLinecap="round"
              opacity="1"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: "easeInOut" }}
              className="drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]"
            />
          </>
        )}
      </svg>

      {/* Render Milestones and All Info Cards Openly on Desktop */}
      {roadmap.map((round, i) => {
        const { x, y } = getCoords(i);
        const isLeft = N === 1 ? true : i % 2 === 0;
        const { weekday, dateFormatted } = formatRoadmapDateDetails(round.date);
        const formattedTime = formatRoadmapTimeIST(round.time, round.date);

        return (
          <React.Fragment key={i}>
            {/* Milestone Circular Node */}
            <div
              className="absolute z-20 cursor-pointer"
              style={{
                top: `${y}px`,
                left: `${x / 10}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative flex items-center justify-center group"
              >
                {/* Outer Metallic Gold Ring */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFF4C2] via-[#E6B93C] to-[#8A5A00] p-0.5 shadow-[0_0_20px_rgba(230,185,60,0.7)] group-hover:shadow-[0_0_28px_rgba(255,216,106,1)] transition-all">
                  {/* Inner Gold Center */}
                  <div className="w-full h-full rounded-full bg-gradient-to-b from-[#D4A017] via-[#B8860B] to-[#8A5A00] flex items-center justify-center border border-[#FFF4C2]/60">
                    <span className="text-sm font-black text-[#FFFFFF] select-none">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Pure Royal Gold Information Card (ALWAYS VISIBLE ON DESKTOP) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: isLeft ? -15 : 15 }}
              whileInView={{ opacity: 1, scale: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.12 }}
              className="absolute z-30"
              style={{
                top: `${y}px`,
                left: N === 1 ? '58%' : isLeft ? '3%' : '77%',
                width: N === 1 ? '38%' : '20%',
                minWidth: '200px',
                transform: 'translateY(-50%)',
              }}
            >
              <div className="bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border-2 border-[#FFF4C2] rounded-xl p-3.5 shadow-[0_10px_30px_rgba(212,160,23,0.5)] backdrop-blur-md">
                <div className="space-y-1 text-xs text-[#FFFFFF]">
                  {weekday && <p className="font-bold text-[#FFFFFF] text-xs sm:text-sm leading-tight">{weekday}</p>}
                  <p className="font-bold text-[#FFFFFF] text-xs sm:text-sm leading-tight">{dateFormatted}</p>
                  <p className="font-bold text-[#FFFFFF] text-xs sm:text-sm leading-tight">{formattedTime}</p>
                  <p className="font-bold text-[#FFFFFF] text-xs sm:text-sm leading-tight">
                    Map: <span className="font-black text-[#FFFFFF]">{round.map || 'TBD'}</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const MobileRoadmapView = ({ roadmap }) => {
  const N = roadmap.length;
  const stepY = 160;
  const startY = 60;
  const totalHeight = Math.max(340, (N - 1) * stepY + 220);

  const [activeRound, setActiveRound] = useState(0);

  // Weave milestone x positions between 260px (72% right) and 100px (28% left) for a curved road
  const getCoords = (index) => {
    if (N === 1) return { x: 180, y: startY };
    const x = index % 2 === 0 ? 260 : 100;
    const y = index * stepY + startY;
    return { x, y };
  };

  let pathD = '';
  if (N > 1) {
    const p0 = getCoords(0);
    pathD = `M ${p0.x} ${p0.y}`;
    for (let i = 0; i < N - 1; i++) {
      const curr = getCoords(i);
      const next = getCoords(i + 1);
      const midY = (curr.y + next.y) / 2;
      pathD += ` C ${curr.x} ${midY}, ${next.x} ${midY}, ${next.x} ${next.y}`;
    }
  }

  return (
    <div className="relative w-full max-w-[430px] mx-auto select-none pb-12 overflow-hidden" style={{ height: `${totalHeight}px` }}>
      {/* Mobile Winding Curved SVG Path */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
        viewBox={`0 0 360 ${totalHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="mobGoldenRoadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A5A00" />
            <stop offset="30%" stopColor="#D4A017" />
            <stop offset="70%" stopColor="#FFE082" />
            <stop offset="100%" stopColor="#9E740E" />
          </linearGradient>
          <filter id="mobGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {pathD && (
          <>
            {/* Dark Golden Asphalt Base */}
            <path
              d={pathD}
              fill="none"
              stroke="#3A2800"
              strokeWidth="26"
              strokeLinecap="round"
              opacity="0.8"
              filter="url(#mobGlow)"
            />
            {/* Outer Metallic Golden Curbs */}
            <path
              d={pathD}
              fill="none"
              stroke="#8A5A00"
              strokeWidth="20"
              strokeLinecap="round"
              opacity="0.9"
            />
            {/* Main Solid Golden Highway Surface */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#mobGoldenRoadGrad)"
              strokeWidth="15"
              strokeLinecap="round"
            />
            {/* Real Highway Center Divider (Painted Dashed White Lane Lines) */}
            <motion.path
              d={pathD}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeDasharray="8 14"
              strokeLinecap="round"
              opacity="1"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              className="drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]"
            />
          </>
        )}
      </svg>

      {/* Render Mobile Milestones & Floating Tap-to-Reveal Cards */}
      {roadmap.map((round, i) => {
        const { x, y } = getCoords(i);
        const isLeftNode = i % 2 !== 0; // index 1, 3 are on left (x=100)
        const isActive = activeRound === i;
        const { weekday, dateFormatted } = formatRoadmapDateDetails(round.date);
        const formattedTime = formatRoadmapTimeIST(round.time, round.date);

        return (
          <React.Fragment key={i}>
            {/* Milestone Circular Node Marker */}
            <div
              className="absolute z-20 cursor-pointer"
              style={{
                top: `${y}px`,
                left: `${(x / 360) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={() => setActiveRound(prev => prev === i ? null : i)}
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                whileHover={{ scale: 1.15 }}
                className="relative flex flex-col items-center justify-center cursor-pointer group"
              >
                {/* Active Pulsing Aura */}
                {isActive && (
                  <span className="absolute w-12 h-12 rounded-full bg-[#FFD86A] opacity-50 animate-ping pointer-events-none" />
                )}

                {/* Pure Circular Milestone Node */}
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br from-[#FFF4C2] via-[#E6B93C] to-[#8A5A00] p-0.5 shadow-[0_0_16px_rgba(230,185,60,0.7)] transition-all ${isActive ? 'scale-110 shadow-[0_0_24px_rgba(255,216,106,1)]' : ''}`}>
                  <div className="w-full h-full rounded-full bg-gradient-to-b from-[#D4A017] via-[#B8860B] to-[#8A5A00] flex items-center justify-center border border-[#FFF4C2]/60">
                    <span className="text-xs font-black text-[#FFFFFF] select-none">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Expandable Pure Royal Gold Info Card */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -10 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute z-30"
                  style={{
                    top: `${y + 24}px`,
                    left: isLeftNode ? '16px' : 'auto',
                    right: isLeftNode ? 'auto' : '16px',
                    width: '185px',
                  }}
                >
                  <div className="bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border-2 border-[#FFF4C2] rounded-xl p-3 shadow-[0_10px_28px_rgba(212,160,23,0.6)] backdrop-blur-md">
                    <div className="space-y-1 text-xs text-[#FFFFFF]">
                      {weekday && <p className="font-bold text-[#FFFFFF] text-[11px] leading-tight">{weekday}</p>}
                      <p className="font-bold text-[#FFFFFF] text-[11px] leading-tight">{dateFormatted}</p>
                      <p className="font-bold text-[#FFFFFF] text-[11px] leading-tight">{formattedTime}</p>
                      <p className="font-bold text-[#FFFFFF] text-[11px] leading-tight">
                        Map: <span className="font-black text-[#FFFFFF]">{round.map || 'TBD'}</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const RoyalGoldRoadmap = ({ roadmap }) => {
  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="p-6 rounded-xl border w-full bg-[#3D2800]/90 border-[#FFE082]/40 text-white text-center font-bold shadow-md">
        No roadmap rounds scheduled yet.
      </div>
    );
  }

  return (
    <div className="w-full relative py-6 sm:py-10 px-2 sm:px-4 select-none">
      {/* DESKTOP / TABLET (md and up): Alternating S-Curve Winding Journey */}
      <div className="hidden md:block relative w-full">
        <DesktopRoadmapView roadmap={roadmap} />
      </div>

      {/* MOBILE (below md): Vertical Winding Journey with Tap-to-Reveal */}
      <div className="block md:hidden relative w-full">
        <MobileRoadmapView roadmap={roadmap} />
      </div>
    </div>
  );
};

const RoadmapRoundCard = ({ round, index }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_1px_6px_rgba(15,23,42,0.06)] w-full sm:w-auto sm:shrink-0">
    <h4 className="text-sm font-black text-slate-900 mb-1.5 truncate" title={round.title || `Qualifier ${index + 1}`}>
      {round.title || `Qualifier ${index + 1}`}
    </h4>

    <div className="space-y-1 text-xs text-slate-500">
      <p className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{round.date ? formatRoadmapDateDetails(round.date).dateFormatted : 'TBD'}</span>
      </p>
      <p className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{formatRoadmapTimeIST(round.time, round.date)}</span>
      </p>
      <p className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>Map: <span className="font-semibold text-slate-700">{round.map || 'TBD'}</span></span>
      </p>
    </div>

    {round.qualified ? (
      <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] font-bold text-emerald-600 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Qualifies: {round.qualified}</span>
      </div>
    ) : null}
  </div>
);

const ResponsiveRoadmap = ({ roadmap }) => {
  const N = (roadmap || []).length;

  if (N === 0) {
    return (
      <div className="p-4 sm:p-5 rounded-lg border border-slate-200 bg-white shadow-[0_1px_6px_rgba(15,23,42,0.06)] text-sm text-slate-400">
        No roadmap rounds scheduled yet.
      </div>
    );
  }

  return (
    <div className="w-full select-none">
      {/* Mobile: vertical timeline, one qualifier after another */}
      <div className="flex sm:hidden flex-col">
        {roadmap.map((round, index) => (
          <React.Fragment key={round.id || index}>
            <RoadmapRoundCard round={round} index={index} />
            {index < N - 1 && (
              <div className="flex justify-center py-1" aria-hidden="true">
                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Desktop/tablet: horizontal content-sized progression */}
      <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-hide touch-pan-x">
        {roadmap.map((round, index) => (
          <React.Fragment key={round.id || index}>
            <RoadmapRoundCard round={round} index={index} />
            {index < N - 1 && (
              <svg className="w-4 h-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

function TournamentDetail({ onNavigate, tournamentId }) {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sponsorList, setSponsorList] = useState([]);
  const [totalSponsorAmount, setTotalSponsorAmount] = useState(0);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [sponsorForm, setSponsorForm] = useState({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' });
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  const [sponsorScreenshot, setSponsorScreenshot] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [sponsorStep, setSponsorStep] = useState(1);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [shareGenerating, setShareGenerating] = useState(false);
  const shareCardRef = useRef(null);
  const shareInProgressRef = useRef(false);

  // Custom states for premium sponsors cards interaction
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [frozenCards, setFrozenCards] = useState({});

  const getCardType = (amt) => {
    if (amt >= 1000) return 'OBSIDIAN_ELITE';
    if (amt >= 500) return 'DIAMOND_PREFERRED';
    if (amt >= 250) return 'GOLD_ELITE';
    if (amt >= 100) return 'SILVER_PLUS';
    return 'EMERALD_PRESTIGE';
  };

  const getCardTagName = (amt) => {
    if (amt >= 1000) return 'OBSIDIAN ELITE';
    if (amt >= 500) return 'DIAMOND PREFERRED';
    if (amt >= 250) return 'GOLD ELITE';
    if (amt >= 100) return 'SILVER PLUS';
    return 'EMERALD PRESTIGE';
  };

  const handleToggleFreeze = (cardId) => {
    setFrozenCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Seed frozen state demonstration
  useEffect(() => {
    if (sponsorList.length > 0) {
      const initialFrozen = {};
      sponsorList.forEach((s, idx) => {
        const cardId = s.id || `spn-${idx}`;
        if (idx === 1) {
          initialFrozen[cardId] = true;
        }
      });
      setFrozenCards(prev => ({ ...initialFrozen, ...prev }));
    }
  }, [sponsorList]);

  // Search and tabs states
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const teamsPerPage = 6;

  const [hoveredStar, setHoveredStar] = useState(0);
  const [userRating, setUserRating] = useState(0);
  const [hostRating, setHostRating] = useState(4.9);
  const [reviewsCount, setReviewsCount] = useState(42);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [notices, setNotices] = useState([]);
  
  // Secured coordinates credentials state
  const [lobbyCredentials, setLobbyCredentials] = useState(null);
  const [lobbyError, setLobbyError] = useState('');
  const [isLobbyLoading, setIsLobbyLoading] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState('');
  const [revealTimeReached, setRevealTimeReached] = useState(false);

  // Organizer profile & follow state
  const [orgProfile, setOrgProfile] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Countdown state
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [openRule, setOpenRule] = useState(null);

  const [currentUser] = useCurrentUser();
  const { signOut } = useUser();

  // Autofill sponsor form with user profile when modal opens for logged-in users
  useEffect(() => {
    if (!showSponsorForm || !currentUser) return;
    setSponsorForm(prev => ({
      ...prev,
      name: currentUser.name || currentUser.gamerTag || '',
      email: currentUser.email || ''
    }));
  }, [showSponsorForm, currentUser]);

  const [slotsData, setSlotsData] = useState({ slotsTotal: 100, slotsFilled: 0, slotsAvailable: 100, slots: [] });

  const fetchRegistrations = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const token = await getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, { headers });
      const data = await res.json();
      if (data.success && data.registrations) setRegistrations(data.registrations);
    } catch (_) {}
  }, [tournamentId]);

  const fetchSlots = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/slots`);
      const data = await res.json();
      if (data.success) setSlotsData(data);
    } catch (_) {}
  }, [tournamentId]);

  useEffect(() => {
    fetchRegistrations();
    fetchSlots();
  }, [fetchRegistrations, fetchSlots]);

  useRefetchOnFocus(fetchRegistrations, !!tournamentId);
  useRefetchOnFocus(fetchSlots, !!tournamentId);

  const [tournamentsList, setTournamentsList] = useState([]);
  const [tournamentRow, setTournamentRow] = useState(null);
  const [isTournamentsLoading, setIsTournamentsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) { setIsTournamentsLoading(false); return; }
    setIsTournamentsLoading(true);
    setLoadError(null);
    const { ok, data, error } = await fetchJsonWithRetry(`/api/tournaments/${tournamentId}`);
    if (ok && data?.success && data.tournament) setTournamentRow(data.tournament);
    else { setTournamentRow(null); setLoadError(error?.message || data?.message || 'Failed to load tournament'); }
    setIsTournamentsLoading(false);
  }, [tournamentId]);

  const loadTournamentsList = useCallback(async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments');
    if (ok && data?.success && data.tournaments) setTournamentsList(data.tournaments);
  }, []);

  useEffect(() => { loadTournament(); }, [loadTournament]);
  useEffect(() => { loadTournamentsList(); }, [loadTournamentsList]);

  useRefetchOnFocus(loadTournament, !!tournamentId);
  useRefetchOnFocus(loadTournamentsList);

  useEffect(() => {
    if (!tournamentId) return;
    const channel = supabase
      .channel(`tournament-detail-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, (payload) => {
        if (payload.eventType === 'INSERT') setTournamentsList(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') { setTournamentsList(prev => prev.map(t => t.id === payload.new.id ? payload.new : t)); if (payload.new.id === tournamentId) setTournamentRow(payload.new); }
        else if (payload.eventType === 'DELETE') setTournamentsList(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_registrations', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setRegistrations(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setRegistrations(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
        else if (payload.eventType === 'DELETE') setRegistrations(prev => prev.filter(r => r.id !== payload.old.id));
        fetch(`/api/tournaments/${tournamentId}/slots`).then(res => res.json()).then(data => { if (data.success) setSlotsData(data); }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_notices', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setNotices(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setNotices(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
        else if (payload.eventType === 'DELETE') setNotices(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_messages', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setChatMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setChatMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        else if (payload.eventType === 'DELETE') setChatMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[REALTIME] Channel tournament-detail-${tournamentId} status:`, status, err);
          fetchRegistrations();
          fetchSlots();
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, fetchRegistrations, fetchSlots]);

  const tourney = useMemo(() => normalizeTournamentRow(tournamentRow), [tournamentRow]);
  const isSponsorsEnabled = tourney?.sponsors_enabled === true || tourney?.sponsors_enabled === 'true';

  // Fetch organizer profile + follower count when tourney loads
  useEffect(() => {
    if (!tourney || !tourney.orgId) return;
    const orgId = tourney.orgId;
    fetch(`/api/users/${orgId}`, { headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.json()).then(d => { if (d?.user || d?.id) setOrgProfile(d.user || d); }).catch(() => {});
    fetch(`/api/org/followers/${orgId}`)
      .then(r => r.json()).then(d => { if (d?.count !== undefined) setFollowerCount(d.count); }).catch(() => {});
  }, [tourney?.orgId]);

  // Fetch approved sponsor data for public wall
  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/tournament/${tournamentId}/sponsors/public`)
      .then(r => r.json()).then(d => {
        if (d.success) { setSponsorList(d.sponsors || []); setTotalSponsorAmount(d.totalContributions || 0); }
      }).catch(() => {});
  }, [tournamentId]);

  // Main countdown timer
  useEffect(() => {
    if (!tourney) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' }); return; }
    let target = null; let label = ''; let type = '';
    const now = new Date();
    const lifecycle = getTournamentLifecycleStatus(tourney, now);
    if (lifecycle === 'archived' || lifecycle === 'completed') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Tournament Ended', active: true, type: 'ended' }); return; }
    if (lifecycle === 'live') { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'LIVE NOW', active: true, type: 'live' }); return; }
    const regOpen = tourney.registrationOpenDate ? new Date(tourney.registrationOpenDate) : null;
    const regClose = tourney.registrationCloseDate ? new Date(tourney.registrationCloseDate) : null;
    const startDate = tourney.startDate ? new Date(tourney.startDate) : null;
    if (regOpen && now < regOpen) {
      target = regOpen; label = 'Registration opens in'; type = 'regOpen';
    } else if (regClose && now < regClose) {
      target = regClose; label = 'Registration closes in'; type = 'registration';
    } else if (startDate && now < startDate) {
      target = startDate; label = 'Tournament Starts In'; type = 'start';
    } else { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: '', active: false, type: '' }); return; }
    
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Starting Soon', active: true, type: type }); return; }
      setCountdown({ days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), label, active: true, type });
    };
    tick(); const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [tourney]);

  // Coordinates decryption timer logic
  useEffect(() => {
    if (!tourney) return;
    
    const checkReveal = () => {
      if (tourney.reveal_credentials === true || tourney.reveal_credentials === 'true') {
        setRevealTimeReached(true);
        return;
      }
      
      let targetTime = null;
      if (tourney.lobby_start_time) {
        const lTime = new Date(tourney.lobby_start_time);
        if (!isNaN(lTime.getTime())) {
          targetTime = lTime;
        }
      }
      
      if (!targetTime && tourney.startDate) {
        const sTime = new Date(tourney.startDate);
        if (!isNaN(sTime.getTime())) {
          targetTime = new Date(sTime.getTime() - 15 * 60 * 1000);
        }
      }
      
      if (!targetTime) {
        setRevealTimeReached(false);
        setRevealCountdown('');
        return;
      }
      
      const diff = targetTime.getTime() - Date.now();
      if (diff <= 0) {
        setRevealTimeReached(true);
        setRevealCountdown('');
      } else {
        setRevealTimeReached(false);
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        setRevealCountdown(`${mins}m ${secs}s`);
      }
    };
    
    checkReveal();
    const interval = setInterval(checkReveal, 1000);
    return () => clearInterval(interval);
  }, [tourney]);

  const parsedTimeline = useMemo(() => {
    if (!tourney || !tourney.timeline) return { dates: [], roadmap: [] };
    try {
      const parsed = typeof tourney.timeline === 'string' ? JSON.parse(tourney.timeline) : tourney.timeline;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed)) return { dates: parsed, roadmap: [] };
        return { dates: parsed.dates || [], roadmap: parsed.roadmap || [] };
      }
    } catch (e) { console.error('Error parsing tournament timeline:', e); }
    return { dates: [], roadmap: [] };
  }, [tourney]);

  const announcements = useMemo(() => {
    if (notices && notices.length > 0) return notices.map(n => ({ id: n.id, title: n.title, text: n.text, pin: n.pin, time: n.created_at ? formatDate(n.created_at) : 'Today' }));
    return [];
  }, [notices]);

  const allTeams = useMemo(() => {
    return registrations.map(r => {
      let parsedMembers = [];
      try { parsedMembers = typeof r.members === 'string' ? JSON.parse(r.members) : (r.members || []); } catch (e) { parsedMembers = []; }
      return {
        id: r.id, name: r.team_name,
        logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=100&q=80',
        winRate: 'N/A',
        rank: r.status === 'approved' || r.status === 'confirmed' ? 'Active Squad' : r.status === 'waitlisted' ? 'Waitlisted' : 'Pending Verification',
        captain: r.captain.startsWith('@') ? r.captain : `@${r.captain}`,
        verified: r.status === 'approved' || r.status === 'confirmed',
        status: r.status === 'approved' ? 'Approved' : r.status === 'confirmed' ? 'Confirmed' : r.status === 'rejected' ? 'Rejected' : r.status === 'waitlisted' ? 'Waitlisted' : r.status === 'pending_payment' ? 'Pending Payment' : r.status === 'cancelled' ? 'Cancelled' : r.status === 'expired' ? 'Expired' : 'Pending Approval',
        members: parsedMembers, user_id: r.user_id
      };
    });
  }, [registrations]);

  const filteredTeams = useMemo(() => {
    return allTeams.filter(team => {
      const matchSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase()) || team.captain.toLowerCase().includes(searchQuery.toLowerCase());
      if (teamFilter === 'all') return matchSearch;
      if (teamFilter === 'verified') return matchSearch && team.verified;
      if (teamFilter === 'approved') return matchSearch && team.status === 'Approved';
      if (teamFilter === 'pending') return matchSearch && (team.status === 'Pending' || team.status === 'Pending Approval' || team.status === 'Pending Payment');
      if (teamFilter === 'waitlisted') return matchSearch && team.status === 'Waitlisted';
      return matchSearch;
    });
  }, [searchQuery, teamFilter, allTeams]);

  // Sliced teams list based on current page
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * teamsPerPage;
    return filteredTeams.slice(start, start + teamsPerPage);
  }, [filteredTeams, currentPage, teamsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / teamsPerPage));

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, teamFilter]);

  const myRoster = useMemo(() => {
    if (!currentUser || registrations.length === 0) return null;
    // Find the newest registration first by searching from the end of the array
    for (let i = registrations.length - 1; i >= 0; i--) {
      const r = registrations[i];
      const matchUserId = r.user_id === currentUser.id;
      const matchEmail = currentUser.email && r.email && r.email.toLowerCase() === currentUser.email.toLowerCase();
      const captainLower = (r.captain || '').toLowerCase();
      const gt = (currentUser.gamerTag || '').toLowerCase();
      const nm = (currentUser.name || '').toLowerCase();
      const matchCaptain = captainLower === gt || captainLower === `@${gt}` || captainLower === nm;
      
      if (matchUserId || matchEmail || matchCaptain) {
        return r;
      }
    }
    return null;
  }, [currentUser, registrations]);


  // Safe case-insensitive approved check for coordinates access
  const isApprovedRoster = useMemo(() => {
    if (!myRoster) return false;
    const status = (myRoster.status || '').toLowerCase();
    return status === 'approved' || status === 'confirmed';
  }, [myRoster]);

  const triggerToast = (msg) => { setToastMessage(msg); setShowToast(true); setTimeout(() => setShowToast(false), 4000); };

  const handleRateHost = (ratingValue) => {
    setUserRating(ratingValue);
    const newCount = reviewsCount + (userRating > 0 ? 0 : 1);
    const newAverage = parseFloat(((hostRating * reviewsCount + ratingValue - (userRating > 0 ? userRating : 0)) / newCount).toFixed(1));
    setHostRating(newAverage);
    setReviewsCount(newCount);
    triggerToast(`Thanks for rating this host ${ratingValue} stars!`);
  };

  const handleSponsorContribute = async (e) => {
    e.preventDefault();
    if (!sponsorForm.name.trim() || !sponsorForm.amount || parseInt(sponsorForm.amount) <= 0) { triggerToast('Please enter your name and a valid contribution amount.'); return; }
    if (!sponsorForm.transaction_id.trim()) { triggerToast('Please enter your UPI transaction ID for verification.'); return; }
    setSponsorSubmitting(true);
    try {
      let screenshot_url = '';
      if (sponsorScreenshot) {
        const uploaded = await uploadImage(sponsorScreenshot);
        if (uploaded && typeof uploaded === 'string') screenshot_url = uploaded;
      }
      const res = await fetch(`/api/tournament/${tournamentId}/sponsor/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor_name: sponsorForm.name.trim(),
          contributor_email: sponsorForm.email.trim() || undefined,
          amount: parseInt(sponsorForm.amount),
          message: sponsorForm.message.trim() || undefined,
          transaction_id: sponsorForm.transaction_id.trim(),
          payment_app: sponsorForm.payment_app || undefined,
          screenshot_url: screenshot_url || undefined,
          ...(currentUser ? { userId: currentUser.id } : { isGuest: true })
        })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution submitted for admin review!'); setShowSponsorForm(false); setSponsorForm({ name: '', email: '', amount: '', message: '', transaction_id: '', payment_app: '' }); setSponsorScreenshot(null); setSelectedTier(null); setSponsorStep(1); }
      else triggerToast(data.message || 'Failed to submit contribution.');
    } catch (e) { triggerToast('Network error submitting contribution.'); } finally { setSponsorSubmitting(false); }
  };

  const getShareMessage = () => {
    const sharePrize = prizeDisplay;
    const gameMode = `${(tourney?.perspective || 'TPP').toUpperCase()} - ${formatLabel(tourney?.match_type)}`;
    const deadline = countdown.type === 'registration' ? 'Registration Closing Soon' : countdown.type === 'start' ? 'Tournament Starting Soon' : countdown.type === 'live' ? 'LIVE NOW' : 'Register Now';
    return `Hurry up! Registrations are filling fast.\n\n🏆 Prize Pool: ${sharePrize}\n\n🎮 ${tourney?.game} ${gameMode} Tournament\n\n⏰ ${deadline}\n\nJoin Now:\n${window.location.href}`;
  };

  const getShareCaption = () => {
    const gameMode = `${formatLabel(tourney?.match_type)} · ${(tourney?.perspective || 'TPP').toUpperCase()}`;
    return `${tourney?.title || 'Tournament on Match District'}\n\n🏆 Prize Pool: ${prizeDisplay} 💰 Entry Fee: ${entryDisplay} 🎮 Format: ${gameMode} 👥 Slots: ${slotFilled}/${slotTotal}\n\nJoin the tournament: ${window.location.href}`;
  };

  const getShareCardData = () => {
    return {
      title: tourney?.title || 'Tournament on Match District',
      orgName: orgProfile?.orgName || tourney?.orgName || '',
      prize: prizeDisplay,
      entry: entryDisplay,
      format: `${formatLabel(tourney?.match_type)} · ${(tourney?.perspective || 'TPP').toUpperCase()}`,
      slots: `${slotFilled}/${slotTotal}`,
      game: tourney?.game || '',
      url: window.location.href
    };
  };

  const ensureShareCardReady = () => {
    if (shareCardRef.current) return shareCardRef.current;
    try {
      const card = generateTournamentShareCard(getShareCardData());
      shareCardRef.current = card;
      return card;
    } catch {
      return null;
    }
  };

  const handleShare = async () => {
    // One share invocation per click.
    if (shareInProgressRef.current) return;
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      setShowSharePopup(true);
      return;
    }
    shareInProgressRef.current = true;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const title = tourney?.title || 'Tournament on Match District';
    const text = getShareCaption();
    const openFallback = () => { if (!isMobile) setShowSharePopup(true); };
    const canShareText = () => typeof navigator.canShare === 'function' && navigator.canShare({ text });

    try {
      // 1. Ensure the master template is loaded so the card renders the real artwork.
      await ensureShareTemplateReady();

      // 2. Resolve the card (pre-warmed ref, or generate synchronously) — generation
      //    completes BEFORE sharing. The card also feeds the popup's download option.
      let card = shareCardRef.current;
      if (!card) {
        card = generateTournamentShareCard(getShareCardData());
        shareCardRef.current = card;
      }
      if (!card) { openFallback(); return; }

      // 3. Convert the generated card into a real PNG File (valid MIME + filename).
      const file = dataURLToFile(card, 'match-district-tournament.png');

      // 4. Attach the image when the platform supports file sharing. The URL lives in
      //    the caption only — never also in a separate `url` field, so it appears once.
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return;
      }

      // 5. No native file sharing: graceful text-only share (URL already in caption).
      if (canShareText()) {
        await navigator.share({ title, text });
        return;
      }
      openFallback();
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        // User cancelled or dismissed the native sheet — silently stop, no fallback.
        return;
      }
      // File sharing failed at runtime → downgrade once to text-only (never double-share).
      try {
        if (canShareText()) {
          await navigator.share({ title, text });
          return;
        }
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      }
      openFallback();
    } finally {
      shareInProgressRef.current = false;
    }
  };

  const handleDownloadCard = () => {
    const card = ensureShareCardReady();
    if (card) {
      downloadDataURL(card, 'match-district-tournament.png');
      triggerToast('Tournament card downloaded.');
    } else {
      triggerToast('Card not ready yet. Try again in a moment.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    triggerToast('Link copied to clipboard!');
    setShowSharePopup(false);
  };

  const handleCopyShareText = () => {
    navigator.clipboard.writeText(getShareCaption());
    triggerToast('Share text copied to clipboard!');
    setShowSharePopup(false);
  };

  const handleShareWhatsApp = () => {
    const msg = encodeURIComponent(getShareMessage());
    window.open(`https://wa.me/?text=${msg}`, '_blank');
    setShowSharePopup(false);
  };

  const handleShareTelegram = () => {
    const msg = encodeURIComponent(getShareMessage());
    const url = encodeURIComponent(window.location.href);
    window.open(`https://t.me/share/url?url=${url}&text=${msg}`, '_blank');
    setShowSharePopup(false);
  };

  const handleCopyCredentials = (text, type) => { navigator.clipboard.writeText(text); triggerToast(`${type} copied to clipboard!`); };

  const handleFollow = async () => {
    if (!currentUser) { triggerToast('Sign in to follow this organizer.'); return; }
    if (!tourney?.orgId) return;
    setFollowLoading(true);
    const prev = isFollowing;
    const prevCount = followerCount;
    setIsFollowing(!prev);
    setFollowerCount(c => prev ? c - 1 : c + 1);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/org/follow', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ orgId: tourney?.orgId }) });
      const data = await res.json();
      if (!data.success) { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast(data.message || 'Failed to update follow.'); }
      else triggerToast(prev ? 'Unfollowed organizer' : 'Following organizer');
    } catch { setIsFollowing(prev); setFollowerCount(prevCount); triggerToast('Network error.'); }
    finally { setFollowLoading(false); }
  };

  // Decrypted credentials endpoint helper
  const fetchLobbyCredentials = useCallback(async () => {
    if (!tournamentId || !currentUser || !isApprovedRoster) return;
    setIsLobbyLoading(true);
    setLobbyError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/lobby`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLobbyCredentials({ roomID: data.roomID, roomPassword: data.roomPassword });
      } else {
        setLobbyError(data.message || 'Credentials locked.');
      }
    } catch (err) {
      setLobbyError('Failed to load lobby credentials.');
    } finally {
      setIsLobbyLoading(false);
    }
  }, [tournamentId, currentUser, isApprovedRoster]);

  useEffect(() => {
    if (isApprovedRoster && revealTimeReached && !lobbyCredentials && !isLobbyLoading) {
      fetchLobbyCredentials();
    }
  }, [isApprovedRoster, revealTimeReached, lobbyCredentials, isLobbyLoading, fetchLobbyCredentials]);

  // Compute events count from tournament list
  const orgEventsCount = useMemo(() => {
    if (!tourney?.orgId || !tournamentsList.length) return 0;
    return tournamentsList.filter(t => t.orgId === tourney.orgId || t.orgid === tourney.orgId).length;
  }, [tourney?.orgId, tournamentsList]);

  // Formatting utils
  const formatIndianCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    if (isNaN(num) || num === 0) return 'Free';
    return `₹${num.toLocaleString('en-IN')}`;
  };

  const entryFee = parseInt(tourney?.entry_fee_amount, 10) || 0;
  const entryDisplay = entryFee === 0 ? 'Free' : formatIndianCurrency(entryFee);
  const basePrize = parseInt(tourney?.prize_pool_amount || tourney?.basePrize || tourney?.prizePool || 0, 10) || 0;
  const sponsoredAmount = tourney?.totalSponsorContributions || tourney?.sponsorRevenue || 0;
  const totalPrize = basePrize + sponsoredAmount;
  const prizeDisplay = formatIndianCurrency(totalPrize || tourney?.prize);
  const slotTotal = tourney?.slotsTotal || slotsData?.slotsTotal || 100;
  const slotFilled = slotsData?.slotsFilled ?? (registrations ? registrations.filter(r => !['cancelled','expired','rejected'].includes((r.status || '').toLowerCase())).length : 0);
  const slotAvailable = Math.max(0, slotTotal - slotFilled);
  const fillPercent = Math.min(100, Math.round((slotFilled / slotTotal) * 100));

  const formatLabel = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

  // Pre-warm the shareable tournament card (1080x1536 PNG on the master template) so taps share instantly
  useEffect(() => {
    let cancelled = false;
    if (!tourney) {
      shareCardRef.current = null;
      setShareGenerating(false);
      return undefined;
    }
    setShareGenerating(true);
    ensureShareTemplateReady().then(() => {
      try {
        if (!cancelled) {
          shareCardRef.current = generateTournamentShareCard({
            title: tourney.title || 'Tournament on Match District',
            orgName: orgProfile?.orgName || tourney.orgName || '',
            prize: prizeDisplay,
            entry: entryDisplay,
            format: `${formatLabel(tourney.match_type)} · ${(tourney.perspective || 'TPP').toUpperCase()}`,
            slots: `${slotFilled}/${slotTotal}`,
            game: tourney.game || '',
            url: window.location.href
          });
        }
      } catch {
        shareCardRef.current = null;
      }
      setShareGenerating(false);
    });
    return () => { cancelled = true; };
  }, [tourney, orgProfile, slotsData, registrations, prizeDisplay, entryDisplay, slotFilled, slotTotal]);

  const startDateStr = tourney?.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? formatDate(startDateStr.toISOString()) : '';
  const formattedTime = '';

  // Generate prize distribution split lists against total prize (base + sponsored)
  const prizeDistributions = useMemo(() => {
    if (!tourney) return [];
    const list = [];
    const pool = totalPrize || parseInt(tourney.prize_pool_amount || tourney.prizePool || tourney.prize, 10) || 0;

    let usedPrizePositions = false;
    try {
      const raw = tourney.prize_positions;
      if (raw) {
        const parsedPositions = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsedPositions) && parsedPositions.length > 0) {
          parsedPositions.forEach((pos) => {
            const pct = parseFloat(pos.percentage);
            const amount = !isNaN(pct) && pool > 0 ? Math.round(pool * pct / 100) : 0;
            list.push({
              position: pos.name || `${list.length + 1} Place`,
              prize: amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : `${pct}%`,
              badge: '',
              badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            });
          });
          usedPrizePositions = true;
        }
      }
    } catch (_) {}

    if (!usedPrizePositions) {
      const firstVal = tourney.prize_split_1st || (pool > 0 ? `₹${Math.round(pool * 0.5).toLocaleString('en-IN')}` : '50%');
      const secondVal = tourney.prize_split_2nd || (pool > 0 ? `₹${Math.round(pool * 0.3).toLocaleString('en-IN')}` : '30%');
      const thirdVal = tourney.prize_split_3rd || (pool > 0 ? `₹${Math.round(pool * 0.2).toLocaleString('en-IN')}` : '20%');

      list.push({ position: 'WWCD', prize: firstVal, badge: '🥇', badgeBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' });
      list.push({ position: '2nd Place', prize: secondVal, badge: '🥈', badgeBg: 'bg-slate-400/20 text-slate-300 border border-slate-400/30' });
      list.push({ position: '3rd Place', prize: thirdVal, badge: '🥉', badgeBg: 'bg-amber-700/20 text-amber-600 border border-amber-700/30' });
    }

    if (tourney.mvp_enabled) {
      list.push({
        position: 'Top Fragger / MVP',
        prize: tourney.prize_split_mvp || (tourney.mvp_amount ? `₹${parseInt(tourney.mvp_amount, 10).toLocaleString('en-IN')}` : 'MVP Award'),
        badge: '🎯',
        badgeBg: 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
      });
    }
    if (tourney.kill_reward_enabled && tourney.kill_reward_per_kill) {
      list.push({
        position: 'Kill Reward',
        prize: `₹${tourney.kill_reward_per_kill} per kill`,
        badge: '💀',
        badgeBg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
      });
    }
    return list;
  }, [tourney, totalPrize]);

  const getParsedRules = (rulesData) => {
    if (!rulesData) return null;

    try {
      const parsed = typeof rulesData === 'string' ? JSON.parse(rulesData) : rulesData;
      
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.selectedDefaultIds || parsed.customRules)) {
        const selectedIds = parsed.selectedDefaultIds || [];
        const customRules = parsed.customRules || [];
        
        const activeCategories = DEFAULT_CATEGORIES.map(cat => {
          const activeItems = cat.items.filter((_, idx) => selectedIds.includes(`${cat.id}-${idx}`));
          return {
            title: cat.title,
            items: activeItems
          };
        }).filter(cat => cat.items.length > 0);
        
        return {
          type: 'structured',
          categories: activeCategories,
          custom: customRules.filter(r => r && r.trim() !== '')
        };
      }

      if (Array.isArray(parsed)) {
        return {
          type: 'flat',
          items: parsed
        };
      }
    } catch (e) {}

    if (typeof rulesData === 'string') {
      const items = rulesData.split('\n').map(r => r.trim()).filter(Boolean);
      if (items.length > 1) {
        return {
          type: 'flat',
          items
        };
      }
    }

    return null;
  };

  const renderRulesContent = () => {
    const parsedRules = getParsedRules(tourney?.rules);
    
    if (!parsedRules) {
      return (
        <div className="text-xs text-white/70 leading-relaxed">
          {tourney?.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.'}
        </div>
      );
    }

    if (parsedRules.type === 'flat') {
      return (
        <ul className="list-disc pl-4 space-y-1.5 text-xs text-white/70">
          {parsedRules.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-4">
        {parsedRules.categories.map((cat, idx) => (
          <div key={idx} className="space-y-1.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">{cat.title}</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-white/60">
              {cat.items.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {parsedRules.custom.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Custom Rules</h4>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-white/60">
              {parsedRules.custom.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const isGoldTheme = ['gold', 'royal_gold', 'royal gold', 'royalgold'].includes((tourney?.card_color || tourney?.cardColor || tourney?.theme || '').toLowerCase().trim());
  const isArcticWhite = !isGoldTheme

  const cardContainerClass = isGoldTheme
    ? 'bg-[#FAF7F0] border border-[#D4A017]/35 rounded-xl p-4 sm:p-5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
    : 'bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm';

  const cardTitleClass = isGoldTheme
    ? 'text-xs font-black text-[#FFFFFF] tracking-widest uppercase mb-2'
    : 'text-xs font-black text-slate-800 tracking-widest uppercase mb-2';

  const cardBodyClass = isGoldTheme
    ? 'text-[13px] sm:text-sm text-[#374151] leading-relaxed whitespace-pre-wrap font-medium'
    : 'text-[13px] sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap';

  if (isTournamentsLoading) return <LoadingScreen message="Loading Tournament Coordinates..." />;

  return (
    <div className={`min-h-screen text-white relative overflow-x-hidden w-full max-w-[100vw] selection:bg-amber-500/30 selection:text-white transition-colors duration-500 ${
      isGoldTheme ? 'bg-[#0E0C06] royal-gold-theme' : 'bg-[#07080C]'
    }`}>
      {/* Royal Gold Global Background Layers (Auras, Metallic Overlay, Floating Dust) */}
      {isGoldTheme && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
          {/* Layer 1: Warm Metallic Radial Glow Auras */}
          <div 
            className="absolute inset-0 opacity-40 mix-blend-screen"
            style={{
              background: 'radial-gradient(circle at 15% 15%, rgba(255, 224, 130, 0.25) 0%, transparent 65%), radial-gradient(circle at 85% 65%, rgba(212, 160, 23, 0.18) 0%, transparent 65%), radial-gradient(circle at 50% 100%, rgba(122, 82, 0, 0.3) 0%, transparent 60%)'
            }}
          />
          {/* Layer 2: Fine Brushed Metallic Gold Texture Lines */}
          <div 
            className="absolute inset-0 opacity-15 mix-blend-overlay"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 4px)'
            }}
          />
          {/* Layer 3: Slow Floating Gold Dust Particles */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => {
              const size = 1.5 + (i % 3) * 0.8;
              const left = (i * 6.5 + 3) % 96;
              const duration = 6 + (i % 4) * 1.8;
              const delay = (i * 0.4) % 3;
              return (
                <motion.div
                  key={`gold-dust-${i}`}
                  className="absolute rounded-full bg-[#FFE082] shadow-[0_0_8px_1px_rgba(255,224,130,0.8)]"
                  style={{ width: `${size}px`, height: `${size}px`, left: `${left}%`, bottom: '-5%' }}
                  animate={{ y: ['0px', '-105vh'], x: [0, (i % 2 === 0 ? 20 : -20)], opacity: [0, 0.7, 0.7, 0] }}
                  transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
                />
              );
            })}
          </div>
        </div>
      )}

      <Header activePage="tournament-detail" onNavigate={onNavigate} />

      <main className="flex-1 flex flex-col items-center w-full px-4 md:px-margin-desktop py-20 md:py-24 touch-scroll max-w-[100vw] relative z-10">
        <div className="w-full max-w-[1280px] space-y-8 pb-32">
          
          {/* Hero Section */}
          <section className="flex flex-col w-full relative">
            <div className={`relative rounded-2xl p-4 sm:p-6 w-full overflow-hidden transition-all duration-300 ${
              isGoldTheme
                ? 'bg-gradient-to-br from-[#3D2800]/95 via-[#8A5C00]/90 to-[#D4A017]/80 border border-[#FFE082]/40 shadow-[0_16px_50px_rgba(122,82,0,0.4)] backdrop-blur-xl'
                : 'bg-white/5 border border-white/10 backdrop-blur-md'
            }`}>
              
              {/* Layer 5: Match District "M" Watermark (3.5% Opacity behind Hero Card) */}
              {isGoldTheme && (
                <div className="absolute top-[-15%] right-[-5%] w-[65%] h-[130%] opacity-[0.035] mix-blend-screen pointer-events-none transform -rotate-12 z-0">
                  <svg viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-[#FFE082]">
                    <path d="M20 180 L70 30 L100 100 L130 30 L180 180 L140 180 L120 100 L100 140 L80 100 L60 180 Z" fill="currentColor" />
                    <path d="M100 10 L190 60 L190 160 L100 210 L10 160 L10 60 Z" stroke="currentColor" strokeWidth="6" fill="none" />
                  </svg>
                </div>
              )}

              {/* Layer 6: Hero Section Contained Ambient Floating Gold Particles */}
              {isGoldTheme && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
                  {Array.from({ length: 14 }).map((_, i) => {
                    const size = 2 + (i % 4) * 1.1;
                    const left = (i * 7.3 + 4) % 94;
                    const duration = 5 + (i % 4) * 1.5;
                    const delay = (i * 0.35) % 2.5;
                    const colors = ['#FFD54F', '#FBC02D', '#FFF8E1', '#FFFFFF'];
                    const color = colors[i % colors.length];
                    return (
                      <motion.div
                        key={`hero-gold-dust-${i}`}
                        className="absolute rounded-full"
                        style={{ 
                          width: `${size}px`, 
                          height: `${size}px`, 
                          left: `${left}%`, 
                          bottom: '-10%',
                          backgroundColor: color,
                          boxShadow: `0 0 8px 1px ${color}80`
                        }}
                        animate={{ 
                          y: ['0px', '-140px'], 
                          x: [0, (i % 2 === 0 ? 15 : -15), (i % 2 === 0 ? -8 : 8), 0], 
                          opacity: [0, 0.45, 0.45, 0] 
                        }}
                        transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Side-by-side: Poster + Top Details */}
              <div className="relative z-10 flex flex-row items-start gap-4 w-full">
                
                {/* Poster Left */}
                <div className="w-[110px] sm:w-[140px] md:w-[220px] lg:w-[280px] shrink-0 rounded-2xl sm:rounded-[22px] md:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                  <img 
                    className="w-full aspect-[3/4] object-cover rounded-2xl sm:rounded-[22px] md:rounded-3xl"
                    src={tourney.cover_image_url || tourney.bannerUrl || FALLBACK_IMG}
                    alt="Tournament Poster"
                  />
                </div>

                {/* Details Right */}
                <div className="flex-1 flex flex-col items-start justify-start md:justify-center text-left min-w-0">
                  
                  {/* Title Row with Share Button */}
                  <div className="flex items-start justify-between gap-2 w-full">
                    <h1 className={`text-lg sm:text-2xl font-black text-[#FFFFFF] !text-white leading-tight line-clamp-2 break-words ${isGoldTheme ? 'royal-gold-title' : ''}`} style={{ color: '#FFFFFF' }}>
                      {tourney.title}
                    </h1>
                    <button
                        onClick={handleShare}
                        aria-label="Share tournament"
                        aria-busy={shareGenerating}
                        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
                          isGoldTheme
                            ? 'text-[#FFE082]/60 hover:text-[#FFE082] hover:bg-[#FFE082]/10'
                            : 'text-white/50 hover:text-white/90 hover:bg-white/8'
                        }`}
                      >
                        {shareGenerating ? (
                          <svg className="w-[18px] h-[18px] animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        )}
                      </button>
                  </div>

                  {/* Organizer */}
                  <div className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 mt-1.5 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-800'}`}>
                    <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full overflow-hidden shrink-0 bg-white/10 border border-white/20 flex items-center justify-center font-bold text-[6px] sm:text-[7px] text-white">
                      {tourney?.orgLogo || orgProfile?.avatar ? (
                        <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                      ) : (
                        (orgProfile?.orgName || tourney.orgName || 'MD').slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className={`truncate ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{orgProfile?.orgName || tourney.orgName || orgProfile?.name}</span>
                    <VerificationBadge tier={orgProfile?.tier || tourney.orgTier} size="xs" />
                  </div>

                  {/* Data Grid - 2x2 unified */}
                  <div className="grid grid-cols-2 gap-y-4 gap-x-4 w-full mt-4">
                    {/* Prize */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>PRIZE</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm sm:text-base font-extrabold ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{prizeDisplay}</span>
                        {sponsoredAmount > 0 && (
                          <svg className="w-4 h-4 text-amber-400 shrink-0 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {/* Entry */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>ENTRY</span>
                      <span className={`text-sm sm:text-base font-extrabold ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>{entryDisplay}</span>
                    </div>
                    {/* Format */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>FORMAT</span>
                      <span className={`text-xs sm:text-sm font-bold flex items-center gap-1 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>
                        {formatLabel(tourney.match_type)} &bull; {(tourney.perspective || 'TPP').toUpperCase()}
                      </span>
                    </div>
                    {/* Slots */}
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGoldTheme ? 'text-[#FFFFFF]/85' : 'text-slate-600'}`}>SLOTS</span>
                      <span className={`text-xs sm:text-sm font-bold flex items-center gap-1 ${isGoldTheme ? 'text-[#FFFFFF]' : 'text-slate-900'}`}>
                        <svg className={`w-3 sm:w-3.5 h-3 sm:h-3.5 ${isGoldTheme ? 'text-white/90' : 'text-slate-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{slotFilled}/{slotTotal}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="flex items-center justify-between gap-3 mt-4 sm:mt-5 pt-4 border-t border-white/10">
                {(() => {
                  const regStatus = myRoster ? (myRoster.status || '').toLowerCase() : '';
                  const showJoin = !regStatus || ['rejected', 'cancelled', 'expired', 'payment_rejected'].includes(regStatus);
                  const showWaiting = ['pending_payment', 'pending', 'waitlisted'].includes(regStatus);
                  const showRegistered = ['approved', 'confirmed'].includes(regStatus);
                  const lifecycle = getTournamentLifecycleStatus(tourney, new Date());
                  if ((lifecycle === 'closed' || lifecycle === 'live' || lifecycle === 'archived') && showJoin) {
                    const label = lifecycle === 'live' ? 'Registration Closed' : lifecycle === 'archived' ? 'Tournament Ended' : 'Registration Ended';
                    return (
                      <button
                        disabled
                        className="flex-1 bg-slate-400 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {label}
                      </button>
                    );
                  }
                  if (lifecycle === 'upcoming' && showJoin) {
                    return (
                      <button
                        disabled
                        className="flex-1 bg-slate-400 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Registration Opens Later
                      </button>
                    );
                  }
                  if (showRegistered) {
                    return (
                      <button
                        disabled
                        className={`flex-1 font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed ${
                          isGoldTheme 
                            ? 'bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-white border border-[#FFE082]/40 shadow-[inset_0_1px_3px_rgba(255,255,255,0.3)] opacity-95'
                            : 'bg-green-500 text-white opacity-90'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Registered Successfully
                      </button>
                    );
                  }
                  if (showWaiting) {
                    return (
                      <button
                        disabled
                        className="flex-1 bg-amber-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 opacity-80 cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Waiting for Verification
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={() => navigate(`/tournaments/${tourney.id}/register`)}
                      className={`flex-1 font-bold text-sm px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                        isGoldTheme
                          ? 'bg-gradient-to-r from-[#FFE082] via-[#FFC107] to-[#FFCA28] text-[#3D2500] font-black border border-[#FFF4C2]/70 shadow-[0_4px_16px_rgba(80,50,0,0.5)] hover:shadow-[0_6px_24px_rgba(255,193,7,0.6)]'
                          : 'bg-primary hover:bg-primary/90 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)]'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Join Now
                    </button>
                  );
                })()}
                {getGameLogo(tourney.game) && (
                  <img 
                    src={getGameLogo(tourney.game)} 
                    alt={tourney.game} 
                    className={`shrink-0 rounded-xl overflow-hidden border object-cover h-[40px] sm:h-[48px] w-[40px] sm:w-[48px] ${
                      isGoldTheme ? 'border-[#FFC107]/40 shadow-md' : 'border-slate-200'
                    }`}
                  />
                )}
              </div>

            </div>
          </section>

          {/* Registration Countdown Banner */}
          {countdown.active && countdown.type !== 'ended' && countdown.type !== 'live' && (
            <div className={`mt-4 border shadow-sm p-3.5 flex items-center justify-between w-full relative overflow-hidden transition-all duration-300 ${
              isGoldTheme
                ? 'bg-gradient-to-r from-[#C29215]/95 via-[#D4A017]/95 to-[#A67B10]/95 border-[#FFE082]/50 shadow-[0_8px_24px_rgba(184,134,11,0.3)] rounded-2xl backdrop-blur-xl'
                : countdown.type === 'regOpen' ? 'bg-emerald-50 border-emerald-200 rounded-xl' :
                  countdown.type === 'registration' ? 'bg-blue-50 border-blue-200 rounded-xl' :
                  'bg-white border-slate-100 rounded-xl'
            }`}>
              {/* Brushed texture overlay for Royal Gold */}
              {isGoldTheme && (
                <div 
                  className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none z-0"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 4px)'
                  }}
                />
              )}

              {/* Contained Ambient Floating Gold Particles for Countdown Section */}
              {isGoldTheme && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const size = 2 + (i % 3) * 1.2;
                    const left = (i * 13 + 6) % 92;
                    const duration = 4.5 + (i % 3) * 1.2;
                    const delay = (i * 0.4) % 2;
                    const colors = ['#FFD54F', '#FBC02D', '#FFF8E1', '#FFFFFF'];
                    const color = colors[i % colors.length];
                    return (
                      <motion.div
                        key={`countdown-gold-dust-${i}`}
                        className="absolute rounded-full"
                        style={{ 
                          width: `${size}px`, 
                          height: `${size}px`, 
                          left: `${left}%`, 
                          bottom: '-15%',
                          backgroundColor: color,
                          boxShadow: `0 0 6px 1px ${color}80`
                        }}
                        animate={{ 
                          y: ['0px', '-75px'], 
                          x: [0, (i % 2 === 0 ? 10 : -10), 0], 
                          opacity: [0, 0.4, 0.4, 0] 
                        }}
                        transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
                      />
                    );
                  })}
                </div>
              )}

              <span className={`text-xs sm:text-sm relative z-10 ${
                isGoldTheme
                  ? 'font-bold text-white'
                  : countdown.type === 'regOpen' ? 'font-black tracking-widest text-emerald-600' :
                    countdown.type === 'registration' ? 'font-black tracking-widest text-blue-600' :
                    'font-black tracking-widest text-slate-500'
              }`}>{countdown.label}</span>

              <div className={`text-sm sm:text-base font-black px-3.5 py-1.5 rounded-xl whitespace-nowrap border relative z-10 ${
                isGoldTheme
                  ? 'text-white bg-[#8A5C00]/40 border-[#FFE082]/40 shadow-inner'
                  : countdown.type === 'regOpen' ? 'text-emerald-700 bg-emerald-100/50 border-emerald-200' :
                    countdown.type === 'registration' ? 'text-blue-700 bg-blue-100/50 border-blue-200' :
                    'text-slate-700 bg-slate-100/50 border-slate-200'
              }`}>
                {countdown.days > 0 ? `${countdown.days}d ` : ''}
                {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Tabs */}
          <div className={`mt-8 border-b w-full overflow-hidden ${isGoldTheme ? 'border-[#D4A017]/30' : 'border-slate-200'}`}>
            <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap pb-3 scrollbar-hide touch-pan-x">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'prize', label: 'Prize Pool' },
                { id: 'roadmap', label: 'Roadmap' },
                { id: 'rules', label: 'Rules & Regulations' },
                { id: 'teams', label: 'Registered Teams' },
                { id: 'leaderboard', label: 'Leaderboard' },
                { id: 'sponsors', label: 'Sponsors' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    activeTab === tab.id
                      ? isGoldTheme
                        ? 'text-[#D4A017] font-black border-b-2 border-[#D4A017] pb-2 whitespace-nowrap text-sm sm:text-base py-1'
                        : 'text-blue-600 font-bold border-b-2 border-blue-600 pb-2 whitespace-nowrap text-sm sm:text-base py-1'
                      : isGoldTheme
                        ? 'text-[#9CA3AF] hover:text-[#D4A017] font-medium pb-2 cursor-pointer whitespace-nowrap transition-colors text-sm sm:text-base py-1'
                        : 'text-slate-400 hover:text-slate-600 pb-2 cursor-pointer whitespace-nowrap text-sm sm:text-base py-1'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Area */}
          <div className="mt-6 w-full pb-20 min-h-[120px]">
            {activeTab === 'overview' && (
              <div className="flex flex-col lg:flex-row gap-6 w-full">

                {/* Left Column: Descriptions */}
                <div className="flex-1 space-y-4">
                  <div className={cardContainerClass}>
                    <h3 className={cardTitleClass}>About Tournament</h3>
                    <p className={cardBodyClass}>{tourney?.description || 'No description provided for this tournament.'}</p>
                  </div>
                  <div className={cardContainerClass}>
                    <h3 className={cardTitleClass}>About Organizer</h3>
                    <p className={cardBodyClass}>{orgProfile?.orgBio || orgProfile?.experience || orgProfile?.bio || tourney?.orgBio || 'No description provided for this organizer.'}</p>
                  </div>
                </div>

                {/* Right Column: Organizer Profile Card */}
                <div className="w-full lg:w-[320px] shrink-0">
                  <div className={`${cardContainerClass} flex flex-col gap-4`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full overflow-hidden shrink-0 border flex items-center justify-center font-bold text-xs ${
                        isGoldTheme ? 'bg-[#F5F0E1] border-[#D4A017]/40 text-[#1F2937]' : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}>
                        {tourney?.orgLogo || orgProfile?.avatar ? (
                          <img src={tourney?.orgLogo || orgProfile?.avatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                          (orgProfile?.orgName || tourney?.orgName || 'MD').slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold truncate ${isGoldTheme ? 'text-[#1F2937] font-black' : 'text-slate-900'}`}>{orgProfile?.orgName || tourney?.orgName || orgProfile?.name || 'Organizer'}</span>
                          <VerificationBadge tier={orgProfile?.tier || tourney?.orgTier} size="xs" />
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {[1,2,3,4,5].map(star => (
                            <svg key={star} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                          <span className={`text-sm font-bold ml-1 ${isGoldTheme ? 'text-[#374151]' : 'text-slate-700'}`}>4.8 <span className={isGoldTheme ? 'text-slate-500 font-medium' : 'text-slate-400 font-medium'}>(120 reviews)</span></span>
                        </div>
                        <div className={`flex items-center gap-4 mt-2 text-xs font-bold ${isGoldTheme ? 'text-[#4B5563]' : 'text-slate-500'}`}>
                          <span>🎮 {orgProfile?.totalTournaments || tourney?.orgTotalHosted || 12} Tournaments Hosted</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`w-full font-bold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                        isGoldTheme
                          ? 'bg-gradient-to-r from-[#FFE082] via-[#FFC107] to-[#FFCA28] text-[#3D2500] font-black border border-[#FFF4C2]/70 shadow-md hover:brightness-105'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Following
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Follow Organizer
                        </>
                      )}
                    </button>
                    {followerCount > 0 && (
                      <p className="text-xs text-slate-500 text-center -mt-2">{followerCount.toLocaleString()} follower{followerCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>

              </div>
            )}
            {activeTab === 'prize' && (
              isGoldTheme ? (
                <div className="flex flex-col gap-4 w-full max-w-2xl select-none">
                  {/* Sleek, Compact Total Prize Pool Card */}
                  <div className="relative overflow-hidden rounded-xl p-4 sm:p-5 bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border border-[#FFF4C2]/80 shadow-[0_6px_20px_rgba(212,160,23,0.35)] backdrop-blur-md">
                    <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#FFF4C2_1px,transparent_1px)] [background-size:16px_16px]" />

                    <div className="relative z-10 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-[#FFFFFF]">
                          Total Prize Pool
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-black text-[#FFFFFF] tracking-tight text-right">
                          {formatIndianCurrency(totalPrize)}
                        </h2>
                      </div>

                      {sponsoredAmount > 0 && (
                        <div className="pt-2 border-t border-[#FFF4C2]/30 flex items-center justify-between gap-2 text-xs text-[#FFFFFF]">
                          <span className="font-bold text-[#FFFFFF]">Base Prize: {formatIndianCurrency(basePrize)}</span>
                          <span className="font-bold text-[#FFFFFF] bg-[#8A5A00]/40 border border-[#FFF4C2]/40 px-2 py-0.5 rounded-md text-[11px]">
                            + Sponsored: {formatIndianCurrency(sponsoredAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sleek Royal Gold Prize Distribution Board */}
                  {prizeDistributions.length > 0 ? (
                    <div className="space-y-2.5">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFFFFF] pl-1">
                        Prize Distribution
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {prizeDistributions.map((row, i) => {
                          const isWWCD = i === 0 || /wwcd|1st|champion/i.test(row.position);
                          const isSecond = i === 1 || /2nd/i.test(row.position);
                          const isThird = i === 2 || /3rd/i.test(row.position);

                          const getCleanRankTitle = (idx, rawPos) => {
                            if (idx === 0 || /wwcd|1st|champion/i.test(rawPos)) return 'WWCD / CHAMPION';
                            if (idx === 1 || /2nd/i.test(rawPos)) return '2nd Place';
                            if (idx === 2 || /3rd/i.test(rawPos)) return '3rd Place';
                            if (idx === 3 || /4th/i.test(rawPos)) return '4th Place';
                            if (idx === 4 || /5th/i.test(rawPos)) return '5th Place';
                            if (idx === 5 || /6th/i.test(rawPos)) return '6th Place';
                            if (idx === 6 || /7th/i.test(rawPos)) return '7th Place';
                            if (idx === 7 || /8th/i.test(rawPos)) return '8th Place';
                            if (idx === 8 || /9th/i.test(rawPos)) return '9th Place';
                            if (idx === 9 || /10th/i.test(rawPos)) return '10th Place';
                            if (/place|rank|mvp|fragger|kill/i.test(rawPos)) return rawPos;
                            return `${idx + 1}th Place`;
                          };

                          const positionTitle = getCleanRankTitle(i, row.position);
                          const subtitle = isWWCD ? 'Winning Team' : isSecond ? 'Runner-up' : isThird ? 'Third-place finish' : '';

                          if (isWWCD) {
                            return (
                              <div
                                key={i}
                                className="md:col-span-2 relative overflow-hidden rounded-xl p-3.5 sm:p-4 bg-gradient-to-br from-[#FFE082] via-[#E6B93C] to-[#B8860B] border border-[#FFF4C2] shadow-[0_6px_20px_rgba(255,216,106,0.5)] flex items-center justify-between gap-3"
                              >
                                <div>
                                  <h4 className="text-base sm:text-lg font-black text-[#FFFFFF] tracking-wide">
                                    {positionTitle}
                                  </h4>
                                  {subtitle && (
                                    <p className="text-xs sm:text-sm font-bold text-[#FFFFFF] mt-0.5">
                                      {subtitle}
                                    </p>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xl sm:text-2xl font-black text-[#FFFFFF] tracking-tight">
                                    {row.prize}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (isSecond || isThird) {
                            return (
                              <div
                                key={i}
                                className={`relative overflow-hidden rounded-xl p-3 border flex items-center justify-between gap-2.5 ${
                                  isSecond
                                    ? 'bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#A67B10] border-[#FFF4C2]/80 shadow-[0_4px_14px_rgba(212,160,23,0.35)]'
                                    : 'bg-gradient-to-br from-[#D4A017] via-[#C29215] to-[#8A5A00] border-[#FFE082]/70 shadow-[0_3px_12px_rgba(184,134,11,0.3)]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <h4 className="text-xs sm:text-sm font-black text-[#FFFFFF] truncate">
                                    {positionTitle}
                                  </h4>
                                  {subtitle && (
                                    <p className="text-xs font-bold text-[#FFFFFF] truncate mt-0.5">
                                      {subtitle}
                                    </p>
                                  )}
                                </div>

                                <span className="text-base sm:text-lg font-black text-[#FFFFFF] shrink-0 ml-2">
                                  {row.prize}
                                </span>
                              </div>
                            );
                          }

                          // Ranks 4+
                          return (
                            <div
                              key={i}
                              className="bg-gradient-to-r from-[#C29215] to-[#9E740E] border border-[#FFE082]/40 rounded-lg p-2.5 px-3 flex items-center justify-between shadow-sm"
                            >
                              <span className="font-bold text-xs text-[#FFFFFF] truncate">
                                {positionTitle}
                              </span>
                              <span className="font-black text-xs sm:text-sm text-[#FFFFFF] shrink-0 ml-2">
                                {row.prize}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl text-xs border bg-gradient-to-br from-[#E6B93C] via-[#D4A017] to-[#B8860B] border-[#FFF4C2] text-[#FFFFFF] font-bold">
                      No prize distribution data available.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-5 max-w-2xl">
                  {/* Prize Pool Breakdown Summary */}
                  <div className="relative overflow-hidden rounded-2xl p-6 bg-white border border-slate-200 shadow-lg">
                    {sponsoredAmount > 0 ? (
                      <>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-5 relative z-10 text-slate-400">Prize Pool Breakdown</h4>

                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-sm font-medium text-slate-600">Base Prize</span>
                          <span className="text-sm font-bold text-slate-800">{formatIndianCurrency(basePrize)}</span>
                        </div>

                        <div className="flex items-center justify-between mt-4 relative z-10">
                          <span className="text-sm font-medium flex items-center gap-1.5 text-slate-600">
                            Sponsored Contributions
                            <svg className="w-4 h-4 shrink-0 aspect-square text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.644 1.59a.5.5 0 01.712 0l4.203 4.26a.5.5 0 00.337.164l6.02.526a.5.5 0 01.285.873l-4.47 4.208a.5.5 0 00-.167.472l1.297 5.928a.5.5 0 01-.743.542L12 15.579a.5.5 0 00-.488 0l-5.53 2.988a.5.5 0 01-.743-.542l1.297-5.928a.5.5 0 00-.167-.472l-4.47-4.208a.5.5 0 01.285-.873l6.02-.526a.5.5 0 00.337-.164L11.644 1.59z" />
                            </svg>
                          </span>
                          <span className="text-sm font-bold text-amber-400">+{formatIndianCurrency(sponsoredAmount)}</span>
                        </div>

                        <div className="my-4 relative z-10 border-t border-slate-100" />

                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Prize Pool</span>
                          <span className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                            {formatIndianCurrency(totalPrize)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Prize Pool</span>
                        <span className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                          {formatIndianCurrency(totalPrize)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Prize Distribution Cards */}
                  {prizeDistributions.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] pl-1 text-slate-400">Prize Distribution</h5>
                      {prizeDistributions.slice(0, 15).map((row, i) => {
                        const medalSvgs = [
                          <svg key="g" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(245,158,11,0.45)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#FEF3C7" />
                          </svg>,
                          <svg key="s" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(148,163,184,0.35)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#F1F5F9" />
                          </svg>,
                          <svg key="b" className="w-7 h-7 shrink-0 drop-shadow-[0_2px_10px_rgba(217,119,6,0.35)]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="8" r="5" fill="#D97706" stroke="#B45309" strokeWidth="1.2" />
                            <path d="M8 22v-6a4 4 0 018 0v6" fill="#D97706" stroke="#B45309" strokeWidth="1.2" />
                            <path d="M12 3l1.5 3 3.5.5-2.5 2.5.5 3.5L12 11l-3 1.5.5-3.5L7 6.5l3.5-.5L12 3z" fill="#FED7AA" />
                          </svg>
                        ];

                        const displayName = i === 0 && row.position !== 'WWCD' && /1st/i.test(row.position) ? 'WWCD' : row.position;

                        return (
                          <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3.5 shadow-sm border bg-white border-slate-200">
                            <div className="flex items-center gap-3 min-w-0">
                              {i <= 2 ? (
                                medalSvgs[i]
                              ) : (
                                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 bg-slate-100 border-slate-200 text-slate-500">
                                  {i + 1}
                                </span>
                              )}
                              <span className="font-extrabold text-sm leading-tight truncate text-slate-900">
                                {i <= 2 ? displayName : `Rank ${i + 1}`}
                              </span>
                            </div>
                            <span className="font-black text-sm sm:text-base shrink-0 ml-3 text-green-700">{row.prize}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl text-sm border bg-slate-50 border-slate-100 text-slate-500">No prize distribution data available.</div>
                  )}
                </div>
              )
            )}
            {activeTab === 'roadmap' && (
              isGoldTheme ? (
                <RoyalGoldRoadmap roadmap={parsedTimeline.roadmap} />
              ) : (
                <ResponsiveRoadmap roadmap={parsedTimeline.roadmap} />
              )
            )}
            {activeTab === 'rules' && (
              <div className="max-w-2xl space-y-3">
                {(() => {
                  const parsedRules = getParsedRules(tourney?.rules);
                  const categories = [];

                  if (!parsedRules) {
                    categories.push({
                      title: 'Rules',
                      items: [tourney?.rules || 'No specific rules are set for this tournament. Standard fair play and gaming etiquette apply.']
                    });
                  } else if (parsedRules.type === 'flat') {
                    categories.push({ title: 'Rules', items: parsedRules.items });
                  } else {
                    parsedRules.categories.forEach(c => categories.push({ title: c.title, items: c.items }));
                    if (parsedRules.custom.length > 0) {
                      categories.push({ title: 'Custom Rules', items: parsedRules.custom, custom: true });
                    }
                  }

                  return categories.map((cat, idx) => (
                    <div key={idx} className={`rounded-xl overflow-hidden shadow-sm border ${
                      isGoldTheme ? 'border-[#D4A017]/35 bg-[#FAF7F0]' : 'border-slate-200 bg-white'
                    }`}>
                      <button
                        onClick={() => setOpenRule(openRule === idx ? null : idx)}
                        className={`w-full flex items-center justify-between p-4 transition-colors font-bold text-left ${
                          isGoldTheme
                            ? 'bg-[#F5F0E1] hover:bg-[#EDE5D0] text-[#1F2937]'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <span className={`text-sm uppercase tracking-wider ${cat.custom ? (isGoldTheme ? 'text-[#B8860B]' : 'text-blue-600') : (isGoldTheme ? 'text-[#1F2937]' : 'text-slate-700')}`}>{cat.title}</span>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${isGoldTheme ? 'text-[#D4A017]' : 'text-slate-400'} ${openRule === idx ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openRule === idx && (
                        <div className={`p-4 text-sm leading-relaxed whitespace-pre-wrap space-y-1.5 border-t ${
                          isGoldTheme ? 'border-[#D4A017]/25 text-[#374151]' : 'border-slate-100 text-slate-600'
                        }`}>
                          {cat.items.map((item, i) => (
                            <p key={i} className="flex items-start gap-2">
                              <span className={isGoldTheme ? 'text-[#D4A017] mt-0.5' : 'text-slate-300 mt-0.5'}>•</span>
                              <span>{item}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
            {activeTab === 'teams' && (
              <RoomSlotGrid
                slotsData={slotsData}
                matchType={tourney?.match_type}
              />
            )}
            {activeTab === 'leaderboard' && (
              <TournamentLeaderboard
                tournamentId={tournamentId}
                isGoldTheme={isGoldTheme}
                cardContainerClass={cardContainerClass}
                cardTitleClass={cardTitleClass}
              />
            )}
            {activeTab === 'sponsors' && (
              <div className="w-full max-w-7xl">
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div className="text-left">
                    <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Tournament Sponsors</h3>
                    <p className="text-xs text-slate-400 mt-1">Premium corporate and community contributions directly backing the prize pool.</p>
                  </div>
                  <button onClick={() => setShowSponsorForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all tracking-wide shadow-md shadow-blue-600/10">
                    Become a Sponsor
                  </button>
                </div>

                {sponsorList.length > 0 ? (
                  <div className="w-full max-w-7xl">
                    {(() => {
                      // Already sorted by amount DESC from server endpoint
                      const totalVolume = sponsorList.reduce((sum, item) => sum + Number(item.balance || item.amount || 0), 0);
                      return (
                        <>
                          <div className="mt-2 mb-6 bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between max-w-xs shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sponsoring Volume</span>
                              <span className="text-xl font-black text-slate-950 mt-0.5">
                                ₹{totalVolume.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 w-full max-w-7xl mx-auto px-2">
                            {sponsorList.map((item, idx) => {
                              const amt = Number(item.balance || item.amount || 0);
                              const cardId = `spn-${(item.name || 'sponsor').replace(/\s+/g, '-')}-${idx}`;
                              const card = {
                                id: cardId,
                                type: getCardType(amt),
                                tagName: getCardTagName(amt),
                                balance: amt,
                                cardmemberName: item.cardmemberName || item.name || 'Anonymous Sponsor',
                                isFrozen: !!frozenCards[cardId]
                              };
                              return (
                                <SponsorCardItem
                                  key={card.id}
                                  card={card}
                                  isSelected={selectedCardId === cardId}
                                  onSelect={() => setSelectedCardId(cardId)}
                                  onToggleFreeze={() => handleToggleFreeze(cardId)}
                                />
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-slate-400 text-sm font-medium text-center">
                    No sponsors yet for this tournament. Be the first to sponsor!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Content */}
          <div className="space-y-6">

            {/* Public Announcements / Notices */}
            {announcements.length > 0 && (
              <div className="bg-[#0d0e12]/45 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
                <h4 className="font-bold text-base text-white tracking-wider uppercase flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400">campaign</span>
                  Public Notices
                </h4>
                <div className="space-y-3">
                  {announcements.map((notice) => (
                    <div key={notice.id} className="p-4 bg-black/35 border border-white/5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                          {notice.pin && <span className="material-symbols-outlined text-xs text-primary">push_pin</span>}
                          {notice.title}
                        </h5>
                        <span className="text-[8px] text-white/40 font-mono">{notice.time}</span>
                      </div>
                      <p className="text-[11px] text-white/70 leading-relaxed whitespace-pre-line">{notice.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      </main>

      {/* TOAST */}
      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ duration: 0.2 }}
            className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 bg-surface border border-primary/30 text-on-background px-3.5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-[300px] text-xs font-bold">
            <span className="material-symbols-outlined text-primary text-base shrink-0">check_circle</span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      {/* SPONSOR FORM MODAL */}
      {showSponsorForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowSponsorForm(false)}
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-base font-black text-slate-900">Sponsor This Tournament</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Step {sponsorStep} of 3</p>
              </div>
              <button onClick={() => setShowSponsorForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Step indicator */}
              <div className="flex gap-2">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${sponsorStep >= s ? 'bg-blue-600' : 'bg-slate-200'}`} />
                ))}
              </div>

              {/* STEP 1: Name, Amount, Message */}
              {sponsorStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Your Name *</label>
                    <input type="text" value={sponsorForm.name}
                      onChange={e => { if (!currentUser) setSponsorForm(f => ({ ...f, name: e.target.value })); }}
                      readOnly={!!currentUser}
                      placeholder="Enter your name"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400 ${currentUser ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-900'}`} />
                    {currentUser && <p className="text-[10px] text-blue-600 font-medium mt-0.5">Autofilled from your account</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                    <input type="email" value={sponsorForm.email}
                      onChange={e => { if (!currentUser) setSponsorForm(f => ({ ...f, email: e.target.value })); }}
                      readOnly={!!currentUser}
                      placeholder="your@email.com"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400 ${currentUser ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-900'}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Contribution Amount (₹) *</label>
                    <input type="number" min="1" value={sponsorForm.amount} onChange={e => setSponsorForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Message (optional)</label>
                    <textarea value={sponsorForm.message} onChange={e => setSponsorForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Write a message for the tournament..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400 resize-none" />
                  </div>
                  <button onClick={() => {
                    if (!sponsorForm.name.trim()) { triggerToast('Please enter your name.'); return; }
                    if (!sponsorForm.amount || parseInt(sponsorForm.amount) <= 0) { triggerToast('Please enter a valid amount.'); return; }
                    setSponsorStep(2);
                  }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all">
                    Next — Payment
                  </button>
                </div>
              )}

              {/* STEP 2: UPI Payment */}
              {sponsorStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Pay via UPI</p>
                    <p className="text-sm text-slate-700">
                      Send <span className="font-black text-slate-900">₹{parseInt(sponsorForm.amount || 0).toLocaleString('en-IN')}</span> to:
                    </p>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm font-mono font-bold text-slate-900">matchdistrict@upi</span>
                      <button onClick={() => { navigator.clipboard.writeText('matchdistrict@upi'); triggerToast('UPI ID copied!'); }}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition-colors">
                        Copy
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">Account Holder: Match District</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      After payment, proceed to upload your transaction screenshot and ID.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setSponsorStep(1)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">
                      Back
                    </button>
                    <button onClick={() => setSponsorStep(3)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all">
                      I've Paid — Next
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Upload Proof */}
              {sponsorStep === 3 && (
                <form onSubmit={handleSponsorContribute} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment Screenshot</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('sponsor-screenshot-input')?.click()}>
                      {sponsorScreenshot ? (
                        <div className="space-y-2">
                          <img src={URL.createObjectURL(sponsorScreenshot)} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain" />
                          <p className="text-[11px] text-slate-500">Click to change</p>
                        </div>
                      ) : (
                        <div className="py-4">
                          <span className="material-symbols-outlined text-3xl text-slate-300">image</span>
                          <p className="text-xs text-slate-500 mt-1">Tap to upload screenshot</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">JPEG, PNG, or WebP</p>
                        </div>
                      )}
                      <input id="sponsor-screenshot-input" type="file" accept="image/jpeg,image/png,image/webp"
                        className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 10 * 1024 * 1024) setSponsorScreenshot(f); else triggerToast('File must be under 10MB.'); }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">UPI Transaction ID *</label>
                    <input type="text" value={sponsorForm.transaction_id} onChange={e => setSponsorForm(f => ({ ...f, transaction_id: e.target.value }))}
                      placeholder="e.g. UPI0123456789"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment App</label>
                    <select value={sponsorForm.payment_app} onChange={e => setSponsorForm(f => ({ ...f, payment_app: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Select app</option>
                      <option value="Google Pay">Google Pay</option>
                      <option value="PhonePe">PhonePe</option>
                      <option value="Paytm">Paytm</option>
                      <option value="BHIM">BHIM</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setSponsorStep(2)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">
                      Back
                    </button>
                    <button type="submit" disabled={sponsorSubmitting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl text-sm transition-all">
                      {sponsorSubmitting ? 'Submitting...' : 'Submit Contribution'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SHARE POPUP */}
      <AnimatePresence>
        {showSharePopup && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowSharePopup(false)}
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full sm:w-[320px] bg-surface rounded-t-2xl sm:rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-semibold text-on-background">Share this tournament</h3>
                  <button onClick={() => setShowSharePopup(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-variant/50 text-on-surface-variant transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-1">
                  <button onClick={handleCopyLink}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/8 transition-colors text-left min-h-[40px]">
                    <span className="material-symbols-outlined text-[18px] text-primary">content_copy</span>
                    <span className="text-[13px] font-medium text-on-background">Copy Link</span>
                  </button>
                  <button onClick={handleCopyShareText}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/8 transition-colors text-left min-h-[40px]">
                    <span className="material-symbols-outlined text-[18px] text-primary">notes</span>
                    <span className="text-[13px] font-medium text-on-background">Copy Share Text</span>
                  </button>
                  <button onClick={handleShareWhatsApp}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-emerald-500/8 transition-colors text-left min-h-[40px]">
                    <svg className="w-[18px] h-[18px] text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span className="text-[13px] font-medium text-on-background">WhatsApp</span>
                  </button>
                  <button onClick={handleShareTelegram}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sky-500/8 transition-colors text-left min-h-[40px]">
                    <svg className="w-[18px] h-[18px] text-sky-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                    <span className="text-[13px] font-medium text-on-background">Telegram</span>
                  </button>
                  <button onClick={handleDownloadCard}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-500/8 transition-colors text-left min-h-[40px]">
                    <svg className="w-[18px] h-[18px] text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span className="text-[13px] font-medium text-on-background">Download Share Card</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



    </div>
  );
}

export default TournamentDetail;
