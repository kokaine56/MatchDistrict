import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import VerificationBadge from './VerificationBadge'
import gameBgmi from '../assets/supported_games/bgmi.png'
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
  disabled
}) {
  return (
    <div className="flex flex-col bg-surface/50 text-on-surface h-full min-w-0">
      <div className="flex flex-col w-full min-w-0">
        <h3 className="text-sm font-extrabold leading-tight truncate w-full text-on-surface">
          {title || "Untitled Tournament"}
        </h3>
        <hr className="border-outline-variant/30 my-0.5" />
        <div className="text-[10px] text-on-surface-variant flex items-center gap-1 mt-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span className="truncate">{orgName || 'Match District'}</span>
          {orgTier && <VerificationBadge tier={orgTier} size="xs" />}
        </div>
      </div>

      <hr className="border-outline-variant/30 my-0.5" />

      <div className="flex justify-between items-center mt-0.5 border border-outline-variant/20 rounded-lg p-1">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>
            Prize
          </span>
          <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-md mt-0.5 inline-block">{prizePool ? formatINR(prizePool) : 'TBA'}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Entry
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md mt-0.5 inline-block ${entryFeeAmount > 0 ? 'text-green-500 bg-green-500/10' : 'text-on-surface-variant bg-white/5'}`}>{entryDisplay}</span>
        </div>
      </div>

      <div className="mt-0.5">
        <span className="text-[10px] font-semibold text-on-surface-variant uppercase flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
          Match Type
        </span>
        <div className="flex gap-1 mt-0.5">
          <span className="text-[10px] font-bold bg-surface-variant/50 text-on-surface px-2 py-0.5 rounded-full">{matchLabel}</span>
          <span className="text-[10px] font-bold bg-surface-variant/50 text-on-surface px-2 py-0.5 rounded-full">{perspLabel}</span>
        </div>
      </div>

      <div className="mt-auto">
        <div className="flex items-center justify-between text-[10px] mt-0.5">
          <span className="font-semibold text-on-surface-variant">{filled}/{total} Slots</span>
          <span className="font-bold text-primary">{fillPct}%</span>
        </div>
        <div className="w-full h-1 rounded-full bg-surface-container-high overflow-hidden mt-0.5">
          <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      <button
        disabled={disabled}
        onClick={(e) => {
          if (disabled) return
          e.stopPropagation()
          onNavigate && onNavigate('tournament-detail', id)
        }}
        className={`w-full text-xs font-bold py-1.5 rounded-md mt-2.5 transition-all flex items-center justify-center ${buttonClassName}`}
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
  const isCtaDisabled = buttonConfig.disabled

  const matchLabel = MATCH_LABELS[(matchType || '').toLowerCase()] || matchType || 'N/A'
  const perspLabel = PERSPECTIVE_LABELS[(perspective || '').toLowerCase()] || perspective || 'N/A'
  const total = parseInt(slotsTotal) || 0
  const filled = parseInt(slotsFilled) || 0
  const fillPct = total > 0 ? Math.min(Math.round((filled / total) * 100), 100) : 0
  const entryDisplay = entryFeeAmount > 0 ? `₹${parseInt(entryFeeAmount).toLocaleString('en-IN')}` : (entryFee || 'Free')

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
    disabled: isCtaDisabled
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative flex flex-row bg-surface rounded-2xl border border-outline-variant/20 shadow-md overflow-hidden shrink-0 h-[200px] transition-[width] duration-300 ease-in-out ${isExpanded ? 'w-[320px]' : 'w-[150px]'} sm:w-full sm:max-w-[400px] md:max-w-[320px]`}
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
            className="absolute inset-0 w-full h-full object-cover"
            alt={imgAlt || title}
            src={imgError ? FALLBACK_IMG : (imgSrc || FALLBACK_IMG)}
            onError={handleImgError}
          />
        )}

        <div className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full font-label-caps text-[9px] sm:text-[10px] font-bold shadow-sm ${displayBadgeBg} ${badgeTextColor || 'text-white'}`}>
          {displayBadgeText}
        </div>

        {hasSponsors ? (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1 max-w-[90px] truncate select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span className="truncate">Sponsored</span>
          </div>
        ) : game ? (
          <div className="absolute bottom-2 left-2 select-none">
            {game.toLowerCase() === 'bgmi' ? (
              <img src={gameBgmi} alt={game} className="w-6 h-6 sm:w-8 sm:h-8 rounded-md shadow-sm object-cover bg-surface" />
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-surface/80 text-[7px] sm:text-[8px] font-bold text-on-surface-variant border border-outline-variant/30 uppercase tracking-wider">Coming Soon</span>
            )}
          </div>
        ) : null}
      </div>

      <div className={`flex flex-col justify-between h-[200px] overflow-hidden transition-[width,opacity,padding] duration-300 ease-in-out ${isExpanded ? 'w-[170px] opacity-100 p-2' : 'w-0 opacity-0 p-0'} sm:w-auto sm:flex-1 sm:opacity-100 sm:p-2.5 md:w-[170px] md:max-w-[170px]`}>
        <InfoContent {...infoProps} />
      </div>
    </motion.div>
  )
}

const TournamentCard = memo(TournamentCardBase)
export default TournamentCard
