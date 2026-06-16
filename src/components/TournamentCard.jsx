import { memo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import VerificationBadge from './VerificationBadge'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'
import {
  getTournamentLifecycleStatus,
  getStatusBadgeConfig,
  getCTAButtonConfig
} from '../utils/tournamentLifecycle'

const MATCH_LABELS = { solo: 'Solo', duo: 'Duo', squad: 'Squad' }
const PERSPECTIVE_LABELS = { tpp: 'TPP', fpp: 'FPP' }

const formatINR = (val) => {
  const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? val : `₹${n.toLocaleString('en-IN')}`
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'

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
  displayBadgeBg
}) {
  const [isPassPopped, setIsPassPopped] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (!isPassPopped) return

    const handleCloseOthers = (e) => {
      if (e.detail?.id !== id) {
        setIsPassPopped(false)
      }
    }

    window.addEventListener('md-close-other-passes', handleCloseOthers)
    return () => {
      window.removeEventListener('md-close-other-passes', handleCloseOthers)
    }
  }, [isPassPopped, id])

  const togglePass = () => {
    const nextState = !isPassPopped
    setIsPassPopped(nextState)
    if (nextState) {
      const event = new CustomEvent('md-close-other-passes', {
        detail: { id }
      })
      window.dispatchEvent(event)
    }
  }

  const handleMouseEnter = () => {
    if (window.innerWidth >= 640) {
      setIsHovered(true)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  const matchLabel = MATCH_LABELS[(matchType || '').toLowerCase()] || matchType || 'N/A'
  const perspLabel = PERSPECTIVE_LABELS[(perspective || '').toLowerCase()] || perspective || 'N/A'
  const total = parseInt(slotsTotal) || 0
  const filled = parseInt(slotsFilled) || 0
  const fillPct = total > 0 ? Math.min(Math.round((filled / total) * 100), 100) : 0
  const entryDisplay = entryFeeAmount > 0 ? `₹${parseInt(entryFeeAmount).toLocaleString('en-IN')}` : (entryFee || 'Free')
  const prizeDisplay = prizePool ? formatINR(prizePool) : 'TBA'

  return (
    <div 
      className={`relative select-none py-2 w-[150px] h-[200px] shrink-0 pr-1.5 md:pr-3 transition-all duration-300 !touch-pan-y ${isHovered ? 'z-40' : isPassPopped ? 'z-30' : 'z-10'}`}
      style={{
        perspective: '1000px',
        transform: 'rotate3d(1, -1, 0, 4deg)',
        transformStyle: 'preserve-3d'
      }}
    >
      {/* The Pocket Sleeve Container */}
      <div 
        onClick={togglePass}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="z-10 relative w-full h-full bg-surface-container-low rounded-2xl flex-shrink-0 transform shadow-[0_12px_24px_rgba(0,0,0,0.6)] cursor-pointer hover:scale-[1.01] transition-all duration-300 !touch-pan-y"
        style={{
          transform: isPassPopped ? 'rotateY(-6deg) translateX(-8px) translateZ(10px)' : 'rotateY(0deg) translateX(0) translateZ(10px)',
          transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Layer A: The Pouch Backing (z-0) */}
        <div 
          className="absolute inset-0 rounded-2xl bg-[#0c0d12] border border-outline-variant/15 shadow-[inset_0_4px_20px_rgba(0,0,0,0.9)] z-0 pointer-events-none"
        />

        {/* Layer B: The White Pass Card (z-10) */}
        <div
          className={`bg-white border border-slate-200 rounded-2xl p-2.5 pl-4 shadow-[0_12px_30px_rgba(0,0,0,0.3)] absolute top-[4%] bottom-[4%] right-0 w-[94%] flex flex-col justify-between transform ${isPassPopped ? 'z-50' : 'z-10'}`}
          style={{
            transform: isPassPopped
              ? 'translateX(100%) translateZ(-5px)'
              : (isHovered ? 'translateX(40px) translateZ(-5px)' : 'translateX(12px) translateZ(-5px)'),
            transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: isPassPopped ? 1 : 0.95
          }}
          onClick={(e) => {
            // Let click bubble up to the parent container so clicking it tucks it back
          }}
        >
          <div className="space-y-1">
            {/* Top row with target SVG decoration */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-0.5">
              <span className="text-[7px] tracking-wider text-slate-500 font-extrabold uppercase leading-none">
                {formatStatusHeaderText(displayBadgeText)}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="23" />
                <line x1="1" y1="12" x2="23" y2="12" />
              </svg>
            </div>

            {/* Title & Organizer */}
            <div className="min-w-0">
              <h4 className="text-[10px] font-black text-slate-900 tracking-tight uppercase leading-tight truncate w-full">
                {title}
              </h4>
              <div className="flex items-center gap-0.5 text-[8px] text-slate-800 font-bold leading-none mt-0.5">
                <span className="truncate">by {orgName}</span>
                {orgTier && <VerificationBadge tier={orgTier} size="xs" />}
              </div>
            </div>

            {/* Prize & Entry Rows */}
            <div className="grid grid-cols-2 gap-1 py-1 border-y border-slate-200 text-center leading-none">
              <div className="bg-emerald-50 border border-emerald-100 rounded py-0.5 px-0.5 flex items-center justify-center">
                <span className="text-[7px] font-extrabold text-emerald-600 tracking-tight uppercase truncate">
                  {prizeDisplay}
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded py-0.5 px-0.5 flex items-center justify-center">
                <span className="text-[7px] font-extrabold text-amber-600 tracking-tight uppercase truncate">
                  {entryDisplay}
                </span>
              </div>
            </div>

            {/* Format & Slots tracker (Shifted up to empty center quadrant) */}
            <div className="space-y-1 text-slate-800">
              <div className="space-y-0.5">
                <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest block leading-none">FORMAT</span>
                <span className="text-[8px] font-bold text-slate-900 block leading-none truncate">
                  {matchLabel} &bull; {perspLabel}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest block leading-none">SLOTS</span>
                <div className="flex items-center gap-0.5 text-[8px] font-bold text-slate-900 leading-none">
                  <span className="material-symbols-outlined text-[10px] text-slate-500 leading-none">group</span>
                  <span>{filled}/{total} ({fillPct}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row framing the Game Icon and Action button */}
          <div className="flex items-center justify-between gap-1 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNavigate && onNavigate('tournament-detail', id)
              }}
              className={`flex-grow text-[8px] font-extrabold py-0.5 rounded transition-all flex items-center justify-center ${buttonClassName || 'bg-primary hover:bg-primary/95 text-white active:scale-95'}`}
            >
              {buttonText || 'View'}
            </button>
            {getGameLogo(game) && (
              <div className="rounded overflow-hidden bg-slate-100/50 p-0.5 border border-slate-200/40 shadow-sm shrink-0">
                <img 
                  src={getGameLogo(game)} 
                  alt={game} 
                  className="w-6 h-6 rounded object-contain select-none grayscale opacity-40 mix-blend-multiply" 
                />
              </div>
            )}
          </div>
        </div>

        {/* Layer C: The Wallet Front Envelope Face (z-20) */}
        <div 
          className="absolute inset-0 rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-low z-20 pointer-events-none !touch-pan-y"
        >
          <img
            src={imgSrc || FALLBACK_IMG}
            alt={title}
            className="w-full h-full object-cover !touch-pan-y"
          />
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
      {/* 1. Header Stack */}
      <div className="flex flex-col gap-y-0.5 min-w-0">
        {/* Status Tag */}
        <div className={`w-fit rounded px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold leading-none ${displayBadgeBg}`}>
          {displayBadgeText}
        </div>
        {/* Title */}
        <h3 className="text-xs sm:text-sm font-extrabold leading-tight truncate w-full text-on-surface mt-0.5">
          {title || "Untitled Tournament"}
        </h3>
        {/* Organizer */}
        <div className="text-[10px] text-on-surface-variant flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span className="truncate text-[9px] sm:text-[10px]">{orgName || 'Match District'}</span>
          {orgTier && <VerificationBadge tier={orgTier} size="xs" />}
        </div>
      </div>

      {/* 2. Middle Row: Prize & Entry */}
      <div className="flex justify-between items-center border border-outline-variant/20 rounded-lg p-1 min-h-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1 leading-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>
            Prize
          </span>
          <span className="text-[11px] sm:text-xs font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block leading-none">{prizePool ? formatINR(prizePool) : 'TBA'}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1 leading-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Entry
          </span>
          <span className={`text-[11px] sm:text-xs font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block leading-none ${entryFeeAmount > 0 ? 'text-amber-500 bg-amber-500/10' : 'text-on-surface-variant bg-white/5'}`}>{entryDisplay}</span>
        </div>
      </div>

      {/* 3. Match Details */}
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

      {/* 4. Slots Tracker */}
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

      {/* 5. CTA Button */}
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
  isPreview,
  buttonClassName,
  registrationOpenDate,
  registrationCloseDate,
  startDate,
  date
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  // Compute time lifecycle state machine
  const lifecycleStatus = getTournamentLifecycleStatus({
    registrationOpenDate,
    registrationCloseDate,
    startDate: startDate || date,
    status
  })

  const badgeConfig = getStatusBadgeConfig(lifecycleStatus)
  const buttonConfig = getCTAButtonConfig(lifecycleStatus)

  const displayBadgeText = badgeText || badgeConfig.text
  const displayBadgeBg = badgeBg || badgeConfig.bg

  const finalButtonText = buttonText || buttonConfig.text
  const finalButtonClass = buttonConfig.styleClass

  const matchLabel = MATCH_LABELS[(matchType || '').toLowerCase()] || matchType || 'N/A'
  const perspLabel = PERSPECTIVE_LABELS[(perspective || '').toLowerCase()] || perspective || 'N/A'
  const total = parseInt(slotsTotal) || 0
  const filled = parseInt(slotsFilled) || 0
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

  if (isLive) {
    return (
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`relative flex flex-row bg-surface rounded-2xl border border-outline-variant/20 shadow-md overflow-hidden shrink-0 h-[200px] transition-[width] duration-300 ease-in-out !touch-pan-y ${isExpanded ? 'w-[320px]' : 'w-[150px]'} sm:w-full sm:max-w-[400px] md:max-w-[320px]`}
      >
        <div
          onClick={handleCardClick}
          className="relative w-[150px] h-[200px] shrink-0 cursor-pointer"
        >
          {isPreview && !imgSrc ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container border border-dashed border-outline-variant/40 m-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-outline-variant mb-1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span className="text-[7px] text-outline-variant font-medium uppercase tracking-wider text-center px-1 leading-tight">No Cover<br/>Image</span>
            </div>
          ) : fallbackFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-variant mb-1">
                <path d="M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>
                <path d="M8 14h8"/>
                <path d="M8 17h5"/>
              </svg>
              <span className="text-[8px] text-on-surface-variant font-medium uppercase tracking-wider">Image Unavailable</span>
            </div>
          ) : (
            <img
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover !touch-pan-y"
              alt={imgAlt || title}
              src={imgError ? FALLBACK_IMG : (imgSrc || FALLBACK_IMG)}
              onError={handleImgError}
            />
          )}

          {hasSponsors ? (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1 max-w-[90px] truncate select-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span className="truncate">Sponsored</span>
            </div>
          ) : game ? (
            <div className="absolute bottom-2 left-2 select-none">
              {game.toLowerCase() === 'bgmi' ? (
                <img src={gameBgmi} alt={game} className="w-6 h-6 sm:w-8 sm:h-8 rounded-md shadow-sm object-cover bg-surface !touch-pan-y" />
              ) : (
                <span className="px-1.5 py-0.5 rounded-md bg-surface/80 text-[7px] sm:text-[8px] font-bold text-on-surface-variant border border-outline-variant/30 uppercase tracking-wider">Coming Soon</span>
              )}
            </div>
          ) : null}
        </div>

        <div className={`flex flex-col justify-between h-[200px] overflow-hidden transition-[width,opacity,padding] duration-300 ease-in-out ${isExpanded ? 'w-[170px] opacity-100 p-2' : 'w-0 opacity-0 p-0'} sm:w-auto sm:flex-1 sm:opacity-100 sm:p-2 md:w-[170px] md:max-w-[170px]`}>
          <InfoContent {...infoProps} />
        </div>
      </motion.div>
    )
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
    />
  )
}

const TournamentCard = memo(TournamentCardBase)
export default TournamentCard
