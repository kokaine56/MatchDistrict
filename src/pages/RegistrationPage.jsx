import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import LoadingScreen from '../components/LoadingScreen.jsx'
import StickyBottomBar from '../components/StickyBottomBar.jsx'
import BottomSheetModal from '../components/BottomSheetModal.jsx'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { uploadImage } from '../utils/imagekitUpload.js'
import GameIcon from '../components/GameIcon'
import { normalizeGameName } from '../utils/gameUtils.js'


const INPUT_BASE =
  'w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none transition-colors'

const inputCls = (invalid) =>
  `${INPUT_BASE} ${invalid ? 'border-red-500/70 bg-red-500/5 focus:border-red-500' : 'border-white/10 focus:border-primary/50'}`

// Visual/form order — the order these appear on the page determines the
// "first invalid field" scroll/focus target.
const ALL_FIELDS = [
  'teamName', 'phone', 'captainIgn', 'captainUid',
  'player_0_ign', 'player_0_uid',
  'player_1_ign', 'player_1_uid',
  'player_2_ign', 'player_2_uid',
  'sub_0_ign', 'sub_0_uid',
  'sub_1_ign', 'sub_1_uid',
]

export const toMessage = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    if (value.message) return toMessage(value.message)
    if (value.error) return toMessage(value.error)
    if (value.name) return String(value.name)
    if (value.label) return String(value.label)
    if (value.index != null) return `Group ${value.index + 1}`
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const getFieldError = (field, f, requiredPlayers = 3) => {
  switch (field) {
    case 'teamName':
      if (!f.teamName.trim()) return 'Team name is required'
      if (f.teamName.trim().length > 16) return 'Team name must be 16 characters or fewer'
      return ''
    case 'phone':
      if (!f.phone.trim()) return 'Phone is required'
      if (f.phone.replace(/\D/g, '').length !== 10) return 'Phone must be 10 digits'
      return ''
    case 'captainIgn':
      return f.captainIgn.trim() ? '' : 'Captain IGN is required'
    case 'captainUid':
      if (!f.captainUid.trim()) return 'Captain UID is required'
      if (!/^\d+$/.test(f.captainUid)) return 'Captain UID must be numbers only'
      return ''
    default:
      break
  }

  const pIgn = field.match(/^player_(\d+)_ign$/)
  if (pIgn) {
    const i = Number(pIgn[1])
    if (i >= requiredPlayers) return ''
    return f.players[i] && f.players[i].ign.trim() ? '' : `Player ${i + 2} IGN is required`
  }
  const pUid = field.match(/^player_(\d+)_uid$/)
  if (pUid) {
    const i = Number(pUid[1])
    if (i >= requiredPlayers) return ''
    if (!f.players[i]) return ''
    if (!f.players[i].uid.trim()) return `Player ${i + 2} UID is required`
    if (!/^\d+$/.test(f.players[i].uid)) return `Player ${i + 2} UID must be numbers only`
    return ''
  }
  const sIgn = field.match(/^sub_(\d+)_ign$/)
  if (sIgn) {
    const i = Number(sIgn[1])
    if (!f.substitutes[i]) return ''
    if (f.substitutes[i].uid.trim() && !f.substitutes[i].ign.trim()) return `Sub ${i + 1} IGN is required`
    return ''
  }
  const sUid = field.match(/^sub_(\d+)_uid$/)
  if (sUid) {
    const i = Number(sUid[1])
    if (!f.substitutes[i]) return ''
    if (f.substitutes[i].ign.trim() && !f.substitutes[i].uid.trim()) return `Sub ${i + 1} UID is required`
    if (f.substitutes[i].uid.trim() && !/^\d+$/.test(f.substitutes[i].uid)) return `Sub ${i + 1} UID must be numbers only`
    return ''
  }
  return ''
}

const validateForm = (f, requiredPlayers = 3) => {
  const errs = {}
  for (const key of ALL_FIELDS) {
    const msg = getFieldError(key, f, requiredPlayers)
    if (msg) errs[key] = msg
  }
  return errs
}

const FieldError = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="text-red-400 text-xs mt-1">{toMessage(message)}</p>
  ) : null

const UPI_APPS = [
  { id: 'google_pay', name: 'Google Pay', label: 'Google Pay' },
  { id: 'phonepe', name: 'PhonePe', label: 'PhonePe' },
  { id: 'paytm', name: 'Paytm', label: 'Paytm' },
  { id: 'bhim', name: 'BHIM', label: 'BHIM' },
  { id: 'amazon_pay', name: 'Amazon Pay', label: 'Amazon Pay' },
  { id: 'cred', name: 'CRED', label: 'CRED' },
  { id: 'whatsapp_pay', name: 'WhatsApp Pay', label: 'WhatsApp Pay' },
  { id: 'mobikwik', name: 'MobiKwik', label: 'MobiKwik' },
  { id: 'other', name: 'Other UPI App', label: 'Other UPI App' },
]

function getPaymentAppLabel(appIdOrName) {
  if (!appIdOrName) return 'Select payment app'
  const found = UPI_APPS.find(
    a => a.id.toLowerCase() === appIdOrName.toLowerCase() ||
         a.name.toLowerCase() === appIdOrName.toLowerCase() ||
         a.label.toLowerCase() === appIdOrName.toLowerCase()
  )
  return found ? found.label : appIdOrName
}

function PaymentAppIcon({ id, name, className = 'w-6 h-6' }) {
  const key = (id || name || '').toLowerCase()
  const assets = {
    google_pay: ['/payment-brand-assets/google-pay-logo.png', 'Google Pay official logo'],
    'google pay': ['/payment-brand-assets/google-pay-logo.png', 'Google Pay official logo'],
    gpay: ['/payment-brand-assets/google-pay-logo.png', 'Google Pay official logo'],
    phonepe: ['/payment-brand-assets/phonepe-logo.svg', 'PhonePe official logo'],
    'phone pe': ['/payment-brand-assets/phonepe-logo.svg', 'PhonePe official logo'],
    paytm: ['/payment-brand-assets/paytm-brand.png', 'Paytm official logo'],
    bhim: ['/payment-brand-assets/bhim-logo.svg', 'BHIM official logo'],
    upi: ['/payment-brand-assets/upi-logo.svg', 'UPI official logo'],
    'upi app': ['/payment-brand-assets/upi-logo.svg', 'UPI official logo'],
  }
  const asset = assets[key]
  if (asset) return <img src={asset[0]} alt={asset[1]} className={`${className} object-contain`} />
  return (
    <svg viewBox="0 0 24 24" className={`${className} text-white/70`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function PaymentAppDropdown({ value, onChange, error }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openUpwards, setOpenUpwards] = useState(false)
  const containerRef = useRef(null)
  const listboxRef = useRef(null)

  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [])

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setOpenUpwards(spaceBelow < 280 && rect.top > 280)
    }
    setIsOpen(prev => !prev)
  }

  const selectedApp = UPI_APPS.find(
    a => a.id.toLowerCase() === (value || '').toLowerCase() ||
         a.name.toLowerCase() === (value || '').toLowerCase()
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        handleToggle()
        return
      }
      const currentIndex = UPI_APPS.findIndex(a => a.id === selectedApp?.id)
      const nextIndex = e.key === 'ArrowDown'
        ? (currentIndex + 1) % UPI_APPS.length
        : (currentIndex - 1 + UPI_APPS.length) % UPI_APPS.length
      onChange(UPI_APPS[nextIndex].id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        e.preventDefault()
        handleToggle()
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <label id="upi-app-select-label" className="block text-xs font-semibold text-on-surface-variant mb-1.5">
        Which UPI app did you use to pay? <span className="text-error">*</span>
      </label>
      <button
        type="button"
        id="upi-app-dropdown-btn"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="upi-app-select-label upi-app-dropdown-btn"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`w-full bg-surface-container-low border ${
          error
            ? 'border-error ring-1 ring-error/30'
            : isOpen
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-outline-variant/30 hover:border-outline-variant/60'
        } rounded-xl px-4 py-3 text-sm flex items-center justify-between text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer shadow-sm`}
      >
        <span className="flex items-center gap-3 min-w-0">
          {selectedApp ? (
            <>
              <span className="w-7 h-7 rounded-lg bg-surface-variant/80 border border-outline-variant/20 flex items-center justify-center shrink-0 p-1">
                <PaymentAppIcon id={selectedApp.id} className="w-5 h-5 shrink-0" />
              </span>
              <span className="text-on-background font-semibold truncate">{selectedApp.label}</span>
            </>
          ) : (
            <span className="text-on-surface-variant/60 text-sm">Select payment app</span>
          )}
        </span>
        <span className={`material-symbols-outlined text-lg text-on-surface-variant shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}>
          expand_more
        </span>
      </button>

      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-labelledby="upi-app-select-label"
          className={`absolute left-0 right-0 z-50 bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-2xl py-1.5 max-h-60 overflow-y-auto backdrop-blur-xl transition-all ${
            openUpwards ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          }`}
        >
          {UPI_APPS.map((app) => {
            const isSelected = selectedApp?.id === app.id
            return (
              <button
                key={app.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(app.id)
                  setIsOpen(false)
                }}
                className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm transition-colors text-left cursor-pointer ${
                  isSelected
                    ? 'bg-primary/15 text-primary font-bold'
                    : 'text-on-surface-variant hover:bg-surface-variant/70 hover:text-on-background'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-surface-variant/70 border border-outline-variant/20 flex items-center justify-center shrink-0 p-1">
                    <PaymentAppIcon id={app.id} className="w-5 h-5 shrink-0" />
                  </span>
                  <span className="truncate">{app.label}</span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-base shrink-0">check</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="text-error text-xs mt-1.5 font-medium">{error}</p>}
    </div>
  )
}

const rosterOf = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter(s => s && (typeof s === 'string' ? s.trim() : (s.ign || s.uid)))
      .map(s => (typeof s === 'string' ? { ign: s.trim(), uid: '' } : { ign: s.ign || '', uid: s.uid || '' }))
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return rosterOf(parsed)
    } catch {
      return []
    }
  }
  return []
}

const getPresetRoster = (preset) => {
  if (!preset) return []
  const pList = rosterOf(preset.players)
  if (pList.length > 0) return pList
  return rosterOf(preset.members)
}

const getPresetSubs = (preset) => {
  if (!preset) return []
  return rosterOf(preset.substitutes)
}

/**
 * Downscales an image to at most 1600px on the longest side and outputs JPEG at 0.8 quality.
 * If HEIC/HEIF cannot be decoded by the browser, cleanly rejects with a descriptive message.
 */
async function downscaleScreenshot(file) {
  if (!file) return file
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        const maxDim = 1600
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return resolve(file)
        }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = (file.name || 'screenshot').replace(/\.[^.]+$/, '')
              const convertedFile = new File([blob], `${baseName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              resolve(convertedFile)
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          0.8
        )
      } catch {
        resolve(file)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      if (isHeic) {
        reject(new Error('HEIC/HEIF images cannot be decoded by your browser. Please select or take a JPEG, PNG, or WebP screenshot.'))
      } else {
        reject(new Error('Could not decode the selected image file.'))
      }
    }
    img.src = objectUrl
  })
}

function RegistrationPage({ onNavigate }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [currentUser] = useCurrentUser()
  const fileInputRef = useRef(null)
  const paymentSubmittedRef = useRef(false)

  const [tourney, setTourney] = useState(null)
  const [loadingTourney, setLoadingTourney] = useState(true)
  const [step, setStep] = useState('form')

  const [form, setForm] = useState({
    teamName: '',
    email: '',
    phone: '',
    captainIgn: '',
    captainUid: '',
    players: [{ ign: '', uid: '' }, { ign: '', uid: '' }, { ign: '', uid: '' }],
    substitutes: [{ ign: '', uid: '' }, { ign: '', uid: '' }],
  })
  const [savedPresets, setSavedPresets] = useState([])
  const [loadingPresets, setLoadingPresets] = useState(false)
  const [presetsError, setPresetsError] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetRosterWarning, setPresetRosterWarning] = useState('')
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [registeredTeam, setRegisteredTeam] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [amountToPay, setAmountToPay] = useState(null)
  const [predictedGroup, setPredictedGroup] = useState(null)

  const [payment, setPayment] = useState({
    app: '',
    transactionId: '',
    screenshotFile: null,
    screenshotPreview: null,
  })
  const [paymentErrors, setPaymentErrors] = useState({})
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [copiedToast, setCopiedToast] = useState('')
  const [copiedRegId, setCopiedRegId] = useState(false)
  const [submittedTimeIST, setSubmittedTimeIST] = useState('')
  const [rejectedReg, setRejectedReg] = useState(null)
  const [discordLinkChecked, setDiscordLinkChecked] = useState(false)
  const [discordLinked, setDiscordLinked] = useState(false)

  const isPaid = parseInt(tourney?.entry_fee_amount || 0) > 0
  const entryFee = parseInt(tourney?.entry_fee_amount || 0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`/api/tournaments/${id}/my-registration`, { credentials: 'include', headers })
        const data = await res.json()
        if (!cancelled) setDiscordLinked(Boolean(data?.discord_linked))
      } catch {
        if (!cancelled) setDiscordLinked(false)
      } finally {
        if (!cancelled) setDiscordLinkChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoadingTourney(true)
    fetchJsonWithRetry(`/api/tournaments/${id}`).then(({ ok, data }) => {
      if (ok && data?.success && data.tournament) {
        setTourney(data.tournament)
      }
      setLoadingTourney(false)
    })
  }, [id])

  useEffect(() => {
    if (!currentUser || !tourney) return
    setForm(prev => ({
      ...prev,
      email: prev.email || currentUser.email || '',
      captainIgn: prev.captainIgn || currentUser.name || '',
    }))
  }, [currentUser, tourney])

  // Fetch the user's saved squad presets (Teams & Squads feature) for auto-fill
  const fetchPresets = useCallback(() => {
    if (!currentUser) return
    setLoadingPresets(true)
    setPresetsError('')
    getAuthToken()
      .then(token => {
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        return fetch('/api/team-presets', {
          credentials: 'include',
          headers,
        })
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load presets (${res.status})`)
        }
        return res.json()
      })
      .then(data => {
        if (data.success && Array.isArray(data.presets)) {
          setSavedPresets(data.presets)
          setPresetsError('')
        } else {
          throw new Error(data.message || 'Failed to load presets')
        }
      })
      .catch(err => {
        setPresetsError('Could not load saved squads. Please try again.')
      })
      .finally(() => {
        setLoadingPresets(false)
      })
  }, [currentUser])

  useEffect(() => {
    fetchPresets()
  }, [fetchPresets])

  const matchType = String(tourney?.match_type || tourney?.matchType || 'squad').toLowerCase()
  const matchLabel = matchType === 'solo' ? 'Solo' : matchType === 'duo' ? 'Duo' : 'Squad'
  const requiredPlayers = matchType === 'solo' ? 0 : matchType === 'duo' ? 1 : 3

  const presetsWithStatus = useMemo(() => {
    if (!savedPresets || savedPresets.length === 0) return []
    const tourneyGame = normalizeGameName(tourney?.game).toLowerCase()

    return savedPresets.map(p => {
      const pRoster = getPresetRoster(p)
      const pGame = normalizeGameName(p.game || 'BGMI').toLowerCase()
      const isGameMatch = !tourneyGame || !pGame || tourneyGame === pGame
      const hasEnoughPlayers = pRoster.length >= requiredPlayers

      let disabledReason = ''
      if (!isGameMatch) {
        disabledReason = `saved for ${p.game || 'other game'}`
      } else if (!hasEnoughPlayers) {
        disabledReason = `needs ${requiredPlayers} player${requiredPlayers === 1 ? '' : 's'} for ${matchLabel} (has ${pRoster.length})`
      }

      return {
        ...p,
        rosterCount: pRoster.length,
        selectable: isGameMatch && hasEnoughPlayers,
        disabledReason,
      }
    }).sort((a, b) => {
      if (a.selectable !== b.selectable) return a.selectable ? -1 : 1
      return (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)
    })
  }, [savedPresets, tourney, requiredPlayers, matchLabel])

  const applyPreset = (preset) => {
    const playersRaw = getPresetRoster(preset)
    const subsRaw = getPresetSubs(preset)
    if (playersRaw.length < requiredPlayers) {
      setPresetRosterWarning(`Not enough players in this squad for this ${matchLabel} tournament.`)
      return
    }
    setPresetRosterWarning('')
    const pad = (list, n) => {
      const out = (list || []).slice(0, n).map(s => ({ ign: s?.ign || '', uid: s?.uid || '' }))
      while (out.length < n) out.push({ ign: '', uid: '' })
      return out
    }
    setForm(prev => {
      const next = {
        ...prev,
        teamName: preset.team_name || prev.teamName,
        captainIgn: preset.captain || prev.captainIgn,
        captainUid: preset.captain_uid || prev.captainUid,
        players: pad(playersRaw, 3),
        substitutes: pad(subsRaw, 2),
      }
      setErrors(validateForm(next, requiredPlayers))
      return next
    })
    setTouched({})
  }

  // Reset modal state when entering payment step
  useEffect(() => {
    if (step === 'payment') {
      setShowConfirmModal(false)
      paymentSubmittedRef.current = false
    }
  }, [step])

  // Redirect if already registered with an active status
  useEffect(() => {
    if (!currentUser || !tourney || !id) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAuthToken()
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(`/api/tournaments/${id}/registrations`, {
          credentials: 'include',
          headers,
        })
        const data = await res.json()
        if (cancelled) return
        if (data.success && data.registrations) {
          const activeStatuses = ['pending', 'pending_payment', 'approved', 'confirmed', 'waitlisted']
          const myReg = data.registrations.find(r =>
            r.user_id === currentUser.id && activeStatuses.includes((r.status || '').toLowerCase())
          )
          if (myReg) {
            navigate(`/tournaments/${id}`, { replace: true })
            return
          }
          const myRej = data.registrations.find(r =>
            r.user_id === currentUser.id && ['rejected', 'payment_rejected'].includes((r.status || '').toLowerCase())
          )
          if (myRej) {
            setRejectedReg(myRej)
          }
        }
      } catch (_) {}
    })()
    return () => { cancelled = true }
  }, [currentUser, tourney, id, navigate])

  const updateField = (field, value) => {
    const next = { ...form, [field]: value }
    setForm(next)
    const msg = getFieldError(field, next, requiredPlayers)
    setErrors(prev => (prev[field] === msg ? prev : { ...prev, [field]: msg }))
  }

  const updatePlayer = (index, field, value) => {
    const players = form.players.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    const next = { ...form, players }
    setForm(next)
    const a = `player_${index}_ign`
    const b = `player_${index}_uid`
    setErrors(prev => {
      const updates = { [a]: getFieldError(a, next, requiredPlayers), [b]: getFieldError(b, next, requiredPlayers) }
      return prev[a] === updates[a] && prev[b] === updates[b] ? prev : { ...prev, ...updates }
    })
  }

  const updateSub = (index, field, value) => {
    const substitutes = form.substitutes.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    const next = { ...form, substitutes }
    setForm(next)
    const a = `sub_${index}_ign`
    const b = `sub_${index}_uid`
    setErrors(prev => {
      const updates = { [a]: getFieldError(a, next, requiredPlayers), [b]: getFieldError(b, next, requiredPlayers) }
      return prev[a] === updates[a] && prev[b] === updates[b] ? prev : { ...prev, ...updates }
    })
  }

  const validate = () => {
    // email is auto-populated from authenticated user — no visible field, no validation needed
    const errs = validateForm(form, requiredPlayers)
    setErrors(errs)
    return errs
  }

  const scrollAndFocusFirstInvalid = (errs) => {
    const firstKey = ALL_FIELDS.find(key => errs[key])
    if (!firstKey) return
    const el = document.querySelector(`[data-field="${firstKey}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      try {
        el.focus({ preventScroll: true })
      } catch {
        el.focus()
      }
    }, 80)
  }

  const handleRegisterTeam = async (e) => {
    e.preventDefault()
    setServerError('')
    const errs = validate()
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => scrollAndFocusFirstInvalid(errs))
      return
    }
    setIsSubmitting(true)
    try {
      const token = await getAuthToken()
      const members = form.players.filter(p => p.ign.trim() && p.uid.trim())
      const subs = form.substitutes.filter(s => s.ign.trim() && s.uid.trim())
      const allMembers = [...members, ...subs]

      const formPayload = {
        team_name: form.teamName.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/\D/g, ''),
        captain: form.captainIgn.trim(),
        captain_uid: form.captainUid.trim(),
        members: allMembers,
      }

      // Create a registration session (validates form, checks dupes, but NO DB registration yet)
      const sessionHeaders = { 'Content-Type': 'application/json' }
      if (token) sessionHeaders['Authorization'] = `Bearer ${token}`
      const sessionRes = await fetch(`/api/sessions/create/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: sessionHeaders,
        body: JSON.stringify(formPayload),
      })
      const sessionData = await sessionRes.json()
      if (sessionData.already_registered) {
        setRegisteredTeam(sessionData.registration)
        setStep('success')
        return
      }
      if (!sessionData.success) {
        const raw = sessionData.message || sessionData.error || ''
        const isSql = /relation|column|syntax error|violates|does not exist|select|update|insert/i.test(raw)
        const refStr = sessionData.ref ? ` (Ref: ${sessionData.ref})` : ''
        setServerError(isSql ? `Could not save, please try again.${refStr}` : `${raw || 'Registration failed. Please try again.'}${refStr}`)
        return
      }

      const newSessionId = sessionData.session?.id
      setSessionId(newSessionId)

      if (isPaid) {
        // Paid tournament: go to payment step (no DB write yet)
        setStep('payment')
      } else {
        // Free tournament: complete registration immediately via session
        const completeHeaders = { 'Content-Type': 'application/json' }
        if (token) completeHeaders['Authorization'] = `Bearer ${token}`
        const completeRes = await fetch(`/api/sessions/${newSessionId}/complete`, {
          method: 'POST',
          credentials: 'include',
          headers: completeHeaders,
          body: JSON.stringify({}),
        })
        const completeData = await completeRes.json()
        if (completeData.already_registered) {
          setRegisteredTeam(completeData.registration)
          setStep('success')
          return
        }
        if (completeData.success) {
          setRegisteredTeam(completeData.registration)
          setAmountToPay(completeData.amount_to_pay || null)
          setPredictedGroup(completeData.predicted_group || null)
          setStep('success')
        } else {
          const raw = completeData.message || completeData.error || ''
          const isSql = /relation|column|syntax error|violates|does not exist|select|update|insert/i.test(raw)
          const refStr = completeData.ref ? ` (Ref: ${completeData.ref})` : ''
          setServerError(isSql ? `Could not save, please try again.${refStr}` : `${raw || 'Could not save, please try again.'}${refStr}`)
        }
      }
    } catch (err) {
      setServerError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleScreenshotChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isSupported = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'
    ].includes(file.type) || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name)

    if (!isSupported) {
      setPaymentErrors(prev => ({ ...prev, screenshot: 'Unsupported image format. Allowed formats: JPEG, PNG, WebP, GIF.' }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPaymentErrors(prev => ({ ...prev, screenshot: 'The selected file is too large (maximum allowed size is 10 MB).' }))
      return
    }

    try {
      const processed = await downscaleScreenshot(file)
      setPayment(prev => ({
        ...prev,
        screenshotFile: processed,
        screenshotPreview: URL.createObjectURL(processed),
      }))
      setPaymentErrors(prev => ({ ...prev, screenshot: '' }))
    } catch (err) {
      setPaymentErrors(prev => ({ ...prev, screenshot: err.message || 'Could not process screenshot image.' }))
    }
  }

  const validatePayment = () => {
    const errs = {}
    if (!payment.app) {
      errs.app = 'Which UPI app did you use to pay? Selection is required.'
    }
    const trimmedUtr = payment.transactionId.trim()
    if (!trimmedUtr) {
      errs.transactionId = 'Transaction ID / UTR is required'
    } else if (!/^\d{12}$/.test(trimmedUtr)) {
      errs.transactionId = 'A valid 12-digit UPI reference (UTR) is required.'
    }
    if (!payment.screenshotFile) errs.screenshot = 'Upload payment screenshot'
    setPaymentErrors(errs)
    return Object.keys(errs).length === 0
  }

  const isPaymentFormValid =
    Boolean(payment.app) &&
    /^\d{12}$/.test(payment.transactionId.trim()) &&
    Boolean(payment.screenshotFile) &&
    !paymentErrors.app &&
    !paymentErrors.screenshot

  const totalPlayers = 1 + form.players.filter(p => p.ign.trim() && p.uid.trim()).length
  const entryDisplay = useMemo(() => {
    if (!tourney) return ''
    const fee = parseInt(tourney.entry_fee_amount) || 0
    if (fee === 0) return 'Free'
    return `₹${fee.toLocaleString('en-IN')}`
  }, [tourney])

  if (loadingTourney) {
    return <LoadingScreen message="Loading registration page..." />
  }

  if (!tourney) {
    return (
      <div className="min-h-screen bg-[#07080C] text-white flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center space-y-4"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Unable to load registration page</h2>
          <p className="text-sm text-white/50">The tournament details could not be loaded or may no longer be available.</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={() => {
                setLoadingTourney(true)
                fetchJsonWithRetry(`/api/tournaments/${id}`).then(({ ok, data }) => {
                  if (ok && data?.success && data.tournament) {
                    setTourney(data.tournament)
                  }
                  setLoadingTourney(false)
                })
              }}
              className="flex-1 px-4 py-2.5 bg-primary hover:opacity-90 text-white font-bold rounded-xl text-sm transition-opacity"
            >
              Retry
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="registration-viewport min-h-screen bg-background text-on-background py-10 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center pb-[calc(env(safe-area-inset-bottom,0px)+36px)]">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden text-left"
        >
          {/* Success Header */}
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto mb-3.5 shadow-sm">
              <span className="material-symbols-outlined text-2xl font-bold">check</span>
            </div>
            <h2 className="font-headline-md text-2xl sm:text-3xl font-extrabold text-on-background tracking-tight">Team Registered!</h2>
            {tourney?.title && (
              <p className="text-xs text-on-surface-variant font-medium mt-1 truncate">{tourney.title}</p>
            )}
          </div>

          {/* Registration Status */}
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="font-bold text-amber-700 dark:text-amber-300 truncate">
                {isPaid ? 'Payment Proof Submitted • Pending Review' : 'Registration Submitted • Pending Approval'}
              </span>
            </div>
            {submittedTimeIST && (
              <span className="font-mono text-[11px] font-semibold text-on-surface-variant shrink-0">{submittedTimeIST}</span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant text-center mt-2.5 leading-relaxed max-w-sm mx-auto">
            {isPaid
              ? 'Your payment proof has been submitted for admin verification. Your team slot will be confirmed upon approval.'
              : 'Your squad registration has been submitted and is awaiting tournament organizer review.'}
          </p>

          {/* Registration Details */}
          {registeredTeam && (
            <div className="mt-5 rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/20 bg-surface-container/50 text-xs">
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Team Name</span>
                <span className="font-bold text-on-background text-sm truncate max-w-[220px]">{toMessage(form.teamName)}</span>
              </div>
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Registration Status</span>
                <span className="px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 capitalize">
                  {toMessage(registeredTeam.status || 'pending').replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 gap-2">
                <span className="text-on-surface-variant font-medium shrink-0">Registration ID</span>
                <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-on-background bg-surface-variant/70 px-2 py-0.5 rounded border border-outline-variant/30">
                  <span className="truncate max-w-[160px] sm:max-w-[200px]">{toMessage(registeredTeam.id)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!registeredTeam?.id) return
                      navigator.clipboard.writeText(String(registeredTeam.id))
                      setCopiedRegId(true)
                      setTimeout(() => setCopiedRegId(false), 2000)
                    }}
                    className="text-on-surface-variant hover:text-on-background transition-colors p-0.5"
                    title="Copy Registration ID"
                    aria-label="Copy Registration ID"
                  >
                    <span className="material-symbols-outlined text-xs leading-none">
                      {copiedRegId ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
              </div>
              {predictedGroup && (
                <div className="flex items-center justify-between p-3 gap-3">
                  <span className="text-on-surface-variant font-medium shrink-0">Assigned Group</span>
                  <span className="font-bold text-primary text-xs">
                    {toMessage(predictedGroup).startsWith('Group') ? toMessage(predictedGroup) : `Group ${toMessage(predictedGroup)}`}
                  </span>
                </div>
              )}
              {amountToPay && (
                <div className="flex items-center justify-between p-3 gap-3">
                  <span className="text-on-surface-variant font-medium shrink-0">Amount Due</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    ₹{Number(amountToPay).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Squad Roster Guidance */}
          <div className="mt-4 p-4 rounded-xl border border-outline-variant/30 bg-surface-container/30 space-y-2">
            <div className="flex items-center gap-2 text-on-background font-bold text-xs">
              <span className="material-symbols-outlined text-primary text-base">group_add</span>
              <span className="uppercase tracking-wider">Next Step: Complete Your Squad Roster</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Once approved, your slot is confirmed. Share your team invitation link with your teammates from the Team Hub so they can claim their roster slots.
            </p>
            <div className="flex items-start gap-2 pt-1.5 text-[11px] text-on-surface-variant/80 border-t border-outline-variant/20">
              <span className="material-symbols-outlined text-sm text-primary shrink-0 mt-0.5">lock</span>
              <span>Match room credentials unlock only after all roster slots are linked to registered player accounts.</span>
            </div>
          </div>

          {/* Primary Action */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate(`/tournaments/${id}`)}
              className="w-full bg-primary hover:bg-primary/90 text-on-primary font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-primary/25 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span>View Tournament Details</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  const handleConfirmPaymentSubmission = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (e?.stopPropagation) e.stopPropagation()
    if (e?.nativeEvent && !e.nativeEvent.isTrusted) return
    if (paymentSubmitting || paymentSubmittedRef.current) return
    paymentSubmittedRef.current = true
    setPaymentSubmitting(true)
    setServerError('')

    try {
      const token = await getAuthToken()
      let screenshotUrl = null
      try {
        const fileToUpload = await downscaleScreenshot(payment.screenshotFile)
        screenshotUrl = await uploadImage(fileToUpload)
      } catch (uploadErr) {
        let errorMsg = 'Could not upload the screenshot. Your entries are still here; please try again.'
        if (uploadErr?.status === 413 || uploadErr?.code === 'FILE_TOO_LARGE') {
          errorMsg = 'The selected file is too large (maximum allowed size is 10 MB).'
        } else if (uploadErr?.status === 415 || uploadErr?.code === 'INVALID_FILE_TYPE') {
          errorMsg = 'Unsupported image format. Allowed formats: JPEG, PNG, WebP.'
        } else if (uploadErr?.status === 429 || uploadErr?.code === 'RATE_LIMIT_EXCEEDED') {
          const waitTime = uploadErr?.retryAfter || 60
          errorMsg = `Too many uploads. Please wait ${waitTime} seconds and try again.`
        } else if (uploadErr?.ref) {
          errorMsg = `Could not upload the screenshot. Your entries are still here; please try again. (Ref: ${uploadErr.ref})`
        } else if (uploadErr?.message && !uploadErr?.message.includes('fetch') && !uploadErr?.message.includes('network')) {
          errorMsg = uploadErr.message
        }
        setServerError(errorMsg)
        paymentSubmittedRef.current = false
        setPaymentSubmitting(false)
        setShowConfirmModal(false)
        return
      }

      let res
      let data
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      if (sessionId) {
        try {
          res = await fetch(`/api/sessions/${sessionId}/complete`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              utr_number: payment.transactionId.trim(),
              payment_app: payment.app || 'other',
              screenshot_url: screenshotUrl,
            }),
          })
          data = await res.json()
        } catch {
          setServerError('Could not reach the server. Your entries are still here; check your connection and try again.')
          paymentSubmittedRef.current = false
          setPaymentSubmitting(false)
          setShowConfirmModal(false)
          return
        }
      } else if (rejectedReg?.id) {
        try {
          res = await fetch(`/api/tournaments/${id}/register/${rejectedReg.id}/payment`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              transaction_id: payment.transactionId.trim(),
              payment_app: payment.app || 'other',
              screenshot_url: screenshotUrl,
            }),
          })
          data = await res.json()
        } catch {
          setServerError('Could not reach the server. Your entries are still here; check your connection and try again.')
          paymentSubmittedRef.current = false
          setPaymentSubmitting(false)
          setShowConfirmModal(false)
          return
        }
      } else {
        setServerError('Registration session not found. Please restart registration.')
        paymentSubmittedRef.current = false
        setPaymentSubmitting(false)
        setShowConfirmModal(false)
        return
      }

      if (!data || typeof data !== 'object') {
        setServerError('The server did not confirm the payment proof. Your entries are still here; please try again.')
        paymentSubmittedRef.current = false
        setPaymentSubmitting(false)
        setShowConfirmModal(false)
        return
      }

      const existingProofSaved = data.already_registered &&
        Boolean(data.registration?.payment_id && data.registration?.screenshot_url)
      const newlySavedProof = data.success &&
        Boolean((data.payment?.id || data.registration?.id) && (data.registration?.screenshot_url || data.registration?.transaction_id))

      if (res?.ok && (existingProofSaved || newlySavedProof || data.success)) {
        const nowIST = new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).toUpperCase()
        setSubmittedTimeIST(nowIST)
        if (data.registration) setRegisteredTeam(data.registration)
        if (data.amount_to_pay) setAmountToPay(data.amount_to_pay)
        if (data.predicted_group) setPredictedGroup(data.predicted_group)
        setShowConfirmModal(false)
        setStep('success')
        return
      } else {
        const refCode = data.ref ? ` (Ref: ${data.ref})` : ''
        setServerError((data.message || 'The payment proof was not confirmed as saved. Your entries are still here; please try again.') + refCode)
        paymentSubmittedRef.current = false
        setPaymentSubmitting(false)
        setShowConfirmModal(false)
      }
    } catch (unexpectedErr) {
      setServerError('Could not submit the payment. Your entries are still here; please try again.')
      paymentSubmittedRef.current = false
      setPaymentSubmitting(false)
      setShowConfirmModal(false)
    }
  }

  if (step === 'payment') {
    const paymentUpiId = tourney.payment_upi_id || tourney.upi_id || 'matchdistrict@upi'
    const upiLink = `upi://pay?pa=${encodeURIComponent(paymentUpiId)}&pn=Match%20District&am=${entryFee}&cu=INR&tn=${encodeURIComponent(tourney.title)}`

    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

    // Platform-specific app launchers: only keep icons that exist today.
    // Android: package-based launch intent (NO payee, amount, or note).
    // iOS: plain app launch scheme only where certain it exists (PhonePe: phonepe://, Paytm: paytmmp://). Hide Google Pay and BHIM on iOS.
    // Desktop: hide all app icons (only QR and copy fields remain).
    const allUpiApps = [
      {
        id: 'google_pay',
        name: 'Google Pay',
        package: 'com.google.android.apps.nbu.paisa.user',
        ringColor: 'ring-[#4285F4]',
        iosScheme: null,
      },
      {
        id: 'phonepe',
        name: 'PhonePe',
        package: 'com.phonepe.app',
        ringColor: 'ring-[#5f259f]',
        iosScheme: 'phonepe://',
      },
      {
        id: 'paytm',
        name: 'Paytm',
        package: 'net.one97.paytm',
        ringColor: 'ring-[#00baf2]',
        iosScheme: 'paytmmp://',
      },
      {
        id: 'bhim',
        name: 'BHIM',
        package: 'in.org.npci.upiapp',
        ringColor: 'ring-[#128807]',
        iosScheme: null,
      },
    ]

    const upiApps = allUpiApps.filter(app => {
      if (isAndroid) return Boolean(app.package)
      if (isIOS) return Boolean(app.iosScheme)
      return false
    })

    const handleAppClick = (app) => {
      setPayment(prev => ({ ...prev, app: app.id }))
      setPaymentErrors(prev => ({ ...prev, app: '' }))

      let targetUrl = ''
      if (isAndroid && app.package) {
        // Pure package-based launch intent with NO payment parameters
        targetUrl = `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.package};end;`
      } else if (isIOS && app.iosScheme) {
        // Plain app launch scheme with NO payment parameters
        targetUrl = app.iosScheme
      }

      if (targetUrl) {
        window.location.href = targetUrl
      }
    }

    return (
      <div className="registration-viewport min-h-screen bg-[#07080C] text-white relative">
        <div className="max-w-2xl mx-auto px-4 py-8 registration-content-padding">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('form')} className="p-2 -ml-2 hover:bg-white/5 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-black">Confirm Payment</h1>
              <p className="text-sm text-white/40">Complete your registration</p>
            </div>
          </div>

          {/* Tournament Summary */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 flex items-center gap-4">
            <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-white/10">
              {tourney.cover_image_url && (
                <img src={tourney.cover_image_url} className="w-full h-full object-cover" alt="" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/25">
                  {tourney.game}
                </span>
              </div>
              <p className="text-sm font-bold truncate">{form.teamName}</p>
              <p className="text-xs text-white/40">Entry Fee: <span className="text-green-400 font-bold">₹{entryFee.toLocaleString('en-IN')}</span></p>
            </div>
          </div>

          {serverError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
              {toMessage(serverError)}
            </div>
          )}

          <div className="space-y-6">
            {/* UPI Details & QR Code Redesign */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Pay via UPI</h2>
                <img src="/payment-brand-assets/upi-logo.svg" alt="UPI official logo" className="h-5 w-auto object-contain" />
              </div>
              <div className="bg-white/5 rounded-xl p-6 text-center space-y-4 flex flex-col items-center">
                
                {/* QR Code Container */}
                <div className="bg-white p-3 rounded-2xl shadow-[0_0_25px_rgba(59,130,246,0.2)] border border-white/20 hover:scale-102 transition-transform duration-300">
                  <img 
                    src={tourney.payment_qr_image_url || tourney.payment_qr_url || tourney.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiLink)}`}
                    alt="Scan to Pay"
                    className="w-[180px] h-[180px] block"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Amount to Pay</p>
                  <div className="inline-flex items-center gap-2">
                    <p className="text-3xl font-black text-green-400">₹{entryFee.toLocaleString('en-IN')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(String(entryFee));
                        setCopiedToast('Exact amount copied!');
                        setTimeout(() => setCopiedToast(''), 2000);
                      }}
                      className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors"
                      title="Copy exact amount"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="bg-white/10 rounded-xl p-3 inline-flex items-center gap-2 mx-auto border border-white/5">
                  <span className="text-sm text-white/50">UPI ID:</span>
                  <span className="text-sm font-bold text-primary">{paymentUpiId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(paymentUpiId);
                      setCopiedToast('UPI ID copied!');
                      setTimeout(() => setCopiedToast(''), 2000);
                    }}
                    className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors text-primary"
                    title="Copy UPI ID"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                {copiedToast && (
                  <div className="rounded-full px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                    {toMessage(copiedToast)}
                  </div>
                )}

                <p className="text-xs text-white/70 text-center max-w-sm mx-auto leading-relaxed">
                  Open your UPI app, pay this amount to this UPI ID, then come back and add the UTR and screenshot.
                </p>

                {/* 3 Short Numbered Steps */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-left">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <span className="text-white/80">Pay exact amount via any UPI app</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <span className="text-white/80">Note the 12-digit UTR reference</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <span className="text-white/80">Submit proof below for review</span>
                  </div>
                </div>

                {/* Direct UPI App row — shown only on mobile where package/scheme launch is supported */}
                {upiApps.length > 0 && (
                  <div className="w-full pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider text-left">Open App to Pay</p>
                    <div className={`grid gap-4 ${upiApps.length === 2 ? 'grid-cols-2 max-w-xs mx-auto' : 'grid-cols-4'}`}>
                      {upiApps.map(app => (
                        <button
                          key={app.id || app.name}
                          type="button"
                          onClick={() => handleAppClick(app)}
                          className={`flex flex-col items-center gap-2 py-2 rounded-xl transition-all duration-200 ${
                            payment.app === app.id
                              ? `ring-2 ${app.ringColor} bg-white/5 scale-105`
                              : 'opacity-70 hover:opacity-100 hover:scale-105'
                          }`}
                        >
                          <PaymentAppIcon id={app.id} name={app.name} />
                          <span className="min-w-0 w-full text-center text-[10px] leading-tight font-semibold text-white/70 tracking-wide">{app.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Payment Proof Details */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Submit Payment Proof</h2>

              {/* UPI Payment Application Dropdown */}
              <PaymentAppDropdown
                value={payment.app}
                onChange={(appId) => {
                  setPayment(prev => ({ ...prev, app: appId }))
                  if (paymentErrors.app) {
                    setPaymentErrors(prev => ({ ...prev, app: '' }))
                  }
                }}
                error={paymentErrors.app}
              />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-white/60">12-Digit UTR / Transaction Reference *</label>
                  <span className={`text-[11px] font-mono ${
                    payment.transactionId.trim().length === 12
                      ? 'text-emerald-400 font-bold'
                      : payment.transactionId.trim().length > 0
                      ? 'text-amber-400'
                      : 'text-white/40'
                  }`}>
                    {payment.transactionId.trim().length}/12
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={payment.transactionId}
                  onChange={e => {
                    const val = e.target.value.replace(/\s+/g, '').toUpperCase();
                    setPayment(prev => ({ ...prev, transactionId: val }));
                    if (val.length === 12) {
                      setPaymentErrors(prev => ({ ...prev, transactionId: '' }));
                    } else if (val.length > 0 && val.length < 12) {
                      setPaymentErrors(prev => ({ ...prev, transactionId: 'A valid 12-digit UPI reference (UTR) is required.' }));
                    } else {
                      setPaymentErrors(prev => ({ ...prev, transactionId: '' }));
                    }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors font-mono tracking-wider"
                  placeholder="e.g. 428901234567"
                />
                {paymentErrors.transactionId ? (
                  <p className="text-red-400 text-xs mt-1">{paymentErrors.transactionId}</p>
                ) : /^\d{12}$/.test(payment.transactionId.trim()) ? (
                  <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1 font-semibold">
                    <span>✓</span> Valid 12-digit reference
                  </p>
                ) : null}
              </div>

              {/* Screenshot is required because the backend records a reviewable payment only with its proof URL. */}
              <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Payment Screenshot *</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  >
                    {payment.screenshotPreview ? (
                      <div className="relative inline-block">
                        <img src={payment.screenshotPreview} alt="Screenshot preview" className="max-h-48 rounded-lg" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPayment(prev => ({ ...prev, screenshotFile: null, screenshotPreview: null })); }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <svg className="w-8 h-8 mx-auto text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-white/40">Click to upload screenshot</p>
                        <p className="text-[10px] text-white/20">JPEG, PNG, WebP, HEIC • Max 10MB</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" className="hidden" onChange={handleScreenshotChange} />
                  {paymentErrors.screenshot && <p className="text-red-400 text-xs mt-1">{paymentErrors.screenshot}</p>}
              </div>

            </div>

            {/* Desktop Submit */}
            <div className="hidden sm:block">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!e.nativeEvent.isTrusted) return
                  setServerError('')
                  if (!validatePayment()) return
                  setShowConfirmModal(true)
                }}
                disabled={paymentSubmitting || !isPaymentFormValid}
                className="w-full bg-primary text-white font-bold py-3.5 px-6 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {paymentSubmitting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
                ) : (
                  <>Submit</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bar */}
        <StickyBottomBar>
          <button
            onClick={() => setStep('form')}
            className="flex-1 bg-black/5 hover:bg-black/10 border border-black/10 text-slate-800 font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            Back
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!e.nativeEvent.isTrusted) return
              setServerError('')
              if (!validatePayment()) return
              setShowConfirmModal(true)
            }}
            disabled={paymentSubmitting || !isPaymentFormValid}
            className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-md shadow-primary/25"
          >
            {paymentSubmitting ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting</>
            ) : (
              <>Submit</>
            )}
          </button>
        </StickyBottomBar>

        {/* Confirmation Modal */}
        <BottomSheetModal
          isOpen={showConfirmModal}
          onClose={() => {
            if (!paymentSubmitting) setShowConfirmModal(false)
          }}
          title="Confirm Payment Submission"
          icon="verified_user"
          maxWidth="max-w-md"
          actions={
            <>
              <button
                type="button"
                disabled={paymentSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-outline-variant/40 hover:bg-surface-variant text-on-surface-variant hover:text-on-background font-semibold text-sm transition-all disabled:opacity-50 cursor-pointer text-center"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={paymentSubmitting || paymentSubmittedRef.current}
                onClick={handleConfirmPaymentSubmission}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {paymentSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Confirm &amp; Submit</span>
                )}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs leading-relaxed flex items-start gap-2.5">
              <span className="material-symbols-outlined text-amber-500 text-base shrink-0 mt-0.5">info</span>
              <span>
                Please confirm that you have completed the payment and that the transaction reference and screenshot are correct. Submitting payment proof does not guarantee payment verification.
              </span>
            </div>

            <div className="rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/20 bg-surface-container-low/50 text-xs overflow-hidden">
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Tournament</span>
                <span className="font-bold text-on-background text-right truncate max-w-[220px]" title={tourney?.title}>
                  {tourney?.title}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Entry Fee</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                  {entryDisplay || (entryFee ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Payment App</span>
                <div className="inline-flex items-center gap-2 font-semibold text-on-background">
                  <span className="w-5 h-5 rounded bg-surface-variant/80 flex items-center justify-center p-0.5 shrink-0 border border-outline-variant/20">
                    <PaymentAppIcon id={payment.app} className="w-3.5 h-3.5 shrink-0" />
                  </span>
                  <span className="truncate">{getPaymentAppLabel(payment.app)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">UTR / Reference</span>
                <span className="font-mono font-bold text-on-background tracking-wider">
                  {payment.transactionId.trim()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-on-surface-variant font-medium shrink-0">Payment Screenshot</span>
                <div className="inline-flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Attached
                  </span>
                  {payment.screenshotPreview && (
                    <img
                      src={payment.screenshotPreview}
                      alt="Screenshot preview"
                      className="w-8 h-8 object-cover rounded-lg border border-outline-variant/40 shrink-0"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </BottomSheetModal>
      </div>
    );
  }

  if (!discordLinkChecked) {
    return <div className="min-h-screen bg-[#07080C] text-white flex items-center justify-center">Checking Discord account link…</div>
  }

  if (!discordLinked) {
    return (
      <div className="min-h-screen bg-[#07080C] text-white flex items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-xl font-black mb-3">Link Discord to Register</h1>
          <p className="text-sm text-white/70">Linking a Discord account is compulsory. We only take your Discord username for registration and slot allotment. Without linking, registration cannot be completed.</p>
          <button type="button" onClick={() => navigate(`/tournaments/${id}`)} className="mt-5 rounded-xl bg-white/10 px-4 py-2 font-semibold">Back to Tournament</button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="registration-viewport min-h-screen bg-[#07080C] text-white relative"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 registration-content-padding">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/5 rounded-xl transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <GameIcon game={tourney.game} size={32} rounded="rounded-lg" className="shrink-0 shadow-md" />
          <div>
            <h1 className="text-xl font-black leading-tight">Register Team</h1>
            <p className="text-sm text-white/40 leading-tight">{tourney.title}</p>
          </div>
        </div>



        {rejectedReg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 sm:p-5 mb-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-rose-400 text-xl mt-0.5">error</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-rose-300">Previous Submission Rejected</h3>
                <p className="text-xs text-rose-200/90 mt-1">
                  Reason: <strong>{rejectedReg.rejection_reason || 'Payment verification failed.'}</strong>
                </p>
                <p className="text-[11px] text-white/50 mt-1">
                  You can re-upload your payment proof with a valid 12-digit UTR to return your team to pending review.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setForm(prev => ({ ...prev, teamName: rejectedReg.team_name, captainIgn: rejectedReg.captain }));
                setStep('payment');
              }}
              className="rounded-full px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">upload_file</span>
              Re-upload Payment Proof
            </button>
          </div>
        )}

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {toMessage(serverError)}
          </div>
        )}

        <form onSubmit={handleRegisterTeam} className="space-y-6">

          {/* Desktop: Team Info + Captain side-by-side; Mobile: stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Team Information */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Team Information</h2>

              {loadingPresets ? (
                <p className="text-xs text-white/50">Loading saved squads…</p>
              ) : presetsError ? (
                <div className="flex items-center gap-3 text-xs text-amber-300" role="status">
                  <span>{toMessage(presetsError)}</span>
                  <button type="button" onClick={fetchPresets} className="underline underline-offset-2 font-semibold">Retry</button>
                </div>
              ) : savedPresets.length === 0 ? (
                <p className="text-xs text-white/50">
                  No saved squads yet. <Link to="/profile?tab=teams" className="text-primary underline underline-offset-2">Create one in Teams &amp; Squads</Link>.
                </p>
              ) : (
                <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl p-3.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-base">bookmark_add</span>
                    <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Use a saved squad</span>
                  </div>
                  <select
                    value={selectedPresetId}
                    onChange={e => {
                      const preset = presetsWithStatus.find(p => p.id === e.target.value)
                      if (preset?.selectable) {
                        setSelectedPresetId(preset.id)
                        applyPreset(preset)
                      }
                    }}
                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                  >
                    <option value="" disabled>Select a squad to auto-fill…</option>
                    {presetsWithStatus.map(p => (
                      <option key={p.id} value={p.id} disabled={!p.selectable}>
                        {p.preset_name || p.team_name}{p.is_default ? ' (default)' : ''}
                        {p.disabledReason ? ` (${p.disabledReason})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {presetRosterWarning && (
                  <p className="text-[10px] text-amber-400/90">
                    {toMessage(presetRosterWarning)} Add more players, or enter the squad manually.
                  </p>
                )}
                </>
      )}

              <div>
                <label htmlFor="reg-teamName" className="block text-xs font-semibold text-white/60 mb-1.5">Team Name *</label>
                <input
                  type="text"
                  id="reg-teamName"
                  data-field="teamName"
                  value={form.teamName}
                  onChange={e => updateField('teamName', e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, teamName: true }))}
                  maxLength={16}
                  aria-invalid={errors.teamName ? true : undefined}
                  aria-describedby={errors.teamName ? 'err-teamName' : undefined}
                  className={inputCls(Boolean(errors.teamName))}
                  placeholder="Enter your team name"
                />
                <FieldError id="err-teamName" message={errors.teamName} />
              </div>
              <div>
                <label htmlFor="reg-phone" className="block text-xs font-semibold text-white/60 mb-1.5">Phone *</label>
                <input
                  type="tel"
                  id="reg-phone"
                  data-field="phone"
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? 'err-phone' : undefined}
                  className={inputCls(Boolean(errors.phone))}
                  placeholder="9876543210"
                />
                <FieldError id="err-phone" message={errors.phone} />
              </div>
            </div>

            {/* Captain */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-amber-400/80 uppercase tracking-wider">Captain</h2>
              <div>
                <label htmlFor="reg-captainIgn" className="block text-xs font-semibold text-white/60 mb-1.5">IGN *</label>
                <input
                  type="text"
                  id="reg-captainIgn"
                  data-field="captainIgn"
                  value={form.captainIgn}
                  onChange={e => updateField('captainIgn', e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, captainIgn: true }))}
                  aria-invalid={errors.captainIgn ? true : undefined}
                  aria-describedby={errors.captainIgn ? 'err-captainIgn' : undefined}
                  className={inputCls(Boolean(errors.captainIgn))}
                  placeholder="In-game name"
                />
                <FieldError id="err-captainIgn" message={errors.captainIgn} />
              </div>
              <div>
                <label htmlFor="reg-captainUid" className="block text-xs font-semibold text-white/60 mb-1.5">UID *</label>
                <input
                  type="text"
                  id="reg-captainUid"
                  data-field="captainUid"
                  value={form.captainUid}
                  onChange={e => updateField('captainUid', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setTouched(prev => ({ ...prev, captainUid: true }))}
                  aria-invalid={errors.captainUid ? true : undefined}
                  aria-describedby={errors.captainUid ? 'err-captainUid' : undefined}
                  className={inputCls(Boolean(errors.captainUid))}
                  placeholder="Game UID"
                />
                <FieldError id="err-captainUid" message={errors.captainUid} />
              </div>
            </div>

          </div>

          {/* Players */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Players</h2>
            {form.players.map((player, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white/5 rounded-xl">
                <div>
                  <label htmlFor={`reg-player_${i}_ign`} className="block text-xs font-semibold text-white/60 mb-1.5">Player {i + 2} IGN *</label>
                  <input
                    type="text"
                    id={`reg-player_${i}_ign`}
                    data-field={`player_${i}_ign`}
                    value={player.ign}
                    onChange={e => updatePlayer(i, 'ign', e.target.value)}
                    aria-invalid={errors[`player_${i}_ign`] ? true : undefined}
                    aria-describedby={errors[`player_${i}_ign`] ? `err-player_${i}_ign` : undefined}
                    className={inputCls(Boolean(errors[`player_${i}_ign`]))}
                    placeholder="In-game name"
                  />
                  <FieldError id={`err-player_${i}_ign`} message={errors[`player_${i}_ign`]} />
                </div>
                <div>
                  <label htmlFor={`reg-player_${i}_uid`} className="block text-xs font-semibold text-white/60 mb-1.5">Player {i + 2} UID *</label>
                  <input
                    type="text"
                    id={`reg-player_${i}_uid`}
                    data-field={`player_${i}_uid`}
                    value={player.uid}
                    onChange={e => updatePlayer(i, 'uid', e.target.value.replace(/\D/g, ''))}
                    aria-invalid={errors[`player_${i}_uid`] ? true : undefined}
                    aria-describedby={errors[`player_${i}_uid`] ? `err-player_${i}_uid` : undefined}
                    className={inputCls(Boolean(errors[`player_${i}_uid`]))}
                    placeholder="Game UID"
                  />
                  <FieldError id={`err-player_${i}_uid`} message={errors[`player_${i}_uid`]} />
                </div>
              </div>
            ))}
          </div>

          {/* Substitutes */}
          <div className="bg-white/5 border border-amber-400/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-amber-400/60 uppercase tracking-wider">Substitutes (Optional)</h2>
            {form.substitutes.map((sub, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white/5 rounded-xl">
                <div>
                  <label htmlFor={`reg-sub_${i}_ign`} className="block text-xs font-semibold text-white/60 mb-1.5">Sub {i + 1} IGN</label>
                  <input
                    type="text"
                    id={`reg-sub_${i}_ign`}
                    data-field={`sub_${i}_ign`}
                    value={sub.ign}
                    onChange={e => updateSub(i, 'ign', e.target.value)}
                    aria-invalid={errors[`sub_${i}_ign`] ? true : undefined}
                    aria-describedby={errors[`sub_${i}_ign`] ? `err-sub_${i}_ign` : undefined}
                    className={inputCls(Boolean(errors[`sub_${i}_ign`]))}
                    placeholder="In-game name"
                  />
                  <FieldError id={`err-sub_${i}_ign`} message={errors[`sub_${i}_ign`]} />
                </div>
                <div>
                  <label htmlFor={`reg-sub_${i}_uid`} className="block text-xs font-semibold text-white/60 mb-1.5">Sub {i + 1} UID</label>
                  <input
                    type="text"
                    id={`reg-sub_${i}_uid`}
                    data-field={`sub_${i}_uid`}
                    value={sub.uid}
                    onChange={e => updateSub(i, 'uid', e.target.value.replace(/\D/g, ''))}
                    aria-invalid={errors[`sub_${i}_uid`] ? true : undefined}
                    aria-describedby={errors[`sub_${i}_uid`] ? `err-sub_${i}_uid` : undefined}
                    className={inputCls(Boolean(errors[`sub_${i}_uid`]))}
                    placeholder="Game UID"
                  />
                  <FieldError id={`err-sub_${i}_uid`} message={errors[`sub_${i}_uid`]} />
                </div>
              </div>
            ))}
          </div>

          {/* Review */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Review</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/40">Team</span><span className="font-semibold">{form.teamName || '—'}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Captain</span><span className="font-semibold">{form.captainIgn || '—'}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Players</span><span className="font-semibold">{totalPlayers}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Entry Fee</span><span className="font-semibold">{entryDisplay || '—'}</span></div>
            </div>
          </div>

          {/* Desktop Submit — Cancel + primary action, right-aligned */}
          <div className="hidden sm:flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
              ) : (
                <>{isPaid ? 'Proceed to Payment' : 'Register Team'}{isPaid ? ` • ₹${entryFee.toLocaleString('en-IN')}` : ''}</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Mobile Sticky Bar — clean frosted-glass treatment */}
      <StickyBottomBar>
        <button
          onClick={() => navigate(-1)}
          className="flex-1 bg-black/5 hover:bg-black/10 border border-black/10 text-slate-800 font-semibold py-2.5 rounded-xl transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRegisterTeam}
          disabled={isSubmitting}
          className="flex-[2] bg-primary text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-md shadow-primary/25"
        >
          {isSubmitting ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting</>
          ) : (
            <>{isPaid ? 'Proceed to Payment' : 'Register Team'}</>
          )}
        </button>
      </StickyBottomBar>
    </motion.div>
  )
}

export default RegistrationPage
