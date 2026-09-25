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
import Step6Schedule from './steps/Step6Schedule'
import Step7Rules from './steps/Step7Rules'
import Step8Preview from './steps/Step8Preview'
import Step9Publish from './steps/Step9Publish'
import { buildPlanningConfigPayload, DEFAULT_ROADMAP_PLANNING, deriveTournamentPlanningConfig } from './planningConfigModel'

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
    prize_positions: [
      { id: 'pos_1', name: '1st', percentage: '50' },
      { id: 'pos_2', name: '2nd', percentage: '30' },
      { id: 'pos_3', name: '3rd', percentage: '20' },
    ],
    cover_image_url: '',
    registrationOpenDate: '',
    registrationCloseDate: '',
    startDate: '',
    sponsors: [],
    rules: '',
    teams_per_group: '',
    unique_amount_suffix_enabled: false,
    card_color: 'white',
    planningConfig: { ...DEFAULT_ROADMAP_PLANNING },
  }
}

function validateStep(step, data, planLimits, orgName, userTier, userRole) {
  const errs = {}
  switch (step) {
    case 1:
      if (!data.title || data.title.trim().length < 5) errs.title = 'Title must be at least 5 characters.'
      if (data.title && data.title.length > 20) errs.title = 'Title must be under 20 characters.'
      if (!data.game) errs.game = 'Please select a game.'
      if (data.description && data.description.length > 100) errs.description = 'Description must be under 100 characters.'
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
      break
    }
    case 7:
      break
    case 8:
      break
    case 9: {
      if (!isSystemAdmin({ role: userRole }) && (!orgName || orgName === 'Match District Organizer')) {
        errs.publish = 'Organization profile required. Please create your organization profile before publishing tournaments.'
      }
      if (!data.title || data.title.length < 5) errs.title = 'Tournament title missing or too short (min 5 characters).'
      if (!data.game) errs.game = 'Game selection required.'
      if (!data.match_type) errs.match_type = 'Match type must be selected.'
      if (!data.perspective) errs.perspective = 'Perspective mode must be selected.'
      if (!data.registrationOpenDate) errs.registrationOpenDate = 'Registration open date is required.'
      if (!data.registrationCloseDate) errs.registrationCloseDate = 'Registration close date is required.'
      else if (data.registrationOpenDate && new Date(data.registrationCloseDate) <= new Date(data.registrationOpenDate)) {
        errs.registrationCloseDate = 'Registration close must be after registration opens.'
      }
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
  const [showExitModal, setShowExitModal] = useState(false)
  const initialized = useRef(false)

  const orgName = currentUser?.orgName || 'Match District Organizer'
  const hasOrgProfile = !!currentUser?.orgName
  const orgTier = currentUser?.tier || 'Free'
  const orgLogo = currentUser?.orgImage || currentUser?.avatar || ''

  const totalSteps = STEPS.length
  const isLastStep = currentStep === totalSteps
  const [stepValidationBlocked, setStepValidationBlocked] = useState({})
  const isNavigationBlocked = stepValidationBlocked[currentStep] === true
  const [recoveredStep, setRecoveredStep] = useState(1)
  const [toast, setToast] = useState(null)
  const [publishError, setPublishError] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

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
          sponsors: Array.isArray(t.sponsors_data) ? t.sponsors_data : (typeof t.sponsors_data === 'string' ? (() => { try { return JSON.parse(t.sponsors_data) } catch { return [] } })() : []),
          rules: t.rules || '',
          teams_per_group: t.teams_per_group ? String(t.teams_per_group) : '',
          unique_amount_suffix_enabled: t.unique_amount_suffix_enabled || false,
          card_color: t.card_color || 'white',
          planningConfig: { ...DEFAULT_ROADMAP_PLANNING },
        })
        setDraftId(id)
        // Load planning config for edit mode
        try {
          const pcToken = await getAuthToken()
          const pcHeaders = {}
          if (pcToken) pcHeaders['Authorization'] = `Bearer ${pcToken}`
          const pcRes = await fetch(`/api/tournaments/${id}/planning-config`, { headers: pcHeaders })
          const pcJson = await pcRes.json()
          if (pcJson.success && pcJson.config) {
            setFormData((prev) => ({ ...prev, planningConfig: { ...DEFAULT_ROADMAP_PLANNING, ...deriveTournamentPlanningConfig(t, pcJson.config) } }))
          }
        } catch { /* planning config is optional at edit time */ }
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
        const validStep = Math.min(Math.max(Number(savedStep) || 1, 1), STEPS.length)
        const hasData = Object.values(parsed).some((v) => v && (typeof v !== 'object' || (Array.isArray(v) && v.length > 0) || (typeof v === 'object' && Object.keys(v).length > 0)))
        if (hasData) {
          setFormData(parsed)
          setRecoveredStep(validStep)
          setShowRecovery(true)
        }
      }
    } catch {}
  }, [isEditMode])

  const recoverDraft = () => { setCurrentStep(recoveredStep); setShowRecovery(false) }
  const startNew = () => { localStorage.removeItem(LS_KEY); setFormData(emptyForm()); setCurrentStep(1); setShowRecovery(false) }

  // Save to server
  const saveToServer = useCallback(async (intendedStatus = 'DRAFT', preUploadedImageUrl = null) => {
    setIsSubmitting(true)
    try {
      const isPublished = intendedStatus === 'PUBLISHED'
      const isDraft = !isPublished

      // Calculate prize pool
      const basePrizePool = (parseInt(formData.entry_fee_amount) || 0) * (parseInt(formData.slotsTotal) || 0)
      const sponsorContribs = (Array.isArray(formData.sponsors) ? formData.sponsors : [])
        .filter((s) => s.status === 'approved')
        .reduce((sum, s) => sum + (s.amount || 0), 0)
      const finalPrizePool = basePrizePool + sponsorContribs
      // Use the net placement pool (after platform fee, organizer fee, MVP, kill rewards)
      // synced from Step4PrizePool; fall back to gross for backward compat
      const rawPlacementPool = parseInt(formData.availablePlacementPool) || 0
      const netPrizePool = rawPlacementPool > 0 ? rawPlacementPool + sponsorContribs : finalPrizePool

const body = {
        title: formData.title,
        game: formData.game,
        isDraft,
        status: isPublished ? 'upcoming' : 'draft',
        date: formData.registrationOpenDate || '',
        badgeBg: 'bg-primary',
        badgeText: isPublished ? 'UPCOMING' : 'DRAFT',
        orgName: '',
        teamsCount: '0',
        featured: false,
        prize: netPrizePool > 0 ? `₹${netPrizePool.toLocaleString('en-IN')}` : 'TBD',
        entry: formData.entry_fee_amount ? `₹${parseInt(formData.entry_fee_amount)}` : 'Free',
        registrationOpenDate: formData.registrationOpenDate || '',
        registrationCloseDate: formData.registrationCloseDate || '',
        startDate: formData.startDate || '',
        match_type: formData.match_type || 'squad',
        perspective: formData.perspective || 'tpp',
        reserved_slots: parseInt(formData.reserved_slots) || 0,
        entry_fee_amount: parseInt(formData.entry_fee_amount) || 0,
        prize_pool_type: 'dynamic',
        prize_pool_amount: netPrizePool,
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
        teams_per_group: formData.teams_per_group ? parseInt(formData.teams_per_group) : null,
        max_slots_per_room: formData.max_slots_per_room ? parseInt(formData.max_slots_per_room) : null,
        unique_amount_suffix_enabled: formData.unique_amount_suffix_enabled || false,
        card_color: formData.card_color || 'white',
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
    setErrors(errs)
    if (hasErrors(errs)) {
      setTimeout(() => {
        const firstError = document.querySelector('[data-error]')
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }
    if (isNavigationBlocked) return
    setCurrentStep((s) => Math.min(s + 1, totalSteps))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, formData, planLimits, totalSteps, isNavigationBlocked, orgName, userTier, stepValidationBlocked, currentUser])

  const handleBack = useCallback(() => {
    setErrors({})
    setCurrentStep((s) => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const hasFormData = useMemo(() => {
    return !!(formData.title || formData.game || formData.description || formData.cover_image_url)
  }, [formData])

  const handleWizardBack = useCallback(() => {
    if (hasFormData) {
      setShowExitModal(true)
    } else {
      navigate('/manage/tournaments')
    }
  }, [hasFormData, navigate])

  const handleExitWithoutSaving = useCallback(() => {
    setShowExitModal(false)
    localStorage.removeItem(LS_KEY)
    navigate('/manage/tournaments')
  }, [navigate])

  const handleSaveDraftAndExit = useCallback(async () => {
    setShowExitModal(false)
    const result = await saveToServer('DRAFT')
    if (result?.error) {
      showToast(result.message || 'Failed to save draft', 'error')
    } else {
      localStorage.removeItem(LS_KEY)
      navigate('/manage/tournaments')
    }
  }, [saveToServer, showToast, navigate])



  const handleSaveDraft = useCallback(async () => {
    const result = await saveToServer('DRAFT')
    if (result?.error) {
      showToast(result.message || 'Failed to save draft', 'error')
    } else {
      showToast('Draft saved to your Organizer Dashboard.')
    }
  }, [saveToServer, showToast])

  // Save planning config to the dedicated endpoint
  const handleSavePlanningConfig = useCallback(async (configData) => {
    try {
      const targetId = draftId || editingId
      let createdDraftId = null
      if (!targetId) {
        // Must save tournament first
        const draftResult = await saveToServer('DRAFT')
        if (draftResult?.error || !draftResult?.tournament) {
          return { success: false, message: 'Save the tournament draft before saving roadmap planning.' }
        }
        createdDraftId = draftResult.tournament.id
      }
      const tid = targetId || createdDraftId
      if (!tid) return { success: false, message: 'Tournament ID not found. Please save the tournament first.' }
      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${tid}/planning-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPlanningConfigPayload(formData, configData)),
      })
      const json = await res.json()
      if (!json.success) {
        return { success: false, message: json.message || json.error, errors: json.errors }
      }
      showToast('Roadmap planning saved successfully.')
      return { success: true, config: json.config }
    } catch {
      return { success: false, message: 'Network error. Please check your connection.' }
    }
  }, [draftId, editingId, formData, saveToServer, showToast])

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
    const planningSave = await handleSavePlanningConfig(formData.planningConfig || DEFAULT_ROADMAP_PLANNING)
    if (!planningSave.success) {
      setPublishError(planningSave.message || 'Save roadmap planning before publishing.')
      return
    }
    const result = await saveToServer('PUBLISHED')
    if (result?.tournament) {
      navigate(`/tournaments/${result.tournament.id}`)
    } else if (result?.error) {
      setPublishError(result.message)
    }
  }, [formData, planLimits, saveToServer, navigate, orgName, userTier, currentUser, handleSavePlanningConfig])

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
    const planningSave = await handleSavePlanningConfig(formData.planningConfig || DEFAULT_ROADMAP_PLANNING)
    if (!planningSave.success) {
      setPublishError(planningSave.message || 'Save roadmap planning before publishing.')
      return { tournament: null, error: 'PLANNING_CONFIG', message: planningSave.message || 'Save roadmap planning before publishing.' }
    }
    const result = await saveToServer('PUBLISHED', preUploadedImageUrl)
    if (result?.error) {
      setPublishError(result.message)
    }
    return result
  }, [formData, planLimits, saveToServer, orgName, userTier, currentUser, handleSavePlanningConfig])

  const debounceRef = useRef(null)
  const handleChange = useCallback((newData) => {
    clearTimeout(debounceRef.current)
    setErrors({})
    debounceRef.current = setTimeout(() => {
      setFormData(newData)
      // Auto-save to localStorage for recovery (skip in edit mode)
      if (!isEditMode) {
        try {
          const toSave = { ...newData, _savedStep: currentStep }
          localStorage.setItem(LS_KEY, JSON.stringify(toSave))
        } catch {}
      }
    }, 60)
  }, [isEditMode, currentStep])

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
      onNavigateToSubscription: () => navigate('/subscription/payment'),
    }
    switch (currentStep) {
      case 1: return <Step1BasicDetails {...props} />
      case 2: return <Step2MatchSetup {...props} />
      case 3: return <Step3Slots {...props} />
      case 4: return <Step4PrizePool {...props} />
      case 5: return <Step5Media {...props} />
      case 6: return <Step6Schedule {...props} />
      case 7: return <Step7Rules {...props} />
      case 8: return <Step8Preview {...props} />
      case 9: return <Step9Publish {...props} isSubmitting={isSubmitting} uploadingMedia={uploadingMedia} onPublishStep9={handlePublishStep9} publishError={publishError} isEditMode={isEditMode} />
      default: return null
    }
  }, [currentStep, formData, handleChange, errors, userTier, planLimits, handleSaveDraft, handlePublish, isSubmitting, uploadingMedia, orgName, orgTier, handleValidationBlocked, handlePublishStep9, publishError, handleSavePlanningConfig])

  return (
    <div className="min-h-screen bg-background">
      {/* Recovery banner */}
      <AnimatePresence>
        {showRecovery && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sticky top-0 z-50 bg-surface-container px-4 py-4 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)]"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-on-background">Resume Draft?</p>
                <p className="text-xs text-on-surface-variant mt-0.5">You have an unfinished tournament draft.</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={startNew} className="px-4 py-2 rounded-lg text-xs font-medium bg-surface/50 text-on-surface-variant hover:bg-surface transition-colors">Start New</button>
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

      <AnimatePresence>
        {showExitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowExitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-container rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-outline-variant/20"
            >
              <h3 className="text-lg font-bold text-on-background mb-2">Exit Tournament Creation?</h3>
              <p className="text-sm text-on-surface-variant mb-6">You have unsaved changes. What would you like to do?</p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleSaveDraftAndExit}
                  className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-[0_0_16px_rgba(99,102,241,0.3)] hover:bg-primary/90 transition-all"
                >
                  Save as Draft & Exit
                </button>
                <button
                  onClick={handleExitWithoutSaving}
                  className="w-full py-3 rounded-xl bg-white dark:bg-white/5 text-on-surface-variant text-sm font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-all border border-outline-variant/30"
                >
                  Exit Without Saving
                </button>
                <button
                  onClick={() => setShowExitModal(false)}
                  className="w-full py-2.5 rounded-xl text-on-surface-variant/60 text-sm font-medium hover:text-on-surface-variant transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
        <button
          onClick={handleWizardBack}
          className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="hidden sm:inline">Exit</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <StepIndicator currentStep={currentStep} />
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-32">
        <div className="bg-surface-container rounded-2xl p-4 sm:p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
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
