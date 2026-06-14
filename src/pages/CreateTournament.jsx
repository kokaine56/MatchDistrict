import React, { useState, useEffect, useMemo } from 'react'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { useTheme } from '../ThemeContext.jsx'
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

const STEPS = [
  { step: 1, label: 'Basic Details',  icon: 'info',          desc: 'Title & game' },
  { step: 2, label: 'Match Setup',    icon: 'settings',      desc: 'Mode & region' },
  { step: 3, label: 'Prize Pool',     icon: 'military_tech', desc: 'Rewards & splits' },
  { step: 4, label: 'Slot Config',    icon: 'groups',        desc: 'Capacity & fees' },
  { step: 5, label: 'Rules & KYC',   icon: 'gavel',         desc: 'Compliance' },
  { step: 6, label: 'Media & Brand', icon: 'photo',          desc: 'Banners & logos' },
  { step: 7, label: 'Timeline',       icon: 'schedule',      desc: 'Key dates' },
  { step: 8, label: 'Match Roadmap',  icon: 'map',           desc: 'Round mapping' },
  { step: 9, label: 'Preview & Pub', icon: 'rocket_launch',  desc: 'Launch' },
]

const STEP_TITLES = [
  'Tournament Basics',
  'Match Logistics',
  'Rewards & Prize Splits',
  'Slot Configuration',
  'Rules & KYC Verification',
  'Media & Cover Branding',
  'Key Dates & Milestones',
  'Match Roadmap Details',
  'Form Preview & Publish',
]

const STEP_DESCS = [
  'Fill in the fundamental information about this event.',
  'Configure the server regions and battle mode rules.',
  'Specify rewards and distributions for top placing squads.',
  'Set capacities, VIP slots, and registration charges.',
  'Enforce fairplay requirements and publish the official rulebook.',
  'Select standard graphic covers or host custom assets.',
  'Input key date coordinates. Timers auto-sync accordingly.',
  'Specify match rounds, dates, maps, and qualification rules.',
  'Verify how your live tournament details look.',
]

const COORDINATOR_TIPS = [
  'Make your title catchy. Highlight sponsors or specific game modes.',
  'Choose close server regions to minimize ping. Battle Royale is popular for large entry pools.',
  'A higher player payout (90–95%) attracts more registrations and fills slots faster.',
  'Balance entry fees against slot counts. Reserve slots for VIPs & streamers.',
  'Require KYC for cash tournaments to prevent smurfing & duplicate accounts.',
  'Upload high-quality banners (16:9 ratio) to make your event stand out.',
  'Give players at least 3–5 days to register before the tournament starts.',
  'Rounds structure tells teams exactly how many maps they will play and qualification counts.',
  'Double-check bracket formats and dates before publishing. Save drafts freely.',
]

const PRESET_BANNERS = [
  { title: 'Cyber Arena',   url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80' },
  { title: 'Neon Lounge',   url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80' },
  { title: 'Vapor Fire',    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80' },
  { title: 'Midnight Tech', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80' },
]

// Helper: clean numeric value from ₹ string
const cleanNum = (str) => Number(String(str || '').replace(/[^\d]/g, '')) || 0

const getISOString = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 16)
}

export default function CreateTournament({ onNavigate, template }) {
  const { theme } = useTheme()
  const [currentUser] = useCurrentUser()
  const shouldReduceMotion = useReducedMotion()

  // Stepper state
  const [createStep, setCreateStep] = useState(1)
  const [maxReachedStep, setMaxReachedStep] = useState(() => (template ? 9 : 1))
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingExisting, setIsEditingExisting] = useState(!!(template && template.id))
  const [saveStatus, setSaveStatus] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  
  // Prize auto calculator modes
  const [prizeMode, setPrizeMode] = useState('fixed') // 'fixed' | 'funded'
  const [splitMode, setSplitMode] = useState('auto') // 'auto' | 'manual'
  const [payoutPercent, setPayoutPercent] = useState(90)
  const [split1stPercent, setSplit1stPercent] = useState(60)
  const [split2ndPercent, setSplit2ndPercent] = useState(30)
  const [split3rdPercent, setSplit3rdPercent] = useState(10)
  const [splitMvpPercent, setSplitMvpPercent] = useState(0)

  // Image Upload Progress States
  const [uploadProgress, setUploadProgress] = useState({ banner: null, logo: null })

  // Abuse tracking states
  const [titleAbuse, setTitleAbuse] = useState(false)
  const [orgNameAbuse, setOrgNameAbuse] = useState(false)
  const [rulesAbuse, setRulesAbuse] = useState(false)

  // Initialize Tournament Data state
  const [newTourney, setNewTourney] = useState(() => {
    let initialRoadmap = []
    if (template) {
      if (template.timeline) {
        try {
          const parsed = typeof template.timeline === 'string' ? JSON.parse(template.timeline) : template.timeline
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            initialRoadmap = parsed.roadmap || []
          }
        } catch (e) {
          console.error('Error decoding template timeline:', e)
        }
      }
      return {
        ...template,
        rules: template.rules || '1. Standard competitive rules apply.\n2. Emulators are strictly banned.\n3. Memory scanners must run at all times.',
        slotsTotal: template.slotsTotal !== undefined ? parseInt(template.slotsTotal) : 64,
        slotsReserved: template.slotsReserved !== undefined ? parseInt(template.slotsReserved) : 10,
        kycRequired: template.kycRequired !== undefined ? template.kycRequired : true,
        emulatorBanned: template.emulatorBanned !== undefined ? template.emulatorBanned : true,
        antiCheatRequired: template.antiCheatRequired !== undefined ? template.antiCheatRequired : true,
        roadmap: initialRoadmap
      }
    }
    return {
      id: 'TRN-' + Date.now().toString().slice(-4),
      title: '',
      game: 'BGMI',
      status: 'upcoming',
      prize: '₹25,00,000',
      entry: '₹500',
      teamsCount: '0/64 Teams',
      orgName: currentUser ? (currentUser.orgName || currentUser.name) : 'Verified Organizer',
      registrationOpenDate: getISOString(0),
      registrationCloseDate: getISOString(5),
      startDate: getISOString(7),
      rules: '1. Standard competitive rules apply.\n2. Emulators are strictly banned.\n3. Memory scanners must run at all times.',
      chat: [],
      notices: [],
      teams: [],
      region: 'Mumbai',
      format: 'Battle Royale',
      slotsTotal: 64,
      slotsFilled: 0,
      roomID: '',
      roomPassword: '',
      bannerUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
      logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80',
      isDraft: true,
      kycRequired: true,
      emulatorBanned: true,
      antiCheatRequired: true,
      prizeSplit1st: '₹15,00,000',
      prizeSplit2nd: '₹7,50,000',
      prizeSplit3rd: '₹2,50,000',
      prizeSplitMvp: '₹0',
      slotsReserved: 10,
      roadmap: []
    }
  })

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)
  }

  const triggerAssistantWorker = (presetType) => {
    setIsSaving(true)
    try {
      const worker = new Worker(new URL('../workers/tournamentCreationWorker.js', import.meta.url), { type: 'module' })
      
      worker.postMessage({
        action: 'generateSetup',
        game: newTourney.game,
        slotsTotal: newTourney.slotsTotal,
        startDate: newTourney.startDate,
        presetType
      })
      
      worker.onmessage = (e) => {
        setIsSaving(false)
        if (e.data && e.data.success) {
          const { rules, roadmap, entry, prize, payoutPercent: pPercent } = e.data
          
          let prizeNum = cleanNum(prize)
          let p1st = '₹' + Math.round((prizeNum * 60) / 100).toLocaleString('en-IN')
          let p2nd = '₹' + Math.round((prizeNum * 30) / 100).toLocaleString('en-IN')
          let p3rd = '₹' + Math.round((prizeNum * 10) / 100).toLocaleString('en-IN')
          let pMvp = '₹0'

          setNewTourney(prev => ({
            ...prev,
            rules,
            entry,
            prize,
            prizeSplit1st: p1st,
            prizeSplit2nd: p2nd,
            prizeSplit3rd: p3rd,
            prizeSplitMvp: pMvp,
            roadmap
          }))
          
          setPayoutPercent(pPercent)
          setSplit1stPercent(60)
          setSplit2ndPercent(30)
          setSplit3rdPercent(10)
          setSplitMvpPercent(0)
          setPrizeMode('fixed')
          setSplitMode('auto')
          setMaxReachedStep(9)
          triggerToast(`Assistant Worker compiled '${presetType}' configuration!`)
        } else {
          triggerToast('Assistant Worker returned an invalid response.')
        }
        worker.terminate()
      }

      worker.onerror = (err) => {
        console.error('creation worker error, running fallback:', err)
        runAssistantFallback(presetType)
      }
    } catch (err) {
      console.warn('Web Worker initialization failed, executing fallback:', err)
      runAssistantFallback(presetType)
    }
  }

  const runAssistantFallback = (presetType) => {
    setIsSaving(false)
    const gameUpper = String(newTourney.game || 'BGMI').toUpperCase()
    
    let maps = []
    if (gameUpper === 'BGMI') maps = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi']
    else if (gameUpper === 'VALORANT') maps = ['Ascent', 'Bind', 'Haven', 'Split', 'Sunset']
    else if (gameUpper === 'CS2') maps = ['Mirage', 'Inferno', 'Dust II', 'Nuke', 'Ancient']
    else maps = ['Map Alpha', 'Map Beta', 'Map Gamma']

    let rules = `1. Standard lobby gameplay rules apply.\n2. Emulators are strictly banned.\n3. Fairplay policy in effect.`
    let entry = 'FREE'
    let prize = '₹5,000'
    let payout = 90
    
    if (presetType === 'Pro Cup') {
      entry = '₹500'
      prize = '₹25,00,000'
      payout = 95
    } else if (presetType === 'Casual Cup') {
      entry = '₹100'
      prize = '₹10,000'
      payout = 90
    } else if (presetType === 'Speed Run') {
      entry = 'FREE'
      prize = '₹2,000'
      payout = 100
    }

    const rounds = []
    const baseDate = newTourney.startDate ? new Date(newTourney.startDate) : new Date()
    let numRounds = 3
    if (newTourney.slotsTotal <= 16) numRounds = 2
    else if (newTourney.slotsTotal > 64) numRounds = 4

    for (let i = 1; i <= numRounds; i++) {
      const roundDate = new Date(baseDate)
      if (presetType === 'Speed Run') {
        roundDate.setHours(roundDate.getHours() + (i - 1) * 2)
      } else {
        roundDate.setDate(roundDate.getDate() + (i - 1))
      }
      
      let roundName = `Round ${i}`
      if (i === numRounds) roundName = 'Grand Finals'
      else if (i === numRounds - 1) roundName = 'Semifinals'
      else if (i === 1) roundName = 'Qualifiers'

      rounds.push({
        id: `rnd-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        name: roundName,
        date: roundDate.toISOString().slice(0, 10),
        time: roundDate.toTimeString().slice(0, 5),
        map: maps[(i - 1) % maps.length],
        qualify: i === numRounds ? 'Champion takes all' : 'Top teams advance'
      })
    }

    let prizeNum = cleanNum(prize)
    setNewTourney(prev => ({
      ...prev,
      rules,
      entry,
      prize,
      prizeSplit1st: '₹' + Math.round((prizeNum * 60) / 100).toLocaleString('en-IN'),
      prizeSplit2nd: '₹' + Math.round((prizeNum * 30) / 100).toLocaleString('en-IN'),
      prizeSplit3rd: '₹' + Math.round((prizeNum * 10) / 100).toLocaleString('en-IN'),
      prizeSplitMvp: '₹0',
      roadmap: rounds
    }))
    setPayoutPercent(payout)
    setSplit1stPercent(60)
    setSplit2ndPercent(30)
    setSplit3rdPercent(10)
    setSplitMvpPercent(0)
    setPrizeMode('fixed')
    setSplitMode('auto')
    setMaxReachedStep(9)
    triggerToast(`Assistant Worker compiled '${presetType}' configuration (fallback)!`)
  }

  const validateStep = (step) => {
    if (step === 1) {
      if (!newTourney.title || !newTourney.title.trim()) return 'Tournament Title is required.'
      if (titleAbuse) return 'Tournament Title contains inappropriate/abusive words.'
      if (!newTourney.orgName || !newTourney.orgName.trim()) return 'Organizer Brand Name is required.'
      if (orgNameAbuse) return 'Organizer Brand Name contains inappropriate/abusive words.'
      if (!newTourney.game) return 'Game selection is required.'
    }
    if (step === 3) {
      if (splitMode === 'auto') {
        const totalSplit = Number(split1stPercent) + Number(split2ndPercent) + Number(split3rdPercent) + Number(splitMvpPercent)
        if (totalSplit !== 100) return `Prize splits allocation must total 100% exactly! Current total: ${totalSplit}%`
      } else {
        const totalPrize = cleanNum(newTourney.prize)
        if (totalPrize <= 0) return 'Please enter a valid prize pool amount greater than ₹0.'
        const splitsSum = cleanNum(newTourney.prizeSplit1st) + cleanNum(newTourney.prizeSplit2nd) + cleanNum(newTourney.prizeSplit3rd) + cleanNum(newTourney.prizeSplitMvp)
        if (splitsSum !== totalPrize) return `Sum of splits (₹${splitsSum.toLocaleString('en-IN')}) must equal the total prize pool (₹${totalPrize.toLocaleString('en-IN')}).`
      }
    }
    if (step === 4) {
      const slotsInput = parseInt(newTourney.slotsTotal) || 0
      if (slotsInput <= 0) return 'Total slot count must be greater than 0.'
      
      const userTier = currentUser ? (currentUser.tier || 'Free') : 'Free'
      let maxSlots = 64
      if (userTier === 'Basic') maxSlots = 128
      else if (userTier === 'Pro') maxSlots = 999999
      if (slotsInput > maxSlots) return `Your current plan (${userTier}) only allows up to ${maxSlots} slots. Upgrade to host more!`
      
      if (!newTourney.entry || !newTourney.entry.trim()) return 'Entry fee is required (e.g. ₹500 or FREE).'

      const slotsReservedNum = parseInt(newTourney.slotsReserved) || 0
      if (slotsReservedNum < 0) return 'Reserved VIP slots count cannot be negative.'
      if (slotsReservedNum >= slotsInput) return 'Reserved VIP slots must be less than the total slot count.'
    }
    if (step === 5) {
      if (!newTourney.rules || !newTourney.rules.trim()) return 'Rules and Guidelines are required.'
      if (rulesAbuse) return 'Rules and Guidelines contain inappropriate/abusive words.'
    }
    if (step === 6) {
      if (!newTourney.bannerUrl || !newTourney.bannerUrl.trim()) return 'Please choose or upload a tournament cover banner.'
      if (!newTourney.logoUrl || !newTourney.logoUrl.trim()) return 'Please upload an organizer logo.'
    }
    if (step === 7) {
      if (!newTourney.registrationOpenDate) return 'Registration open date is required.'
      if (!newTourney.registrationCloseDate) return 'Registration close date is required.'
      if (!newTourney.startDate) return 'Tournament kickoff start date is required.'
      const openDate = new Date(newTourney.registrationOpenDate)
      const closeDate = new Date(newTourney.registrationCloseDate)
      const startDate = new Date(newTourney.startDate)

      if (closeDate <= openDate) return 'Registration close date must be after registration open date.'
      if (startDate < closeDate) return 'Tournament kickoff start date must be on or after registration close date.'
    }
    if (step === 8) {
      if (!newTourney.roadmap || newTourney.roadmap.length === 0) return 'Please add at least one match round to the roadmap.'
      for (let i = 0; i < newTourney.roadmap.length; i++) {
        const round = newTourney.roadmap[i]
        if (!round.name || !round.name.trim()) return `Please enter a name for Round ${i + 1}.`
        if (!round.date) return `Please enter a date for Round ${i + 1}.`
        if (!round.time) return `Please enter a kickoff time for Round ${i + 1}.`
        if (!round.map || !round.map.trim()) return `Please select or enter a map for Round ${i + 1}.`
      }
    }
    return null
  }

  useEffect(() => {
    let finalPrizeNum = cleanNum(newTourney.prize)

    if (prizeMode === 'funded') {
      let entryFeeNum = 0
      const cleanEntryStr = String(newTourney.entry || '').trim().toUpperCase()
      if (cleanEntryStr && cleanEntryStr !== 'FREE') {
        entryFeeNum = Number(cleanEntryStr.replace(/[^\d]/g, '')) || 0
      }
      
      const slotsTotalNum = Number(newTourney.slotsTotal) || 0
      const totalCollected = entryFeeNum * slotsTotalNum
      finalPrizeNum = Math.round((totalCollected * payoutPercent) / 100)

      setNewTourney(prev => ({
        ...prev,
        prize: '₹' + finalPrizeNum.toLocaleString('en-IN')
      }))
    }

    if (splitMode === 'auto') {
      const prize1st = Math.round((finalPrizeNum * split1stPercent) / 100)
      const prize2nd = Math.round((finalPrizeNum * split2ndPercent) / 100)
      const prize3rd = Math.round((finalPrizeNum * split3rdPercent) / 100)
      const prizeMvp = Math.round((finalPrizeNum * splitMvpPercent) / 100)

      setNewTourney(prev => ({
        ...prev,
        prizeSplit1st: '₹' + prize1st.toLocaleString('en-IN'),
        prizeSplit2nd: '₹' + prize2nd.toLocaleString('en-IN'),
        prizeSplit3rd: '₹' + prize3rd.toLocaleString('en-IN'),
        prizeSplitMvp: '₹' + prizeMvp.toLocaleString('en-IN')
      }))
    }
  }, [
    newTourney.entry,
    newTourney.slotsTotal,
    payoutPercent,
    split1stPercent,
    split2ndPercent,
    split3rdPercent,
    splitMvpPercent,
    prizeMode,
    splitMode,
    newTourney.prize
  ])

  const uploadImageWithProgress = (file, key) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image file must be under 5MB.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result
      
      const xhr = new XMLHttpRequest()
      const token = await getAuthToken()
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded * 100) / e.total)
          setUploadProgress(prev => ({ ...prev, [key]: percent }))
        }
      })

      xhr.addEventListener('load', () => {
        setUploadProgress(prev => ({ ...prev, [key]: null }))
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.success && data.url) {
              setNewTourney(prev => ({ ...prev, [key === 'banner' ? 'bannerUrl' : 'logoUrl']: data.url }))
              triggerToast('Image uploaded successfully!')
            } else {
              triggerToast(data.message || 'Image upload failed.')
            }
          } catch (err) {
            triggerToast('Invalid response format from upload service.')
          }
        } else {
          triggerToast(`Upload failed with status: ${xhr.status}`)
        }
      })

      xhr.addEventListener('error', () => {
        setUploadProgress(prev => ({ ...prev, [key]: null }))
        triggerToast('Network error during upload.')
      })

      xhr.open('POST', '/api/upload')
      xhr.setRequestHeader('Content-Type', 'application/json')
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      xhr.send(JSON.stringify({ image: base64 }))
    }
    reader.readAsDataURL(file)
  }

  const handleSaveDraft = async () => {
    if (titleAbuse || orgNameAbuse || rulesAbuse) {
      triggerToast('Cannot save draft: Inappropriate content detected in fields.')
      return false
    }
    setIsSaving(true)
    const finalStart = newTourney.startDate
    
    const serializedTimeline = JSON.stringify({
      dates: [
        { label: 'Registration Open', date: newTourney.registrationOpenDate, status: 'completed' },
        { label: 'Registration Closes', date: newTourney.registrationCloseDate, status: 'pending' },
        { label: 'Credentials Release', date: newTourney.startDate, status: 'pending' },
        { label: 'Tournament Starts', date: newTourney.startDate, status: 'pending' }
      ],
      roadmap: newTourney.roadmap || []
    })

    const draftT = {
      ...newTourney,
      isDraft: true,
      status: 'draft',
      badgeBg: 'bg-surface-container-highest text-on-surface-variant',
      badgeText: 'DRAFT',
      date: finalStart ? new Date(finalStart).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TBD',
      teamsCount: `${newTourney.slotsFilled || 0}/${newTourney.slotsTotal || 64} Teams`,
      orgName: currentUser ? (currentUser.orgName || currentUser.name) : 'Verified Organizer',
      timeline: serializedTimeline
    }

    const token = await getAuthToken()
    try {
      let res
      if (isEditingExisting) {
        res = await fetch(`/api/tournaments/${newTourney.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(draftT)
        })
      } else {
        res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(draftT)
        })
      }
      const data = await res.json()
      if (data.success) {
        setIsEditingExisting(true)
        let updatedRoadmap = []
        if (data.tournament.timeline) {
          try {
            const parsed = typeof data.tournament.timeline === 'string' ? JSON.parse(data.tournament.timeline) : data.tournament.timeline
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              updatedRoadmap = parsed.roadmap || []
            }
          } catch (e) {
            console.error(e)
          }
        }
        setNewTourney({
          ...data.tournament,
          roadmap: updatedRoadmap
        })
        setSaveStatus(`Draft Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
        triggerToast('Draft saved successfully!')
        return true
      } else {
        setSaveStatus('Auto-save failed')
        triggerToast(data.message || 'Failed to save draft.')
        return false
      }
    } catch (err) {
      console.error('Draft save failed:', err)
      setSaveStatus('Auto-save failed')
      triggerToast('Error connecting to draft service.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublishTournament = async (e) => {
    if (e) e.preventDefault()

    for (let step = 1; step <= 8; step++) {
      const err = validateStep(step)
      if (err) {
        triggerToast(`Validation failed on Step ${step}: ${err}`)
        setCreateStep(step)
        return
      }
    }

    const finalStart = newTourney.startDate
    const isLive = finalStart && new Date(finalStart) <= new Date()
    
    const serializedTimeline = JSON.stringify({
      dates: [
        { label: 'Registration Open', date: newTourney.registrationOpenDate, status: 'completed' },
        { label: 'Registration Closes', date: newTourney.registrationCloseDate, status: 'pending' },
        { label: 'Credentials Release', date: newTourney.startDate, status: 'pending' },
        { label: 'Tournament Starts', date: newTourney.startDate, status: 'pending' }
      ],
      roadmap: newTourney.roadmap || []
    })

    const finalT = {
      ...newTourney,
      isDraft: false,
      status: isLive ? 'live' : 'upcoming',
      badgeBg: isLive ? 'bg-error' : 'bg-primary',
      badgeText: isLive ? 'LIVE' : 'UPCOMING',
      teamsCount: `${newTourney.slotsFilled || 0}/${newTourney.slotsTotal || 64} Teams`,
      date: finalStart ? new Date(finalStart).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TBD',
      orgName: currentUser ? (currentUser.orgName || currentUser.name) : 'Verified Organizer',
      timeline: serializedTimeline
    }

    setIsSaving(true)
    const token = await getAuthToken()
    try {
      let res
      if (isEditingExisting) {
        res = await fetch(`/api/tournaments/${newTourney.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(finalT)
        })
      } else {
        res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(finalT)
        })
      }
      const data = await res.json()
      if (data.success) {
        triggerToast(`Successfully published ${data.tournament.title}!`)
        setTimeout(() => {
          onNavigate && onNavigate('profile')
        }, 1500)
      } else {
        triggerToast(data.message || `Failed to publish: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      triggerToast('Error publishing tournament.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleNextStep = async () => {
    const validationError = validateStep(createStep)
    if (validationError) {
      triggerToast(validationError)
      return
    }

    const saved = await handleSaveDraft()
    if (!saved) {
      return
    }

    setCreateStep(prev => {
      const next = Math.min(prev + 1, 9)
      setMaxReachedStep(curr => Math.max(curr, next))
      return next
    })
  }

  const handlePrevStep = () => {
    setCreateStep(prev => Math.max(prev - 1, 1))
  }

  const handleAddRound = () => {
    const defaultMaps = {
      BGMI: 'Erangel',
      VALORANT: 'Ascent',
      CS2: 'Mirage',
    }
    const selectedGame = String(newTourney.game || 'BGMI').toUpperCase()
    const newRound = {
      id: `rnd-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `Round ${newTourney.roadmap.length + 1}`,
      date: newTourney.startDate ? newTourney.startDate.slice(0, 10) : getISOString(0).slice(0, 10),
      time: '18:00',
      map: defaultMaps[selectedGame] || 'Map Pool A',
      qualify: 'Top teams qualify'
    }
    setNewTourney(prev => ({
      ...prev,
      roadmap: [...prev.roadmap, newRound]
    }))
  }

  const handleUpdateRound = (index, key, val) => {
    const updated = [...newTourney.roadmap]
    updated[index][key] = val
    setNewTourney(prev => ({
      ...prev,
      roadmap: updated
    }))
  }

  const handleDeleteRound = (index) => {
    const updated = newTourney.roadmap.filter((_, idx) => idx !== index)
    setNewTourney(prev => ({
      ...prev,
      roadmap: updated
    }))
  }

  const handleAutoGenerateRoadmap = () => {
    if (!newTourney.startDate) {
      triggerToast('Please set a Kickoff Start Date in Step 7 first.')
      setCreateStep(7)
      return
    }
    triggerAssistantWorker('Casual Cup')
  }

  const totalCollection = cleanNum(newTourney.entry) * (Number(newTourney.slotsTotal) || 0)
  const organizerKeep   = Math.round(totalCollection * ((100 - payoutPercent) / 100))
  const splitSum        = Number(split1stPercent) + Number(split2ndPercent) + Number(split3rdPercent) + Number(splitMvpPercent)

  const inputClass = 'w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-sm focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-white/30 truncate shadow-sm'
  const selectClass = 'w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-sm focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all cursor-pointer shadow-sm appearance-none'
  const labelClass  = 'block text-[10px] font-bold text-slate-700 dark:text-white/50 uppercase tracking-widest mb-1.5'

  const stepVariants = shouldReduceMotion ? {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  } : {
    initial: { opacity: 0, x: 15 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -15 }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07080C] relative text-slate-900 dark:text-white flex flex-col font-sans overflow-x-hidden selection:bg-indigo-500/30">
      
      {/* Dynamic Background Effects for Dark Mode */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 dark:block hidden">
        <div className="absolute top-[-10%] left-[20%] w-[350px] sm:w-[700px] h-[350px] sm:h-[700px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none"></div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/90 dark:bg-[#0f111a]/90 backdrop-blur-xl border border-indigo-500/30 text-slate-900 dark:text-white px-6 py-4 rounded-2xl shadow-[0_10px_40px_rgba(99,102,241,0.2)] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <span className="material-symbols-outlined text-indigo-500 text-2xl animate-spin-slow">info</span>
          <span className="font-medium text-xs sm:text-sm tracking-wide">{toastMessage}</span>
        </div>
      )}

      {/* Processing Overlay */}
      {isSaving && <LoadingScreen message="Syncing Details..." overlay />}

      {/* TOP HEADER BAR */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3.5 shrink-0 border-b z-20 bg-white/80 dark:bg-[#07080C]/80 backdrop-blur-md sticky top-0 border-slate-200 dark:border-white/10 transition-colors duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <button 
            onClick={() => onNavigate('profile')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 shrink-0 active:scale-95 text-slate-700 dark:text-white/70"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-wider flex items-center gap-2 truncate text-slate-900 dark:text-white">
              <span className="material-symbols-outlined text-indigo-500 text-base shrink-0">rocket_launch</span>
              <span className="hidden xs:inline">Command Center</span>
              <span className="xs:hidden">Creator</span>
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5 truncate text-slate-500 dark:text-white/40">
              {isEditingExisting ? 'Editing Draft' : 'Host Event'} &bull; Step {createStep} of 9
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveStatus && (
            <div className="hidden md:flex items-center gap-1.5 text-[9px] text-emerald-500 dark:text-emerald-400 font-extrabold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
              {saveStatus}
            </div>
          )}
          <button
            onClick={() => onNavigate('profile')}
            className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white/80 transition-all active:scale-95"
          >
            Exit
          </button>
        </div>
      </header>

      {/* MAIN BODY */}
      <div className="flex flex-1 overflow-hidden min-h-0 flex-col md:flex-row relative z-10">

        {/* COMPACT MOBILE/TABLET HORIZONTAL STEPPER */}
        <div className="md:hidden w-full max-w-full px-4 py-3 flex items-center gap-2.5 overflow-x-auto no-scrollbar bg-white/50 dark:bg-[#07080C]/50 backdrop-blur-md border-b border-slate-200 dark:border-white/10 relative z-10 shrink-0">
          {STEPS.map((s) => {
            const isActive = createStep === s.step
            const isDone   = createStep > s.step
            const isLocked = s.step > maxReachedStep
            
            let baseClass = 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40'
            let textCol = 'text-slate-500 dark:text-white/40'
            if (isActive) textCol = 'text-white'
            else if (isDone) baseClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
            
            return (
              <button
                key={s.step}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (s.step < createStep) setCreateStep(s.step)
                  else if (s.step > createStep) triggerToast('Please click the Next button to validate and proceed forward.')
                }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-bold tracking-wide uppercase transition-all duration-300 border relative ${isActive ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : baseClass} ${isLocked ? 'opacity-40 cursor-not-allowed' : ''} ${textCol}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeWizardStepMobile"
                    className="absolute inset-0 bg-indigo-500 rounded-xl z-0"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="material-symbols-outlined text-[13px] relative z-10">
                  {isLocked ? 'lock' : isDone ? 'check' : s.icon}
                </span>
                <span className="whitespace-nowrap relative z-10">{s.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>

        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden md:flex flex-col w-64 shrink-0 py-6 px-4 gap-1 overflow-y-auto bg-white/60 dark:bg-[#07080C]/60 backdrop-blur-xl border-r border-slate-200 dark:border-white/10 relative z-10 custom-scrollbar">
          <div className="mb-6 px-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest block">Wizard Progress</span>
          </div>
          
          <div className="space-y-1.5 relative">
            <div className="absolute left-[24px] top-4 bottom-4 w-[2px] bg-slate-200 dark:bg-white/10 pointer-events-none">
              <div 
                className="w-full bg-gradient-to-b from-emerald-400 to-indigo-500 transition-all duration-500 rounded-full drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]" 
                style={{ height: `${Math.min(100, Math.max(0, ((createStep - 1) / 8) * 100))}%` }}
              />
            </div>

            {STEPS.map((s) => {
              const isActive = createStep === s.step
              const isDone   = createStep > s.step
              const isLocked = s.step > maxReachedStep
              
              let dotBg = 'bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/20'
              let iconCol = 'text-slate-400 dark:text-white/40'
              let textCol = 'text-slate-500 dark:text-white/40'
              
              if (isActive) {
                dotBg = 'bg-indigo-500 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                iconCol = 'text-white'
                textCol = 'text-indigo-600 dark:text-indigo-400 font-extrabold'
              } else if (isDone) {
                dotBg = 'bg-emerald-500/20 border-emerald-500/40'
                iconCol = 'text-emerald-600 dark:text-emerald-400'
                textCol = 'text-emerald-600 dark:text-emerald-400'
              }
              
              return (
                <button
                  key={s.step}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (s.step < createStep) setCreateStep(s.step)
                    else if (s.step > createStep && !isLocked) triggerToast('Please click the Next button to validate and proceed forward.')
                  }}
                  className={`w-full flex items-center gap-3.5 px-2.5 py-2.5 rounded-xl text-left transition-all duration-300 relative group ${
                    isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-white/5'
                  } border border-transparent`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeWizardStep"
                      className="absolute inset-0 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-xl z-0"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 border ${dotBg} group-hover:scale-105 relative z-10`}>
                    <span className={`material-symbols-outlined text-[13px] ${iconCol}`}>
                      {isLocked ? 'lock' : isDone ? 'check' : s.icon}
                    </span>
                  </div>
                  <div className="min-w-0 relative z-10">
                    <div className={`text-[10px] font-extrabold tracking-wide uppercase leading-tight truncate ${textCol}`}>
                      {s.label}
                    </div>
                    <div className="text-[9px] font-medium text-slate-500 dark:text-white/30 mt-0.5 leading-none truncate">{isLocked ? 'Locked' : s.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* CENTER MAIN FORM CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 relative z-10 custom-scrollbar bg-slate-50 dark:bg-transparent">
          <div className="max-w-4xl mx-auto">
            
            {/* Main Form Glass Card */}
            <div className="bg-white/90 dark:bg-[#0f111a]/70 backdrop-blur-2xl border border-slate-200 dark:border-white/10 p-5 sm:p-8 md:p-10 rounded-3xl shadow-xl dark:shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative overflow-hidden transition-colors duration-300 min-h-[500px]">
              
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-60"></div>
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={createStep}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={stepVariants}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="space-y-8"
                >
                  <div className="space-y-2 border-b border-slate-200 dark:border-white/10 pb-5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                      Step {createStep} of 9
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black uppercase text-slate-900 dark:text-white tracking-tight leading-none pt-1">{STEP_TITLES[createStep - 1]}</h2>
                    <p className="text-xs text-slate-600 dark:text-white/50 font-medium leading-relaxed mt-1.5">{STEP_DESCS[createStep - 1]}</p>
                  </div>

                  {/* STEP 1: Basic Details */}
                  {createStep === 1 && (
                    <div className="space-y-6">
                      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-5 rounded-2xl space-y-4 relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
                        <div className="flex items-center gap-2.5 relative z-10">
                          <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-xl animate-pulse">smart_toy</span>
                          <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Creation Assistant Worker</h4>
                        </div>
                        <p className="text-[10px] text-slate-600 dark:text-white/60 leading-relaxed relative z-10 max-w-2xl">
                          Auto-configure recommended timelines, rules, entry gates, map pools, and reward roadmaps instantly using background presets compiled inside a dedicated web worker thread.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 relative z-10">
                          {[
                            { name: 'Casual Cup', icon: 'sports_esports', color: 'text-indigo-500', desc: 'Low entry fee, standard maps' },
                            { name: 'Pro Cup', icon: 'military_tech', color: 'text-amber-500', desc: 'Premium pool, full competitive map' },
                            { name: 'Speed Run', icon: 'bolt', color: 'text-emerald-500', desc: 'Free entry, instant hourly schedule' }
                          ].map(preset => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => triggerAssistantWorker(preset.name)}
                              className="group p-4 rounded-xl text-left bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:border-indigo-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col justify-between gap-3 text-slate-900 dark:text-white"
                            >
                              <div className="flex items-center justify-between">
                                <span className={`material-symbols-outlined text-xl ${preset.color}`}>{preset.icon}</span>
                                <span className="text-[9px] font-bold bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider text-slate-500 dark:text-white/60">Preset</span>
                              </div>
                              <div>
                                <h5 className="text-xs font-extrabold uppercase text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">{preset.name}</h5>
                                <p className="text-[9px] text-slate-500 dark:text-white/40 mt-1 leading-relaxed truncate">{preset.desc}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Tournament Title *</label>
                        <AbuseFieldWrapper fieldId="tourney-title" value={newTourney.title} onWarning={setTitleAbuse}>
                          <input type="text" required value={newTourney.title} onChange={(e) => setNewTourney({ ...newTourney, title: e.target.value })} placeholder="e.g. BGMI Apex Masters 2026" className={inputClass} />
                        </AbuseFieldWrapper>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className={labelClass}>Game Title *</label>
                          <select value={newTourney.game} onChange={(e) => setNewTourney({ ...newTourney, game: e.target.value })} className={selectClass}>
                            <option value="BGMI">BGMI</option>
                            <option value="VALORANT">Valorant</option>
                            <option value="CS2">CS2</option>
                            <option value="FREE FIRE">Free Fire</option>
                            <option value="APEX LEGENDS">Apex Legends</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Organizer Brand Name *</label>
                          <AbuseFieldWrapper fieldId="tourney-orgName" value={newTourney.orgName || ''} onWarning={setOrgNameAbuse}>
                            <input type="text" required value={newTourney.orgName || ''} onChange={(e) => setNewTourney({ ...newTourney, orgName: e.target.value })} placeholder="Your org / team name" className={inputClass} />
                          </AbuseFieldWrapper>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Match Settings */}
                  {createStep === 2 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className={labelClass}>Match Format</label>
                          <select value={newTourney.format} onChange={(e) => setNewTourney({ ...newTourney, format: e.target.value })} className={selectClass}>
                            <option value="Battle Royale">Battle Royale</option>
                            <option value="Squad (5v5)">Squad (5v5)</option>
                            <option value="Squad (4v4)">Squad (4v4)</option>
                            <option value="Duo (2v2)">Duo (2v2)</option>
                            <option value="Solo (1v1)">Solo (1v1)</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Server Region</label>
                          <select value={newTourney.region} onChange={(e) => setNewTourney({ ...newTourney, region: e.target.value })} className={selectClass}>
                            <option value="Mumbai">Mumbai (India)</option>
                            <option value="Delhi">Delhi (India)</option>
                            <option value="Singapore">Singapore (SEA)</option>
                            <option value="Frankfurt">Frankfurt (Europe)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Prize Pool */}
                  {createStep === 3 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className={labelClass}>Prize Pool Mode</label>
                          <select value={prizeMode} onChange={(e) => setPrizeMode(e.target.value)} className={selectClass}>
                            <option value="fixed">Fixed Sponsored Prize Pool (Default)</option>
                            <option value="funded">Funded by Collected Entry Fees</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Splits Calculation Mode</label>
                          <select value={splitMode} onChange={(e) => setSplitMode(e.target.value)} className={selectClass}>
                            <option value="auto">Auto-Calculate splits by % (Recommended)</option>
                            <option value="manual">Enter exact split amounts manually</option>
                          </select>
                        </div>
                      </div>

                      <div className="rounded-2xl p-6 md:p-8 text-center space-y-3 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 relative overflow-hidden shadow-inner">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-2xl rounded-full pointer-events-none" />
                        <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase tracking-widest font-extrabold relative z-10">
                          {prizeMode === 'fixed' ? 'Total Sponsored Prize Pool' : 'Auto-Calculated Prize Pool'}
                        </p>
                        
                        {prizeMode === 'fixed' ? (
                          <input
                            type="text"
                            value={newTourney.prize}
                            onChange={(e) => setNewTourney({ ...newTourney, prize: e.target.value })}
                            placeholder="e.g. ₹25,00,000"
                            className="w-full bg-transparent border-none text-center font-black text-3xl md:text-4xl outline-none focus:ring-0 text-indigo-600 dark:text-indigo-400 placeholder:text-slate-300 dark:placeholder:text-white/20 relative z-10"
                          />
                        ) : (
                          <div className="text-3xl md:text-4xl font-black tracking-tight text-indigo-600 dark:text-indigo-400 relative z-10">
                            {newTourney.prize || '₹0'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 p-5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        {prizeMode === 'funded' && (
                          <div className="space-y-2 pb-3 border-b border-slate-200 dark:border-white/10 mb-4">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                              <span className="text-slate-600 dark:text-white/50">Player Payout Percentage</span>
                              <span className="text-indigo-600 dark:text-indigo-400">{payoutPercent}% &rarr; Org keeps {100 - payoutPercent}%</span>
                            </div>
                            <input type="range" min="50" max="100" step="5" value={payoutPercent} onChange={(e) => setPayoutPercent(parseInt(e.target.value))} className="w-full h-1.5 cursor-pointer rounded-full accent-indigo-500" />
                          </div>
                        )}

                        {splitMode === 'auto' ? (
                          <div className="space-y-5">
                            <p className="text-[10px] text-slate-600 dark:text-white/50 uppercase tracking-widest font-extrabold">Reward Allocation Splits</p>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                              {[
                                { label: '🥇 1st place', value: split1stPercent, setter: setSplit1stPercent, color: '#fbbf24' },
                                { label: '🥈 2nd place', value: split2ndPercent, setter: setSplit2ndPercent, color: '#94a3b8' },
                                { label: '🥉 3rd place', value: split3rdPercent, setter: setSplit3rdPercent, color: '#d97706' },
                                { label: '🏅 MVP Award', value: splitMvpPercent, setter: setSplitMvpPercent, color: '#6366f1' },
                              ].map(({ label, value, setter, color }) => (
                                <div key={label} className="rounded-xl p-4 space-y-3 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10">
                                  <div className="flex justify-between text-[10px] font-extrabold uppercase tracking-wider">
                                    <span className="text-slate-600 dark:text-white/50">{label}</span>
                                    <span className="font-black" style={{ color }}>{value}%</span>
                                  </div>
                                  <input type="range" min="0" max="100" step="5" value={value} onChange={(e) => setter(parseInt(e.target.value))} className="w-full h-1 cursor-pointer rounded-full" style={{ accentColor: color }} />
                                </div>
                              ))}
                            </div>
                            {splitSum !== 100 && (
                              <div className="flex items-center gap-2 p-3 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400">
                                <span className="material-symbols-outlined text-sm">warning</span>
                                Splits must total 100% (currently: {splitSum}%)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <button
                              type="button"
                              onClick={() => {
                                const totalPrize = cleanNum(newTourney.prize)
                                setNewTourney(prev => ({
                                  ...prev,
                                  prizeSplit1st: '₹' + Math.round(totalPrize * 0.60).toLocaleString('en-IN'),
                                  prizeSplit2nd: '₹' + Math.round(totalPrize * 0.30).toLocaleString('en-IN'),
                                  prizeSplit3rd: '₹' + Math.round(totalPrize * 0.10).toLocaleString('en-IN'),
                                  prizeSplitMvp: '₹0'
                                }))
                                triggerToast('Applied standard 60/30/10/0 splits to prize pool!')
                              }}
                              className="w-full py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined text-sm">smart_toy</span>
                              Auto-fill standard Splits (60/30/10/0)
                            </button>
                            {(() => {
                              const totalPrize = cleanNum(newTourney.prize)
                              const splitsSum = cleanNum(newTourney.prizeSplit1st) + cleanNum(newTourney.prizeSplit2nd) + cleanNum(newTourney.prizeSplit3rd) + cleanNum(newTourney.prizeSplitMvp)
                              if (totalPrize > 0 && splitsSum !== totalPrize) {
                                return (
                                  <div className="flex items-center gap-2 p-3 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    Sum of splits (₹{splitsSum.toLocaleString('en-IN')}) does not match total prize pool (₹{totalPrize.toLocaleString('en-IN')})
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: '🥇 1st Place', key: 'prizeSplit1st' },
                          { label: '🥈 2nd Place', key: 'prizeSplit2nd' },
                          { label: '🥉 3rd Place', key: 'prizeSplit3rd' },
                          { label: '🏅 MVP Award', key: 'prizeSplitMvp' },
                        ].map(({ label, key }) => (
                          <div key={key}>
                            <label className={labelClass}>{label}</label>
                            <input type="text" disabled={splitMode === 'auto'} value={newTourney[key] || ''} onChange={(e) => setNewTourney({ ...newTourney, [key]: e.target.value })} className={`${inputClass} ${splitMode === 'auto' ? 'opacity-60 cursor-not-allowed border-dashed bg-slate-100 dark:bg-black/50' : ''}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Slot Configuration */}
                  {createStep === 4 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div>
                          <label className={labelClass}>Total Slot Count *</label>
                          <input type="number" required value={newTourney.slotsTotal} onChange={(e) => setNewTourney({ ...newTourney, slotsTotal: parseInt(e.target.value) || 64 })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Reserved VIP Slots</label>
                          <input type="number" value={newTourney.slotsReserved} onChange={(e) => setNewTourney({ ...newTourney, slotsReserved: parseInt(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Entry Fee *</label>
                          <input type="text" required value={newTourney.entry} onChange={(e) => setNewTourney({ ...newTourney, entry: e.target.value })} placeholder="e.g. ₹500 or FREE" className={inputClass} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { label: 'Public Slots', value: Math.max(0, (newTourney.slotsTotal || 0) - (newTourney.slotsReserved || 0)), color: '#6366f1', icon: 'groups' },
                          { label: 'VIP Reserved', value: newTourney.slotsReserved || 0, color: '#fbbf24', icon: 'verified_user' },
                          { label: 'Estimated Revenue', value: `₹${totalCollection.toLocaleString('en-IN')}`, color: '#10b981', icon: 'payments' },
                        ].map(({ label, value, color, icon }) => (
                          <div key={label} className="rounded-2xl p-5 text-left bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-4 shadow-sm">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 shrink-0">
                              <span className="material-symbols-outlined text-xl" style={{ color }}>{icon}</span>
                            </div>
                            <div>
                              <div className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{value}</div>
                              <div className="text-[10px] text-slate-500 dark:text-white/40 uppercase tracking-widest mt-0.5 font-bold leading-none">{label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 5: Rules & KYC */}
                  {createStep === 5 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { key: 'kycRequired', icon: 'badge', label: 'KYC Verification', desc: 'Verify player identities' },
                          { key: 'emulatorBanned', icon: 'desktop_access_disabled', label: 'Anti-Emulator', desc: 'Banish emulators' },
                          { key: 'antiCheatRequired', icon: 'security', label: 'Fairplay Scan', desc: 'Telemetry anti-cheat' },
                        ].map(({ key, icon, label, desc }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setNewTourney((p) => ({ ...p, [key]: !p[key] }))}
                            className={`p-5 rounded-2xl text-left transition-all duration-300 flex flex-col justify-between h-32 border shadow-sm relative overflow-hidden ${newTourney[key] ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
                          >
                            <div className="flex justify-between items-start w-full relative z-10">
                              <span className={`material-symbols-outlined text-xl ${newTourney[key] ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-white/30'}`}>{icon}</span>
                              <div className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 relative ${newTourney[key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20'}`}>
                                <div className="w-4 h-4 rounded-full bg-white shadow transition-all duration-300" style={{ transform: newTourney[key] ? 'translateX(16px)' : 'translateX(0)' }} />
                              </div>
                            </div>
                            <div className="relative z-10">
                              <span className="text-xs font-bold block text-slate-900 dark:text-white">{label}</span>
                              <p className="text-[10px] text-slate-500 dark:text-white/50 mt-1 leading-none">{desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>

                      <div>
                        <label className={labelClass}>Official Rules & Guidelines (Markdown)</label>
                        <AbuseFieldWrapper fieldId="tourney-rules" value={newTourney.rules} onWarning={setRulesAbuse}>
                          <textarea rows="8" value={newTourney.rules} onChange={(e) => setNewTourney({ ...newTourney, rules: e.target.value })} placeholder="Write your rulebook here..." className={`${inputClass} resize-y min-h-[150px] leading-relaxed`} />
                        </AbuseFieldWrapper>
                      </div>
                    </div>
                  )}

                  {/* STEP 6: Media & Branding */}
                  {createStep === 6 && (
                    <div className="space-y-6">
                      <div>
                        <label className={labelClass}>Select Preset Cover</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {PRESET_BANNERS.map((preset) => (
                            <button
                              key={preset.title}
                              type="button"
                              onClick={() => setNewTourney({ ...newTourney, bannerUrl: preset.url })}
                              className={`group rounded-xl overflow-hidden relative h-24 transition-all duration-300 active:scale-95 border-2 shadow-sm ${newTourney.bannerUrl === preset.url ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'border-transparent'}`}
                            >
                              <img src={preset.url} alt={preset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none" />
                              <div className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
                                <span className="text-[9px] font-extrabold tracking-wider uppercase text-white truncate w-full text-left">{preset.title}</span>
                              </div>
                              {newTourney.bannerUrl === preset.url && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-indigo-500 shadow-md">
                                  <span className="material-symbols-outlined text-[12px] text-white font-black">check</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {[
                          { label: 'Tournament Cover Banner', urlKey: 'bannerUrl', fit: 'object-cover', icon: 'image', progressKey: 'banner' },
                          { label: 'Organizer Logo', urlKey: 'logoUrl', fit: 'object-contain', icon: 'business_center', progressKey: 'logo' },
                        ].map(({ label, urlKey, fit, icon, progressKey }) => (
                          <div key={urlKey}>
                            <label className={labelClass}>{label}</label>
                            <div className="relative w-full h-40 rounded-2xl overflow-hidden flex items-center justify-center group bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 shadow-inner">
                              {newTourney[urlKey] ? (
                                <img src={newTourney[urlKey]} alt={label} className={`w-full h-full ${fit}`} />
                              ) : (
                                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-white/10">{icon}</span>
                              )}

                              {uploadProgress[progressKey] === null && (
                                <label className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300 opacity-0 group-hover:opacity-100 bg-black/60 backdrop-blur-sm">
                                  <span className="material-symbols-outlined text-white text-2xl animate-bounce">cloud_upload</span>
                                  <span className="text-[10px] text-white font-bold uppercase tracking-wider">Upload PNG / JPG</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => uploadImageWithProgress(e.target.files[0], progressKey)}
                                    className="hidden"
                                  />
                                </label>
                              )}

                              {uploadProgress[progressKey] !== null && (
                                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-white">
                                  <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin shrink-0"></div>
                                  <span className="text-[10px] font-bold uppercase tracking-widest">{uploadProgress[progressKey]}% Uploading</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 7: Timeline Dates */}
                  {createStep === 7 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div>
                          <label className={labelClass}>Registration Opens *</label>
                          <input type="datetime-local" required value={newTourney.registrationOpenDate} onChange={(e) => setNewTourney({ ...newTourney, registrationOpenDate: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Registration Closes *</label>
                          <input type="datetime-local" required value={newTourney.registrationCloseDate} onChange={(e) => setNewTourney({ ...newTourney, registrationCloseDate: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Lobby Kickoff Start *</label>
                          <input type="datetime-local" required value={newTourney.startDate} onChange={(e) => setNewTourney({ ...newTourney, startDate: e.target.value })} className={inputClass} />
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex items-start gap-4">
                        <span className="material-symbols-outlined text-indigo-500 text-2xl shrink-0 mt-0.5">info</span>
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Lobby System Coordinates</h5>
                          <p className="text-[10px] text-slate-500 dark:text-white/50 leading-relaxed">
                             Lobbies are auto-provisioned upon Kickoff. Rooms will launch exactly at the kickoff start date, and coordinate credential codes are shared securely with verified participants 15 minutes prior.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 8: Match Roadmap */}
                  {createStep === 8 && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/10 pb-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest block">Rounds List Structure</span>
                          <span className="text-[9px] text-indigo-500 font-semibold">{newTourney.roadmap ? newTourney.roadmap.length : 0} rounds total</span>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleAutoGenerateRoadmap} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-1.5 shadow-sm">
                            <span className="material-symbols-outlined text-[13px]">smart_toy</span> Auto-Fill
                          </button>
                          <button type="button" onClick={handleAddRound} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white border border-slate-200 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-white/20 transition-all flex items-center gap-1.5 shadow-sm">
                            <span className="material-symbols-outlined text-[13px]">add</span> Add Round
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {newTourney.roadmap && newTourney.roadmap.length > 0 ? (
                          newTourney.roadmap.map((round, idx) => (
                            <div key={round.id} className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 relative group shadow-sm transition-all hover:border-indigo-500/30">
                              <button type="button" onClick={() => handleDeleteRound(idx)} className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-sm z-10">
                                <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                              </button>
                              
                              <div className="flex flex-col lg:flex-row gap-4">
                                <div className="w-full lg:w-1/4">
                                  <label className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block">Round Name</label>
                                  <input type="text" value={round.name} onChange={(e) => handleUpdateRound(idx, 'name', e.target.value)} className={`${inputClass} py-2 text-xs`} placeholder="e.g. Semi-Finals" />
                                </div>
                                <div className="w-full lg:w-1/4">
                                  <label className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block">Map</label>
                                  <input type="text" value={round.map} onChange={(e) => handleUpdateRound(idx, 'map', e.target.value)} className={`${inputClass} py-2 text-xs`} placeholder="e.g. Erangel" />
                                </div>
                                <div className="w-full lg:w-1/4 flex gap-2">
                                  <div className="w-3/5">
                                    <label className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block">Date</label>
                                    <input type="date" value={round.date} onChange={(e) => handleUpdateRound(idx, 'date', e.target.value)} className={`${inputClass} py-2 text-xs`} />
                                  </div>
                                  <div className="w-2/5">
                                    <label className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block">Time</label>
                                    <input type="time" value={round.time} onChange={(e) => handleUpdateRound(idx, 'time', e.target.value)} className={`${inputClass} py-2 text-xs px-2`} />
                                  </div>
                                </div>
                                <div className="w-full lg:w-1/4">
                                  <label className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block">Qualification</label>
                                  <input type="text" value={round.qualify} onChange={(e) => handleUpdateRound(idx, 'qualify', e.target.value)} className={`${inputClass} py-2 text-xs`} placeholder="e.g. Top 8 advance" />
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-10 border border-dashed border-slate-300 dark:border-white/20 rounded-2xl bg-slate-50 dark:bg-white/5">
                            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-white/20 mb-2 block">route</span>
                            <p className="text-sm font-semibold text-slate-600 dark:text-white/60">No rounds created yet.</p>
                            <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase tracking-widest mt-1 mb-4">Add rounds manually or let the assistant build it.</p>
                            <button type="button" onClick={handleAddRound} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-md hover:bg-indigo-600 transition-colors">
                              ⚡ Setup Round 1
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* STEP 9: Preview & Publish */}
                  {createStep === 9 && (
                    <div className="space-y-6">
                      {isEditingExisting && !newTourney.isDraft && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-600 dark:text-amber-400 shadow-sm">
                          <span className="material-symbols-outlined text-base">warning</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider">Changes have not been published yet.</span>
                        </div>
                      )}

                      {/* Feed listing card mockup */}
                      <div className="max-w-md mx-auto group bg-white dark:bg-[#0D0E13] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-lg relative">
                        <div className="relative h-44 w-full overflow-hidden select-none">
                          <img src={newTourney.bannerUrl} alt={newTourney.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                          <span className="absolute top-3 left-3 text-[9px] font-bold text-white uppercase bg-black/40 backdrop-blur-md px-2.5 py-1 rounded border border-white/20 shadow-sm">
                            {newTourney.game}
                          </span>
                          <span className="absolute bottom-3 right-3 text-[9px] text-white font-bold bg-black/60 backdrop-blur-md px-2.5 py-1 rounded border border-white/20">
                            0 / {newTourney.slotsTotal} Slots
                          </span>
                        </div>

                        <div className="p-4 space-y-3.5">
                          <div>
                            <div className="flex items-center gap-2 text-[9px] text-slate-500 dark:text-white/50 font-bold uppercase">
                              <span className="w-5 h-5 rounded overflow-hidden bg-slate-100 dark:bg-white/5 p-0.5 border border-slate-200 dark:border-white/10">
                                <img src={newTourney.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                              </span>
                              <span>{newTourney.orgName}</span>
                            </div>
                            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1.5 truncate">{newTourney.title || 'Untitled Battle Arena'}</h4>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">Prize Pool: {newTourney.prize}</p>
                          </div>
                          <div className="flex justify-between items-center text-[10px] border-t border-slate-200 dark:border-white/10 pt-3 text-slate-500 dark:text-white/50">
                            <span>Entry Fee: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{newTourney.entry}</strong></span>
                            <span className="text-slate-900 dark:text-white font-extrabold flex items-center gap-0.5 group-hover:text-indigo-500 transition-colors">
                              Register Details <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest block border-b border-slate-200 dark:border-white/10 pb-2">Arena Configuration Coordinates</span>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] text-slate-400 dark:text-white/40">Format & Server</p>
                            <p className="font-bold text-slate-900 dark:text-white mt-0.5">{newTourney.format} &bull; {newTourney.region}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 dark:text-white/40">Compliance Check</p>
                            <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                              {newTourney.kycRequired ? 'KYC' : 'No KYC'} | {newTourney.emulatorBanned ? 'Mobile Only' : 'All Devices'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 dark:text-white/40">Lobby Dates</p>
                            <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              {newTourney.startDate ? new Date(newTourney.startDate).toLocaleDateString('en-IN') : 'TBD'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 dark:text-white/40">Rounds Roadmap</p>
                            <p className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{newTourney.roadmap ? newTourney.roadmap.length : 0} Matches</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      {/* FOOTER NAVIGATION */}
      <footer className="flex items-center justify-between px-4 sm:px-8 py-4 shrink-0 gap-3 border-t bg-white/80 dark:bg-[#07080C]/90 backdrop-blur-md sticky bottom-0 z-20 border-slate-200 dark:border-white/10">
        <button
          type="button" onClick={handlePrevStep} disabled={createStep === 1}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 text-slate-700 dark:text-white"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          <span className="hidden xs:inline">Previous</span>
          <span className="xs:hidden">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button" onClick={handleSaveDraft}
            className="px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white/80 active:scale-95"
          >
            Save Draft
          </button>

          {createStep < 9 ? (
            <button
              type="button" onClick={handleNextStep}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:bg-indigo-600"
            >
              <span>Next</span>
              <span className="material-symbols-outlined text-sm font-black">arrow_forward</span>
            </button>
          ) : (
            <button
              type="button" onClick={handlePublishTournament}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 bg-gradient-to-r from-indigo-500 to-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] animate-pulse hover:animate-none hover:shadow-[0_0_25px_rgba(99,102,241,0.7)]"
            >
              <span className="material-symbols-outlined text-sm font-black animate-spin-slow">rocket_launch</span>
              <span className="hidden xs:inline">Publish Arena Live</span>
              <span className="xs:hidden">Publish</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
