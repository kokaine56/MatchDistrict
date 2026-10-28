import { memo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import VerificationBadge from './VerificationBadge'
import SponsoredStar from './SponsoredStar'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'
import {
  getTournamentLifecycleStatus,
  getStatusBadgeConfig,
  getCTAButtonConfig,
  getRegistrationButtonState
} from '../utils/tournamentLifecycle'
import { DEFAULT_BANNER } from '../utils/defaults.js'
import { getThemeConfig, getThemeTypography } from '../utils/themeEngine'
import ThemeCollectibleCardBg from './ThemeCollectibleCardBg'

const MATCH_LABELS = { solo: 'Solo', duo: 'Duo', squad: 'Squad' }
const PERSPECTIVE_LABELS = { tpp: 'TPP', fpp: 'FPP' }

const FALLBACK_IMG = DEFAULT_BANNER

const GAME_LOGOS = {
  bgmi: gameBgmi,
  'battlegrounds mobile india': gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant
}

function getGameLogo(game) {
  const key = (game || '').toLowerCase().trim()
  return GAME_LOGOS[key] || null
}

const formatStatusHeaderText = (text) => {
  const t = (text || '').toLowerCase().trim()
  if (t === 'upcoming') return 'Upcoming'
  if (t === 'reg. open' || t === 'registrations open' || t === 'open') return 'Registration Open'
  if (t === 'reg. closed' || t === 'closed') return 'Registration Closed'
  if (t === 'live') return 'Live'
  return text || 'Upcoming'
}

const formatINR = (val) => {
  const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? (val || 'TBA') : `₹${n.toLocaleString('en-IN')}`
}

function FloatingGunIconsBg({ color = '#D97706' }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.11] select-none z-0 rounded-2xl">
      {/* Icon 1: Floating Rifle Vector */}
      <div className="absolute top-3 right-3 animate-float-gun-1">
        <svg width="34" height="14" viewBox="0 0 70 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M 5 12 L 42 12 L 46 14 L 46 16 L 35 16 L 31 22 L 20 22 L 16 16 L 5 16 Z M 35 12 L 35 7 M 25 12 L 25 8 M 42 14 L 58 14"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Icon 2: Floating Tactical Scope */}
      <div className="absolute top-20 right-4 animate-float-crosshair">
        <svg width="22" height="22" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="15" cy="15" r="11" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
          <circle cx="15" cy="15" r="4" stroke={color} strokeWidth="1.5" />
          <line x1="15" y1="1" x2="15" y2="29" stroke={color} strokeWidth="1.2" />
          <line x1="1" y1="15" x2="29" y2="15" stroke={color} strokeWidth="1.2" />
        </svg>
      </div>

      {/* Icon 3: Floating SMG / Pistol Vector */}
      <div className="absolute bottom-10 left-3 animate-float-gun-2">
        <svg width="26" height="18" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M 4 8 L 26 8 L 29 11 L 30 18 L 22 24 L 17 18 L 10 18 L 4 13 Z M 16 8 L 16 4 M 22 8 L 22 5"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Icon 4: Floating Target Crosshair */}
      <div className="absolute top-12 left-4 animate-float-crosshair">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="2" stroke={color} strokeWidth="1.4" fill={color} />
        </svg>
      </div>
    </div>
  )
}

function WalletPassCard({
  id,
  title,
  game,
  lifecycleStatus,
  imgSrc,
  prizePool,
  entryFee,
  matchType,
  perspective,
  slotsTotal,
  slotsFilled,
  entryFeeAmount,
  orgName,
  orgTier,
  buttonText,
  onNavigate,
  buttonClassName,
  displayBadgeText,
  displayBadgeBg,
  hasSponsors,
  cardColor
}) {
  const activeTheme = getThemeConfig(cardColor)
  const cc = getThemeTypography(cardColor)
  const isGoldCard = ['gold', 'royal_gold', 'royal gold', 'royalgold'].includes((cardColor || '').toLowerCase().trim())
  const [isPassPopped, setIsPassPopped] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (!isPassPopped) return
    const handleCloseOthers = (e) => {
      if (e.detail?.id !== id) setIsPassPopped(false)
    }
    window.addEventListener('md-close-other-passes', handleCloseOthers)
    return () => window.removeEventListener('md-close-other-passes', handleCloseOthers)
  }, [isPassPopped, id])

  const togglePass = () => {
    const nextState = !isPassPopped
    setIsPassPopped(nextState)
    if (nextState) {
      window.dispatchEvent(new CustomEvent('md-close-other-passes', { detail: { id } }))
    }
  }

  const handleMouseEnter = () => { if (window.innerWidth >= 640) setIsHovered(true) }
  const handleMouseLeave = () => setIsHovered(false)

  const matchLabel = MATCH_LABELS[(matchType || '').toLowerCase()] || matchType || 'N/A'
  const perspLabel = PERSPECTIVE_LABELS[(perspective || '').toLowerCase()] || perspective || 'N/A'
  const total = parseInt(slotsTotal) || 0
  const filled = parseInt(slotsFilled) || 0
  const fillPct = total > 0 ? Math.min(Math.round((filled / total) * 100), 100) : 0
  const entryDisplay = entryFeeAmount > 0 ? `₹${parseInt(entryFeeAmount).toLocaleString('en-IN')}` : (entryFee || 'Free')
  const prizeDisplay = prizePool ? formatINR(prizePool) : 'TBA'

  return (
    <div
      className={`relative select-none py-2 w-[150px] h-[200px] shrink-0 pr-1.5 md:pr-3 transition-all duration-300 ${isHovered ? 'z-40' : isPassPopped ? 'z-30' : 'z-10'}`}
      style={{ perspective: '1000px', transform: 'rotate3d(1, -1, 0, 4deg)', transformStyle: 'preserve-3d', touchAction: 'pan-x pan-y' }}
    >
      <div
        onClick={togglePass}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="z-10 relative w-full h-full bg-surface-container-low rounded-2xl flex-shrink-0 transform cursor-pointer hover:scale-[1.01] transition-all duration-300 !touch-auto"
        style={{
          transform: isPassPopped ? 'rotateY(-6deg) translateX(-8px) translateZ(10px)' : 'rotateY(0deg) translateX(0) translateZ(10px)',
          transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformStyle: 'preserve-3d',
          boxShadow: isHovered ? `0 16px 40px rgba(0,0,0,0.7), 0 0 25px ${activeTheme.glowColor}` : '0 12px 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Layer A: Pouch backing */}
        <div className="absolute inset-0 rounded-2xl bg-[#0c0d12] border border-outline-variant/15 shadow-[inset_0_4px_20px_rgba(0,0,0,0.9)] z-0 pointer-events-none" />

        {/* Layer B: The Pass Card (z-10) */}
        <div
          className={`border rounded-2xl overflow-hidden p-2.5 pl-4 shadow-[0_12px_30px_rgba(0,0,0,0.3)] absolute top-[4%] bottom-[4%] right-0 w-[94%] flex flex-col justify-between transform ${isGoldCard ? 'royal-gold-card' : ''} ${isPassPopped ? 'z-50' : 'z-10'}`}
          style={{
            borderColor: activeTheme.borderHex,
            transform: isPassPopped
              ? 'translateX(100%) translateZ(-5px)'
              : (isHovered ? 'translateX(40px) scale-[1.02] translateZ(-5px)' : 'translateX(12px) translateZ(-5px)'),
            transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: isPassPopped ? 1 : 0.95
          }}
          onClick={(e) => {
            // Let click bubble up to parent
          }}
        >
          {/* 4-Layer Collectible Background Artwork, Particles & Volumetric Lighting */}
          <ThemeCollectibleCardBg themeId={cardColor} isHovered={isHovered} />

          <div className="space-y-1 relative z-10">
            {/* Top row with target SVG decoration */}
            <div className={`flex items-center justify-between border-b ${cc.divider} pb-0.5`}>
              <span className={`text-[7px] tracking-wider ${cc.statusText} font-extrabold leading-none`}>
                {formatStatusHeaderText(displayBadgeText)}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={cc.targetIcon}>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="23" />
                <line x1="1" y1="12" x2="23" y2="12" />
              </svg>
            </div>

            {/* Title & Organizer */}
            <div className="min-w-0">
              <h4 className={`text-[10px] font-black ${cc.titleText} tracking-tight uppercase leading-tight truncate w-full ${isGoldCard ? 'royal-gold-title !text-white' : ''}`} style={isGoldCard || cc.titleText?.includes('#FFFFFF') ? { color: '#FFFFFF' } : undefined}>
                {title}
              </h4>
              <div className={`flex items-center gap-0.5 text-[8px] ${cc.orgText} font-bold leading-none mt-0.5`}>
                <span className="truncate">by {orgName}</span>
                {orgTier && <VerificationBadge tier={orgTier} size="xs" />}
              </div>
            </div>

            {/* Prize & Entry Rows (Adaptive Contrast System: Light vs Dark Theme) */}
            <div className={`grid grid-cols-2 gap-2 py-1.5 border-y ${cc.divider} leading-none`}>
              {/* Prize Value */}
              <div className="flex items-center gap-1 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`${cc.prizeIcon || 'text-amber-400'} shrink-0`}>
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
                <span className={`text-[10px] sm:text-[11px] font-black ${cc.prizeText || 'text-white'} ${cc.prizeShadow || ''} tracking-tight truncate leading-none`}>
                  {prizeDisplay}
                </span>
                {hasSponsors && <SponsoredStar size={8} />}
              </div>

              {/* Entry Value */}
              <div className="flex items-center gap-1 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`${cc.entryIcon || 'text-emerald-400'} shrink-0`}>
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2Z" />
                  <path d="M13 5v2" />
                  <path d="M13 17v2" />
                  <path d="M13 11v2" />
                </svg>
                <span className={`text-[10px] sm:text-[11px] font-black ${cc.entryText || 'text-white'} ${cc.entryShadow || ''} tracking-tight truncate leading-none`}>
                  {entryDisplay}
                </span>
              </div>
            </div>

            {/* Format & Slots tracker */}
            <div className="space-y-1">
              <div className="space-y-0.5">
                <span className={`text-[6px] font-bold ${cc.formatLabel} uppercase tracking-widest block leading-none`}>FORMAT</span>
                <span className={`text-[8px] font-bold ${cc.formatValue} block leading-none truncate`}>
                  {matchLabel} &bull; {perspLabel}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className={`text-[6px] font-bold ${cc.slotLabel} uppercase tracking-widest block leading-none`}>SLOTS</span>
                <div className={`flex items-center gap-0.5 text-[8px] font-bold ${cc.slotValue} leading-none`}>
                  <span className={`material-symbols-outlined text-[10px] ${cc.slotIcon} leading-none`}>group</span>
                  <span>{filled}/{total} ({fillPct}%)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/60 relative z-10">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNavigate && onNavigate('tournament-detail', id)
              }}
              className={`flex-1 text-[8px] font-bold py-1 px-1.5 rounded ${cc.btnBg} ${cc.btnText || 'text-white'} hover:opacity-90 transition-all text-center leading-tight truncate`}
            >
              {buttonText || 'View'}
            </button>
            {getGameLogo(game) && (
              <div className={`rounded overflow-hidden ${cc.gameBg} p-0.5 border ${cc.gameBorder} shadow-sm shrink-0`}>
                <img 
                  src={getGameLogo(game)} 
                  alt={game} 
                  className="w-6 h-6 rounded object-contain select-none" 
                />
              </div>
            )}
          </div>
        </div>

        {/* Layer C: Cover image */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-low z-20 pointer-events-none !touch-auto">
          <img src={imgSrc || FALLBACK_IMG} alt={title} className="w-full h-full object-cover !touch-auto" />

          {/* LIVE Badge — top-right corner overlay, only shown when tournament is live */}
          {lifecycleStatus === 'live' && (
            <div
              className="absolute top-2 right-2 z-30 flex items-center gap-1 px-1.5 py-0.5 rounded-full pointer-events-none select-none"
              style={{
                background: 'rgba(30,5,5,0.82)',
                border: '1px solid rgba(239,68,68,0.45)',
                boxShadow: '0 0 10px 2px rgba(239,68,68,0.35), inset 0 0 6px rgba(239,68,68,0.1)',
              }}
            >
              <motion.span
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="block w-[5px] h-[5px] rounded-full bg-rose-500 shadow-[0_0_5px_rgba(239,68,68,0.9)] shrink-0"
              />
              <span
                className="text-[8px] font-extrabold uppercase tracking-widest leading-none"
                style={{ color: '#f87171' }}
              >
                LIVE
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoContent({
  title,
  prizePool,
  entryDisplay,
  entryFeeAmount,
  orgName,
  orgTier,
  matchLabel,
  perspLabel,
  filled,
  total,
  fillPct,
  onNavigate,
  id,
  buttonText,
  buttonClassName,
  displayBadgeText,
  displayBadgeBg,
  badgeTextColor
}) {
  return (
    <div className="flex flex-col justify-between bg-surface/50 text-on-surface h-full min-w-0">
      <div className="flex flex-col gap-y-0.5 min-w-0">
        <div className={`w-fit rounded px-2 py-0.5 text-[10px] tracking-wider font-semibold leading-none ${displayBadgeBg}`}>
          {formatStatusHeaderText(displayBadgeText)}
        </div>
        <h3 className="text-xs sm:text-sm font-extrabold leading-tight truncate w-full text-on-surface mt-0.5">
          {title || "Untitled Tournament"}
        </h3>
        <div className="text-[10px] text-on-surface-variant flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span className="truncate text-[9px] sm:text-[10px]">{orgName || 'Match District Arena'}</span>
          {orgTier && <VerificationBadge tier={orgTier} size="xs" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 py-1 min-h-0 border-y border-outline-variant/15 leading-none">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1 leading-none tracking-wider opacity-85">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>
            PRIZE POOL
          </span>
          <span className="text-[11px] sm:text-xs font-black text-white mt-0.5 inline-block leading-none">{prizePool ? formatINR(prizePool) : 'TBA'}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1 leading-none tracking-wider opacity-85">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            ENTRY FEE
          </span>
          <span className="text-[11px] sm:text-xs font-black text-white mt-0.5 inline-block leading-none">{entryDisplay}</span>
        </div>
      </div>

      <div className="flex flex-col gap-y-0.5">
        <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1 leading-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
          Match Type
        </span>
        <div className="flex gap-1 ml-[13px]">
          <span className="text-[9px] sm:text-[10px] font-bold bg-surface-variant/50 text-on-surface px-1.5 py-0.5 rounded-full leading-none">{matchLabel}</span>
          <span className="text-[9px] sm:text-[10px] font-bold bg-surface-variant/50 text-on-surface px-1.5 py-0.5 rounded-full leading-none">{perspLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-y-1">
        <div className="flex items-center justify-between text-[9px] sm:text-[10px] leading-none">
          <span className="font-semibold text-on-surface-variant flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {filled}/{total} Slots
          </span>
          <span className="font-bold text-primary">{fillPct}%</span>
        </div>
        <div className="w-full h-1 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onNavigate && onNavigate('tournament-detail', id)
        }}
        className={`w-full text-xs font-bold py-1 rounded-md transition-all flex items-center justify-center ${buttonClassName}`}
      >
        {buttonText}
      </button>
    </div>
  )
}

function TournamentCardBase({
  id,
  title,
  game,
  status,
  badgeText, badgeBg, badgeTextColor, badgeFontWeight,
  imgSrc, imgAlt,
  prizePool, entryFee,
  matchType, perspective, slotsTotal, slotsFilled, entryFeeAmount,
  orgName, orgTier, buttonText,
  onNavigate,
  hasSponsors,
  sponsoredAmount,
  isPreview,
  buttonClassName,
  registrationOpenDate,
  registrationCloseDate,
  startDate,
  date,
  forceWalletCard,
  cardColor,
  // Optional: viewer's own registration status for this tournament.
  // When supplied, overrides the generic lifecycle CTA.
  regStatus
}) {
  const isSponsored = hasSponsors || (parseInt(sponsoredAmount) > 0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  const lifecycleStatus = getTournamentLifecycleStatus({
    registrationOpenDate,
    registrationCloseDate,
    startDate: startDate || date,
    status
  })

  const badgeConfig = getStatusBadgeConfig(lifecycleStatus)

  // If we have the viewer's own registration status, use it to drive the button.
  // Otherwise fall back to the generic lifecycle CTA.
  const total = parseInt(slotsTotal) || 0
  const filled = parseInt(slotsFilled) || 0
  const isSlotsFull = total > 0 && filled >= total
  const regRow = regStatus ? { status: regStatus } : null
  const registrationBtnState = getRegistrationButtonState(regRow, lifecycleStatus, { slotsFull: isSlotsFull })
  const buttonConfig = registrationBtnState

  const displayBadgeText = badgeText || badgeConfig.text
  const displayBadgeBg = badgeBg || badgeConfig.bg

  const finalButtonText = buttonText || buttonConfig.text
  const finalButtonClass = buttonConfig.styleClass

  const matchLabel = MATCH_LABELS[(matchType || '').toLowerCase()] || matchType || 'N/A'
  const perspLabel = PERSPECTIVE_LABELS[(perspective || '').toLowerCase()] || perspective || 'N/A'
  const fillPct = total > 0 ? Math.min(Math.round((filled / total) * 100), 100) : 0
  const entryDisplay = entryFeeAmount > 0 ? `₹${parseInt(entryFeeAmount).toLocaleString('en-IN')}` : (entryFee || 'Free')

  const isLive = lifecycleStatus === 'live'

  const handleCardClick = () => {
    if (window.innerWidth >= 640) {
      if (onNavigate) {
        onNavigate('tournament-detail', id)
      }
    } else {
      setIsExpanded((prev) => !prev)
    }
  }

  const handleImgError = () => {
    if (!imgError) {
      setImgError(true)
    } else {
      setFallbackFailed(true)
    }
  }

  const infoProps = {
    title,
    prizePool,
    entryDisplay,
    entryFeeAmount,
    orgName,
    orgTier,
    matchLabel,
    perspLabel,
    filled,
    total,
    fillPct,
    onNavigate,
    id,
    buttonText: finalButtonText,
    buttonClassName: finalButtonClass,
    displayBadgeText,
    displayBadgeBg,
    badgeTextColor
  }

  return (
    <WalletPassCard
      id={id}
      title={title}
      game={game}
      lifecycleStatus={lifecycleStatus}
      imgSrc={imgError ? FALLBACK_IMG : (imgSrc || FALLBACK_IMG)}
      prizePool={prizePool}
      entryFee={entryFee}
      matchType={matchType}
      perspective={perspective}
      slotsTotal={slotsTotal}
      slotsFilled={slotsFilled}
      entryFeeAmount={entryFeeAmount}
      orgName={orgName}
      orgTier={orgTier}
      buttonText={finalButtonText}
      onNavigate={onNavigate}
      buttonClassName={finalButtonClass}
      displayBadgeText={displayBadgeText}
      displayBadgeBg={displayBadgeBg}
      hasSponsors={isSponsored}
      cardColor={cardColor}
    />
  )
}

const TournamentCard = memo(TournamentCardBase)
export default TournamentCard
