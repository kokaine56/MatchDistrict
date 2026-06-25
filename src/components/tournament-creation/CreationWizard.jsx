import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../UserContext'
import { getAuthToken } from '../../utils/getAuthToken'
import { uploadImage } from '../../utils/cloudinaryUpload'
import { hasOrganizerRights, isSystemAdmin, hasRole, getUserRoles } from '../../utils/iamRoles.js'
import StepIndicator from './StepIndicator'
import StepNavigation from './StepNavigation'
import Step1BasicDetails from './steps/Step1BasicDetails'
import Step2MatchSetup from './steps/Step2MatchSetup'
import Step3Slots from './steps/Step3Slots'
import Step4PrizePool from './steps/Step4PrizePool'
import Step5Media from './steps/Step5Media'
import Step6ScheduleRoadmap from './steps/Step6ScheduleRoadmap'
import Step7Rules from './steps/Step7Rules'
import Step8Preview from './steps/Step8Preview'
import Step9Publish from './steps/Step9Publish'

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const LS_KEY = 'md_tournament_draft'

function emptyForm() {
  return {
    title: '',
    game: '',
    description: '',
    match_type: 'squad',
    perspective: 'tpp',
    slotsTotal: '64',
    reserved_slots: '0',
    entry_fee_amount: '',
    prize_pool_type: 'dynamic',
    prize_pool_amount: '',
    prize_split_1st: '',
    prize_split_2nd: '',
    prize_split_3rd: '',
    prize_split_mvp: '',
    mvp_enabled: false,
    mvp_amount: '',
    kill_reward_enabled: false,
    kill_reward_per_kill: '',
    prize_positions: [],
    cover_image_url: '',
    registrationOpenDate: '',
    registrationCloseDate: '',
    startDate: '',
    roadmap: [],
    sponsors: [],
    rules: '',
    max_slots_per_room: '',
  }
}

function validateStep(step, data, planLimits, orgName, userTier, userRole) {
  const errs = {}
  switch (step) {
    case 1:
      if (!data.title || data.title.length < 5) errs.title = 'Title must be at least 5 characters.'
      if (data.title && data.title.length > 100) errs.title = 'Title must be under 100 characters.'
      if (!data.game) errs.game = 'Please select a game.'
      break
    case 2:
      if (!data.match_type) errs.match_type = 'Please select a match type.'
      if (!data.perspective) errs.perspective = 'Please select a perspective mode.'
      break
    case 3: {
      const PLAN_MAX_SLOTS = { Free: 100, Basic: 300, Pro: 1000 }
      const tier = userTier || 'Free'
      const maxSlots = planLimits?.maxSlots || PLAN_MAX_SLOTS[tier] || 100
      const slots = parseInt(data.slotsTotal)
      if (!slots || slots < 2) errs.slotsTotal = 'Minimum 2 slots required.'
      else if (slots > maxSlots) errs.slotsTotal = `Your plan allows maximum ${maxSlots} slots.`
      const reserved = parseInt(data.reserved_slots) || 0
      if (reserved > slots) errs.slotsTotal = 'Reserved slots cannot exceed total slots.'
      break
    }
    case 4: {
      const entryFee = parseInt(data.entry_fee_amount) || 0
      const totalSlots = parseInt(data.slotsTotal) || 0
      const basePrizePool = entryFee * totalSlots
      const mvpAmount = data.mvp_enabled ? (parseInt(data.mvp_amount) || 0) : 0
      const killRewardBudget = data.kill_reward_enabled ? (totalSlots * (parseInt(data.kill_reward_per_kill) || 0)) : 0

      if (mvpAmount + killRewardBudget > basePrizePool && basePrizePool > 0) {
        errs.prize_split = 'MVP + Kill Reward budget exceeds base prize pool.'
      }

      if (data.entry_fee_amount !== '' && data.entry_fee_amount !== undefined) {
        const parsedFee = parseInt(data.entry_fee_amount)
        if (isNaN(parsedFee) || parsedFee < 1) {
          errs.entry_fee_amount = 'Entry fee must be greater than 0 for paid tournaments.'
        }
      }

      const positions = data.prize_positions || []
      if (!positions.length) {
        errs.prize_positions = 'Please add at least one prize distribution position.'
      }
      const totalPct = positions.reduce((s, p) => s + (parseFloat(p.percentage) || 0), 0)
      const isExactly100 = Number(totalPct.toFixed(2)) === 100.00
      if (positions.length && !isExactly100) {
        errs.prize_positions_total = 'Prize distribution total must equal exactly 100%.'
      }
      if (totalPct > 100.01) errs.prize_split = 'Prize distribution exceeds 100%.'

      if (data.sponsors_enabled && (userTier === 'Free' || !userTier)) {
        errs.sponsors_enabled = 'Sponsor Contributions require the Basic plan or higher.'
      }
      break
    }
    case 5:
      break
    case 6: {
      if (!data.registrationOpenDate) errs.registrationOpenDate = 'Registration open date is required.'
      if (!data.registrationCloseDate) errs.registrationCloseDate = 'Registration close date is required.'
      else if (data.registrationOpenDate && new Date(data.registrationCloseDate) <= new Date(data.registrationOpenDate)) {
        errs.registrationCloseDate = 'Must be after registration opens.'
      }
      const firstRound = (data.roadmap || [])[0]
      const matchStartDate = (firstRound?.date && firstRound?.time)
        ? `${firstRound.date}T${firstRound.time}`
        : data.startDate || ''
      if (!matchStartDate) errs.startDate = 'Match start date is required.'
      else if (data.registrationCloseDate && new Date(matchStartDate) <= new Date(data.registrationCloseDate)) {
        errs.startDate = 'Must be after registration closes.'
      }
      break
    }
    case 7:
      break
    case 8:
      break
    case 9: {
      // Enforce org profile ONLY if the user does NOT have structural admin rights.
      // isSystemAdmin() uses the hierarchical role engine — any role with admin-level
      // clearance bypasses the organization profile requirement.
      if (!isSystemAdmin({ role: userRole }) && (!orgName || orgName === 'Match District Organizer')) {
        errs.publish = 'Organization profile required. Please create your organization profile before publishing tournaments.'
      }
      if (!data.title || data.title.length < 5) errs.title = 'Tournament title missing or too short (min 5 characters).'
      if (!data.game) errs.game = 'Game selection required.'
      if (!data.match_type) errs.match_type = 'Match type must be selected.'
      if (!data.perspective) errs.perspective = 'Perspective mode must be selected.'
      if (!data.registrationOpenDate) errs.registrationOpenDate = 'Registration open date is required.'
      if (!data.registrationCloseDate) errs.registrationCloseDate = 'Registration close date is required.'
      const firstRound = (data.roadmap || [])[0]
      const matchStartDate = (firstRound?.date && firstRound?.time)
        ? `${firstRound.date}T${firstRound.time}`
        : data.startDate || ''
      if (!matchStartDate) errs.startDate = 'Match start date is required.'
      if (!data.cover_image_url) errs.cover_image_url = 'Cover image required. Please upload a banner in the Media step.'
      if (!data.slotsTotal || parseInt(data.slotsTotal) < 2) errs.slotsTotal = 'Minimum 2 slots required.'
      break
    }
  }
  return errs
}

function hasErrors(errs) {
  return Object.keys(errs).length > 0
}

export default function CreationWizard() {
  const navigate = useNavigate()
  const { currentUser, loading } = useUser()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [userTier, setUserTier] = useState(currentUser?.tier || 'Free')
  const [planLimits, setPlanLimits] = useState({})
  const [showRecovery, setShowRecovery] = useState(false)
  const initialized = useRef(false)

  const orgName = currentUser?.orgName || 'Match District Organizer'
  const hasOrgProfile = !!currentUser?.orgName
  const orgTier = currentUser?.tier || 'Free'
  const orgLogo = currentUser?.orgImage || currentUser?.avatar || ''

  const totalSteps = STEPS.length
  const isLastStep = currentStep === totalSteps
  const [stepValidationBlocked, setStepValidationBlocked] = useState({})
  const isNavigationBlocked = stepValidationBlocked[currentStep] === true

  // Auth guard
  useEffect(() => {
    if (loading) return
    if (!currentUser) {
      navigate('/login', { replace: true })
      return
    }
    if (!hasOrganizerRights(currentUser)) {
      navigate('/profile', { replace: true })
      return
    }
  }, [currentUser, loading, navigate])

  // Sync userTier
  useEffect(() => {
    if (currentUser?.tier) {
      setUserTier(currentUser.tier)
    }
  }, [currentUser])

  // Load user & plan info
  useEffect(() => {
    try {
      const stored = localStorage.getItem('md_user')
      if (stored) {
        const u = JSON.parse(stored)
        if (u.tier) setUserTier(u.tier)
      }
    } catch {}

    fetch('/api/org/tournament-usage')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.usage) {
          setPlanLimits({
            maxSlots: res.usage.maxSlots || 100,
            maxTournaments: res.usage.maxTournaments || 30,
          })
        }
      })
      .catch(() => {})
  }, [])

  // Check edit mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const editId = params.get('edit')
    if (editId) {
      setIsEditMode(true)
      setEditingId(editId)
      loadTournamentForEdit(editId)
    }
  }, [])

  const loadTournamentForEdit = async (id) => {
    try {
      const token = await getAuthToken()
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${id}`, { headers })
      const json = await res.json()
      if (json.success && json.tournament) {
        const t = json.tournament
        let roadmap = []
        try {
          const timeline = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline
          roadmap = timeline?.roadmap || timeline || []
          if (!Array.isArray(roadmap)) roadmap = []
        } catch { roadmap = [] }
        setFormData({
          title: t.title || '',
          game: t.game || '',
          description: t.description || '',
          match_type: t.match_type || 'squad',
          perspective: t.perspective || 'tpp',
          slotsTotal: String(t.slotsTotal || '100'),
          reserved_slots: String(t.reserved_slots || '0'),
          entry_fee_amount: String(t.entry_fee_amount || '0'),
          prize_pool_type: t.prize_pool_type || 'dynamic',
          prize_pool_amount: String(t.prize_pool_amount || ''),
          prize_split_1st: t.prize_split_1st || '',
          prize_split_2nd: t.prize_split_2nd || '',
          prize_split_3rd: t.prize_split_3rd || '',
          prize_split_mvp: t.prize_split_mvp || '',
          mvp_enabled: t.mvp_enabled || false,
          mvp_amount: String(t.mvp_amount || ''),
          kill_reward_enabled: t.kill_reward_enabled || false,
          kill_reward_per_kill: String(t.kill_reward_per_kill || ''),
          prize_positions: [],
          cover_image_url: t.cover_image_url || '',
          registrationOpenDate: t.registrationOpenDate || '',
          registrationCloseDate: t.registrationCloseDate || '',
          startDate: t.startDate || '',
          roadmap,
          sponsors: Array.isArray(t.sponsors_data) ? t.sponsors_data : (typeof t.sponsors_data === 'string' ? (() => { try { return JSON.parse(t.sponsors_data) } catch { return [] } })() : []),
          rules: t.rules || '',
          max_slots_per_room: t.max_slots_per_room ? String(t.max_slots_per_room) : '',
        })
        setDraftId(id)
      }
    } catch (err) {
      console.error('Failed to load tournament for editing:', err)
    }
  }

  // Restore draft from localStorage
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (isEditMode) return
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        const savedStep = parsed._savedStep || 1
        delete parsed._savedStep
        const hasData = Object.values(parsed).some((v) => v && (typeof v !== 'object' || (Array.isArray(v) && v.length > 0) || (typeof v === 'object' && Object.keys(v).length > 0)))
        if (hasData) {
          setFormData(parsed)
          setRecoveredStep(savedStep)
          setShowRecovery(true)
        }
      }
    } catch {}
  }, [isEditMode])

  const recoverDraft = () => { setCurrentStep(recoveredStep); setShowRecovery(false) }
  const startNew = () => { localStorage.removeItem(LS_KEY); setFormData(emptyForm()); setCurrentStep(1); setShowRecovery(false) }

  // Save to server
  const saveToServer = useCallback(async (publish = false, preUploadedImageUrl = null) => {
    setIsSubmitting(true)
    try {
      const isDraft = !publish

      // Calculate prize pool
      const basePrizePool = (parseInt(formData.entry_fee_amount) || 0) * (parseInt(formData.slotsTotal) || 0)
      const sponsorContribs = (Array.isArray(formData.sponsors) ? formData.sponsors : [])
        .filter((s) => s.status === 'approved')
        .reduce((sum, s) => sum + (s.amount || 0), 0)
      const finalPrizePool = basePrizePool + sponsorContribs

      const firstRound = (formData.roadmap || [])[0]
      const derivedStartDate = (firstRound?.date && firstRound?.time)
        ? `${firstRound.date}T${firstRound.time}`
        : formData.startDate || ''

      const body = {
        title: formData.title,
        game: formData.game,
        isDraft,
        status: publish ? 'upcoming' : 'draft',
        date: formData.registrationOpenDate || '',
        badgeBg: 'bg-primary',
        badgeText: publish ? 'UPCOMING' : 'DRAFT',
        orgName: '',
        teamsCount: '0',
        featured: false,
        prize: `₹${finalPrizePool}`,
        entry: formData.entry_fee_amount ? `₹${parseInt(formData.entry_fee_amount)}` : 'Free',
        timeline: JSON.stringify({ roadmap: formData.roadmap || [] }),
        registrationOpenDate: formData.registrationOpenDate || '',
        registrationCloseDate: formData.registrationCloseDate || '',
        startDate: derivedStartDate,
        match_type: formData.match_type || 'squad',
        perspective: formData.perspective || 'tpp',
        reserved_slots: parseInt(formData.reserved_slots) || 0,
        entry_fee_amount: parseInt(formData.entry_fee_amount) || 0,
        prize_pool_type: 'dynamic',
        prize_pool_amount: finalPrizePool,
        prize_split_1st: formData.prize_split_1st || '',
        prize_split_2nd: formData.prize_split_2nd || '',
        prize_split_3rd: formData.prize_split_3rd || '',
        prize_split_mvp: formData.prize_split_mvp || '',
        mvp_enabled: formData.mvp_enabled || false,
        mvp_amount: parseInt(formData.mvp_amount) || 0,
        kill_reward_enabled: formData.kill_reward_enabled || false,
        kill_reward_per_kill: parseInt(formData.kill_reward_per_kill) || 0,
        prize_positions: JSON.stringify(formData.prize_positions || []),
        description: formData.description || '',
        cover_image_url: '',
        slotsTotal: parseInt(formData.slotsTotal) || 100,
        sponsors_enabled: formData.sponsors_enabled ?? false,
        rules: formData.rules || '',
        max_slots_per_room: formData.max_slots_per_room ? parseInt(formData.max_slots_per_room) : null,
      }

      // Use pre-uploaded Cloudinary URL from Step9Publish if provided
      if (preUploadedImageUrl) {
        body.cover_image_url = preUploadedImageUrl
      } else {
        // Upload cover image to Cloudinary if local file is pending
        const hasNewFile = !!formData.cover_image_file
        const hasBlobUrl = typeof formData.cover_image_url === 'string' && formData.cover_image_url.startsWith('blob:')
        if (hasNewFile || hasBlobUrl) {
          setUploadingMedia(true)
          try {
            const uploadedUrl = await uploadImage(formData.cover_image_file || formData.cover_image_url)
            body.cover_image_url = uploadedUrl
          } catch (err) {
            console.error('[Publish] Cover image upload failed:', err)
            setUploadingMedia(false)
            setIsSubmitting(false)
            return { tournament: null, error: 'UPLOAD_ERROR', message: 'Failed to upload cover image. Please try again.' }
          } finally {
            setUploadingMedia(false)
          }
        } else if (formData.cover_image_url) {
          body.cover_image_url = formData.cover_image_url
        }
      }

      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      let res
      const targetId = draftId || editingId
      if (targetId) {
        res = await fetch(`/api/tournaments/${targetId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/tournaments', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      }

      const json = await res.json()
      if (!json.success) {
        setIsSubmitting(false)
        return { tournament: null, error: json.error, message: json.message || json.error }
      }

      if (json.tournament) {
        setDraftId(json.tournament.id)
        localStorage.removeItem(LS_KEY)

        // Save sponsors separately
        if (formData.sponsors && formData.sponsors.length > 0) {
          try {
            await fetch(`/api/tournament/sponsors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tournament_id: json.tournament.id,
                sponsors: formData.sponsors,
              }),
            })
          } catch {}
        }
      }
      setIsSubmitting(false)
      return { tournament: json.tournament, error: null, message: null }
    } catch (err) {
      setIsSubmitting(false)
      return { tournament: null, error: 'NETWORK', message: 'Network error saving tournament. Please check your connection and try again.' }
    }
  }, [formData, draftId, editingId])

  const handleValidationBlocked = useCallback((step, blocked) => {
    setStepValidationBlocked(prev => ({ ...prev, [step]: blocked }))
  }, [])

  const handleNext = useCallback(() => {
    const errs = validateStep(currentStep, formData, planLimits, orgName, userTier, currentUser?.role)
    console.log('[CreationWizard] handleNext | step:', currentStep, '| errors:', errs, '| isNavigationBlocked:', isNavigationBlocked, '| stepValidationBlocked:', stepValidationBlocked)
    setErrors(errs)
    if (hasErrors(errs)) return
    if (isNavigationBlocked) return
    setCurrentStep((s) => Math.min(s + 1, totalSteps))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, formData, planLimits, totalSteps, isNavigationBlocked, orgName, userTier, stepValidationBlocked, currentUser])

  const handleBack = useCallback(() => {
    setErrors({})
    setCurrentStep((s) => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const [recoveredStep, setRecoveredStep] = useState(1)
  const [toast, setToast] = useState(null)
  const [publishError, setPublishError] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const handleSaveDraft = useCallback(async () => {
    const result = await saveToServer(false)
    if (result?.error) {
      showToast(result.message || 'Failed to save draft', 'error')
    } else {
      showToast('Draft saved successfully')
    }
  }, [saveToServer, showToast])

  const handlePublish = useCallback(async () => {
    setPublishError(null)
    let allErrors = {}
    for (const step of STEPS) {
      const errs = validateStep(step, formData, planLimits, orgName, userTier, currentUser?.role)
      if (hasErrors(errs)) allErrors = { ...allErrors, ...errs }
    }
    if (hasErrors(allErrors)) {
      setErrors(allErrors)
      const errMessages = Object.values(allErrors).filter(Boolean)
      setPublishError(errMessages.length > 0 ? errMessages.join('. ') : 'Please fix the highlighted errors and try again.')
      return
    }
    const result = await saveToServer(true)
    if (result?.tournament) {
      navigate(`/tournaments/${result.tournament.id}`)
    } else if (result?.error) {
      setPublishError(result.message)
    }
  }, [formData, planLimits, saveToServer, navigate, orgName, userTier, currentUser])

  const handlePublishStep9 = useCallback(async (preUploadedImageUrl) => {
    setPublishError(null)
    // Full validation across all steps
    let allErrors = {}
    for (const step of STEPS) {
      const errs = validateStep(step, formData, planLimits, orgName, userTier, currentUser?.role)
      if (hasErrors(errs)) allErrors = { ...allErrors, ...errs }
    }
    if (hasErrors(allErrors)) {
      setErrors(allErrors)
      setCurrentStep(1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      const errMessages = Object.values(allErrors).filter(Boolean)
      return { tournament: null, error: 'VALIDATION', message: errMessages.length > 0 ? errMessages.join('. ') : 'Please fix the highlighted errors and try again.' }
    }
    const result = await saveToServer(true, preUploadedImageUrl)
    if (result?.error) {
      setPublishError(result.message)
    }
    return result
  }, [formData, planLimits, saveToServer, orgName, userTier, currentUser])

  const debounceRef = useRef(null)
  const handleChange = useCallback((newData) => {
    clearTimeout(debounceRef.current)
    setErrors({})
    debounceRef.current = setTimeout(() => {
      setFormData(newData)
    }, 180)
  }, [])

  const stepComponent = useMemo(() => {
    const props = {
      data: formData,
      onChange: handleChange,
      errors,
      userTier,
      planLimits,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      orgName,
      orgTier,
    }
    switch (currentStep) {
      case 1: return <Step1BasicDetails {...props} />
      case 2: return <Step2MatchSetup {...props} />
      case 3: return <Step3Slots {...props} />
      case 4: return <Step4PrizePool {...props} />
      case 5: return <Step5Media {...props} />
      case 6: return <Step6ScheduleRoadmap {...props} onValidationChange={(blocked) => handleValidationBlocked(6, blocked)} />
      case 7: return <Step7Rules {...props} />
      case 8: return <Step8Preview {...props} />
      case 9: return <Step9Publish {...props} isSubmitting={isSubmitting} uploadingMedia={uploadingMedia} onPublishStep9={handlePublishStep9} publishError={publishError} isEditMode={isEditMode} />
      default: return null
    }
  }, [currentStep, formData, handleChange, errors, userTier, planLimits, handleSaveDraft, handlePublish, isSubmitting, uploadingMedia, orgName, orgTier, handleValidationBlocked, handlePublishStep9, publishError])

  return (
    <div className="min-h-screen bg-background">
      {/* Recovery banner */}
      <AnimatePresence>
        {showRecovery && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sticky top-0 z-50 bg-surface-container border-b border-slate-200 dark:border-outline-variant/20 px-4 py-4"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-on-background">Resume Draft?</p>
                <p className="text-xs text-on-surface-variant mt-0.5">You have an unfinished tournament draft.</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={startNew} className="px-4 py-2 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface-variant hover:bg-surface/50 transition-colors">Start New</button>
                <button onClick={recoverDraft} className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-[0_0_12px_rgba(99,102,241,0.25)]">Resume Draft</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -16, x: '-50%' }}
            className="fixed top-4 left-1/2 z-[100] px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg border pointer-events-none"
            style={{
              backgroundColor: toast.type === 'error' ? '#FEE2E2' : '#D1FAE5',
              color: toast.type === 'error' ? '#991B1B' : '#065F46',
              borderColor: toast.type === 'error' ? '#FCA5A5' : '#6EE7B7',
            }}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              )}
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <StepIndicator currentStep={currentStep} />
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-32">
        <div className="bg-surface-container border border-slate-200 dark:border-outline-variant/20 rounded-2xl p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {stepComponent}
            </motion.div>
          </AnimatePresence>

          {hasErrors(errors) && (
            <div className="mt-6 p-3 rounded-xl bg-error/10 border border-error/20">
              <p className="text-xs font-semibold text-error mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                Please fix the following before continuing:
              </p>
              <ul className="space-y-1">
                {Object.entries(errors).filter(([, v]) => v).map(([field, msg]) => (
                  <li key={field} className="text-[11px] text-error/90 ml-4 list-disc">{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <StepNavigation
        currentStep={currentStep}
        totalSteps={totalSteps}
        onBack={handleBack}
        onNext={handleNext}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        isSubmitting={isSubmitting}
        isLastStep={isLastStep}
        navigationBlocked={isNavigationBlocked}
        isEditMode={isEditMode}
      />
    </div>
  )
}
