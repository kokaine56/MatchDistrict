import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerificationBadge from '../components/VerificationBadge.jsx'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useUser } from '../UserContext.jsx'
import { getAuthToken } from '../utils/getAuthToken.js'
import { uploadImage } from '../utils/imagekitUpload'
import { sanitizeImageUrl } from '../utils/userStorage.js'
import { formatDate } from '../utils/timeFormat'
import { DEFAULT_AVATAR, DEFAULT_BANNER } from '../utils/defaults.js'

export default function OrgPage({ onNavigate }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [currentUser] = useCurrentUser()
  const { setCurrentUser: setCurrentUserFromContext } = useUser()
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profileImageVersion, setProfileImageVersion] = useState(Date.now())

  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)
  }

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({ orgName: '', orgHandle: '', bio: '', email: '', orgImage: '', banner: '', avatar: '' })

  const [cropState, setCropState] = useState(null)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropZoomPercent, setCropZoomPercent] = useState(100)
  const cropImgRef = useRef(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetAtDragStart = useRef({ x: 0, y: 0 })
  const [activeUploadField, setActiveUploadField] = useState(null)
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileUploadProgress, setProfileUploadProgress] = useState(null)
  const [imgError, setImgError] = useState({ avatar: false, banner: false, modalBanner: false, modalLogo: false })
  const [imgLoaded, setImgLoaded] = useState({ avatar: false, banner: false })

  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const quickButtonRef = useRef(null)
  const [openUp, setOpenUp] = useState(false)
  const [desktopDropdownPos, setDesktopDropdownPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    setImgError({ avatar: false, banner: false, modalBanner: false, modalLogo: false })
    setImgLoaded({ avatar: false, banner: false })
  }, [editForm.avatar, editForm.orgImage, editForm.banner, org.avatar, org.orgImage, org.banner])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setQuickActionsOpen(false) }
    if (quickActionsOpen) { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey) }
  }, [quickActionsOpen])

  useEffect(() => {
    if (!quickActionsOpen || typeof window === 'undefined') return
    const updatePos = () => {
      if (!quickButtonRef.current) return
      const btnRect = quickButtonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - btnRect.bottom
      const up = spaceBelow < 280 && btnRect.top > spaceBelow
      const dropdownH = 176
      setDesktopDropdownPos({
        top: up ? btnRect.top - dropdownH - 6 : btnRect.bottom + 6,
        left: Math.max(8, Math.min(btnRect.left, window.innerWidth - 260)),
      })
      setOpenUp(up)
    }
    updatePos()
    window.addEventListener('scroll', updatePos, { passive: true, capture: true })
    window.addEventListener('resize', updatePos, { passive: true })
    return () => {
      window.removeEventListener('scroll', updatePos, { capture: true })
      window.removeEventListener('resize', updatePos)
    }
  }, [quickActionsOpen])

  const isOwner = currentUser && org && (currentUser.id === org.id || currentUser.uid === org.id)

  const fetchOrg = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/org/by-slug/${slug}`)
      const data = await res.json()
      if (data.success && data.org) {
        setOrg(data.org)
      } else {
        setError(data.message || 'Organization not found')
      }
    } catch {
      setError('Failed to load organization')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrg()
  }, [slug, profileImageVersion])

  useEffect(() => {
    if (cropState) {
      let startingZoomPercent = 100
      if (cropState.shape === 'rectangle') {
        const fillZoomX = 360 / cropState.width
        const fillZoomY = 120 / cropState.height
        startingZoomPercent = Math.round(Math.max(fillZoomX, fillZoomY) * 100)
      } else {
        const minDimension = Math.min(cropState.width, cropState.height)
        startingZoomPercent = Math.round((280 / minDimension) * 100)
      }
      setCropZoomPercent(Math.max(10, Math.min(200, startingZoomPercent)))
      setCropOffset({ x: 0, y: 0 })
    }
  }, [cropState])

  const applyUploadedProfileImage = (field, url) => {
    if (field === 'avatar') {
      setEditForm(prev => ({ ...prev, avatar: url }))
    } else if (field === 'banner') {
      setEditForm(prev => ({ ...prev, banner: url }))
    } else if (field === 'orgImage') {
      setEditForm(prev => ({ ...prev, orgImage: url }))
    } else if (field === 'orgBanner') {
      setEditForm(prev => ({ ...prev, banner: url }))
    }
  }

  const persistUploadedProfileImage = async (field, url) => {
    if (!currentUser || !url) return
    const token = await getAuthToken()
    let res
    if (field === 'avatar') {
      res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ avatar: url })
      })
    } else {
      // orgImage or orgBanner → dedicated org endpoint
      const payload = field === 'orgBanner' ? { orgBanner: url, orgImage: null } : { orgImage: url, orgBanner: null }
      res = await fetch('/api/organization/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
    }
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || 'Image uploaded, but profile update failed.')
    }
    setCurrentUserFromContext(data.user)
    setProfileImageVersion(Date.now())
  }

  const handleImageUpload = async (file) => {
    if (!file) return null
    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.')
      return null
    }
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image file must be under 5MB.')
      return null
    }
    setIsUploadingImage(true)
    setProfileUploadProgress(40)
    triggerToast('Uploading image... Please wait.')
    try {
      const url = await uploadImage(file)
      if (!url || !sanitizeImageUrl(url)) {
        triggerToast('Upload returned an invalid image URL.')
        return null
      }
      setProfileUploadProgress(100)
      return url
    } catch (err) {
      triggerToast(err.message || 'Image upload failed.')
      return null
    }
  }

  const setUploadPreview = (field, previewUrl) => {
    setUploadPreviewUrls(prev => {
      if (prev[field]?.startsWith('blob:')) {
        URL.revokeObjectURL(prev[field])
      }
      return { ...prev, [field]: previewUrl }
    })
  }
  const clearUploadPreview = (field) => {
    setUploadPreviewUrls(prev => {
      if (prev[field]?.startsWith('blob:')) {
        URL.revokeObjectURL(prev[field])
      }
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const performUpload = async (file, field) => {
    setActiveUploadField(field)
    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(field, previewUrl)
    const url = await handleImageUpload(file)
    if (url) {
      applyUploadedProfileImage(field, url)
      try {
        await persistUploadedProfileImage(field, url)
        triggerToast('Image updated successfully!')
      } catch (err) {
        triggerToast(err.message || 'Image uploaded, but profile update failed.')
      }
      clearUploadPreview(field)
    } else {
      clearUploadPreview(field)
    }
    setIsUploadingImage(false)
    setProfileUploadProgress(null)
    setActiveUploadField(null)
  }

  const handleProfileImageSelect = (file, field) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      triggerToast('Please select a valid image file.')
      return
    }
    const shape = (field === 'banner' || field === 'orgBanner') ? 'rectangle' : 'circle'
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        if (img.width > 400 || img.height > 400) {
          setCropState({ file, src: event.target.result, width: img.width, height: img.height, field, shape })
        } else {
          performUpload(file, field)
        }
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleCropMouseDown = (e) => {
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetAtDragStart.current = { ...cropOffset }
    document.addEventListener('mousemove', handleCropMouseMove)
    document.addEventListener('mouseup', handleCropMouseUp)
  }
  const handleCropMouseMove = (e) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setCropOffset({ x: offsetAtDragStart.current.x + dx, y: offsetAtDragStart.current.y + dy })
  }
  const handleCropMouseUp = () => {
    isDragging.current = false
    document.removeEventListener('mousemove', handleCropMouseMove)
    document.removeEventListener('mouseup', handleCropMouseUp)
  }
  const handleCropTouchStart = (e) => {
    if (e.touches.length !== 1) return
    isDragging.current = true
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    offsetAtDragStart.current = { ...cropOffset }
    document.addEventListener('touchmove', handleCropTouchMove)
    document.addEventListener('touchend', handleCropTouchEnd)
  }
  const handleCropTouchMove = (e) => {
    if (!isDragging.current || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - dragStart.current.x
    const dy = e.touches[0].clientY - dragStart.current.y
    setCropOffset({ x: offsetAtDragStart.current.x + dx, y: offsetAtDragStart.current.y + dy })
  }
  const handleCropTouchEnd = () => {
    isDragging.current = false
    document.removeEventListener('touchmove', handleCropTouchMove)
    document.removeEventListener('touchend', handleCropTouchEnd)
  }

  const handleCropConfirm = async () => {
    if (!cropState) return
    const img = cropImgRef.current
    if (!img) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const effZoom = cropZoomPercent / 100
    if (cropState.shape === 'rectangle') {
      const containerW = 360, containerH = 120
      const imgLeft = containerW / 2 + cropOffset.x - (cropState.width * effZoom) / 2
      const imgTop = containerH / 2 + cropOffset.y - (cropState.height * effZoom) / 2
      const srcX = Math.max(0, (0 - imgLeft) / effZoom)
      const srcY = Math.max(0, (0 - imgTop) / effZoom)
      const srcW = Math.min(cropState.width - srcX, containerW / effZoom)
      const srcH = Math.min(cropState.height - srcY, containerH / effZoom)
      canvas.width = 1200
      canvas.height = 400
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1200, 400)
    } else {
      canvas.width = 400
      canvas.height = 400
      const imgLeft = 140 + cropOffset.x - (cropState.width * effZoom) / 2
      const imgTop = 140 + cropOffset.y - (cropState.height * effZoom) / 2
      const cropX_img = (40 - imgLeft) / effZoom
      const cropY_img = (40 - imgTop) / effZoom
      const cropW_img = 200 / effZoom
      const cropH_img = 200 / effZoom
      ctx.drawImage(img, cropX_img, cropY_img, cropW_img, cropH_img, 0, 0, 400, 400)
    }
    canvas.toBlob(async (blob) => {
      if (!blob) {
        triggerToast('Failed to generate cropped image.')
        setCropState(null)
        return
      }
      const croppedFile = new File([blob], cropState.file.name, { type: cropState.file.type || 'image/jpeg' })
      setCropState(null)
      await performUpload(croppedFile, cropState.field)
    }, cropState.file.type || 'image/jpeg')
  }

  const openEditModal = () => {
    setEditForm({
      orgName: org?.orgName || org?.name || '',
      orgHandle: org?.orgHandle || '',
      bio: org?.orgBio || org?.bio || '',
      email: org?.email || '',
      orgImage: org?.orgImage || '',
      banner: org?.orgBanner || org?.banner || '',
      avatar: org?.avatar || '',
    })
    setEditModalOpen(true)
  }

  const handleSaveOrgProfile = async (e) => {
    e.preventDefault()
    if (!currentUser || isSaving) return
    setIsSaving(true)
    const token = await getAuthToken()
    const payload = {
      orgName: editForm.orgName,
      orgHandle: editForm.orgHandle,
      orgMotto: null,
      orgBio: editForm.bio,
      orgImage: editForm.orgImage || null,
      orgBanner: editForm.banner || null,
    }
    try {
      const res = await fetch('/api/organization/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        setCurrentUserFromContext(data.user)
        setEditModalOpen(false)
        setProfileImageVersion(Date.now())
        triggerToast('Organization profile updated successfully!')
      } else {
        triggerToast(data.error || data.message || 'Failed to update organization profile.')
      }
    } catch (err) {
      triggerToast('Error saving organization profile.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleQuickActions = useCallback(() => {
    if (quickActionsOpen) { setQuickActionsOpen(false); return }
    if (quickButtonRef.current) {
      const btnRect = quickButtonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - btnRect.bottom
      const up = spaceBelow < 280 && btnRect.top > spaceBelow
      setOpenUp(up)
      if (window.innerWidth >= 640) {
        const dropdownH = 176
        setDesktopDropdownPos({
          top: up ? btnRect.top - dropdownH - 6 : btnRect.bottom + 6,
          left: Math.max(8, Math.min(btnRect.left, window.innerWidth - 260)),
        })
      }
    }
    setQuickActionsOpen(true)
  }, [quickActionsOpen])

  const handleOpenCreateNew = () => {
    navigate('/create-tournament')
  }

  const renderMenuItems = () => (
    <div className="p-2">
      <button onClick={(e) => { e.stopPropagation(); handleOpenCreateNew(); setQuickActionsOpen(false) }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 dark:text-on-background hover:bg-[#F0F3FF] dark:hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">add_circle</span> Create Tournament
      </button>
      <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(window.location.origin + '/org/' + (org?.orgHandle?.replace(/^@/, '') || '')); triggerToast('Hub link copied successfully'); setQuickActionsOpen(false) }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 dark:text-on-background hover:bg-[#F0F3FF] dark:hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">link</span> Copy Hub Link
      </button>
      <div className="h-px bg-gray-100 dark:bg-outline-variant/30 mx-4 my-1" />
      <button onClick={(e) => { e.stopPropagation(); navigate('/subscription/payment'); setQuickActionsOpen(false) }}
        className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg text-sm font-medium text-gray-900 dark:text-on-background hover:bg-[#F0F3FF] dark:hover:bg-surface-variant transition-colors duration-150 whitespace-nowrap">
        <span className="material-symbols-outlined text-base text-gray-500 shrink-0">workspace_premium</span> Subscription
      </button>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto animate-pulse">
            <span className="material-symbols-outlined text-primary text-xl">stadia_controller</span>
          </div>
          <p className="text-sm text-on-surface-variant">Loading organization...</p>
        </div>
      </div>
    )
  }

  if (error || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto p-6">
          <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-error text-3xl">search_off</span>
          </div>
          <h2 className="text-lg font-bold text-on-background">Organization Not Found</h2>
          <p className="text-sm text-on-surface-variant">{error || 'This custom link does not exist or has been removed.'}</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl">Go Home</button>
        </div>
      </div>
    )
  }

  const displayBanner = editForm.banner || org.banner || DEFAULT_BANNER
  const displayAvatar = editForm.avatar || editForm.orgImage || org.avatar || org.orgImage || DEFAULT_AVATAR

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b border-outline-variant/20 bg-surface-container-low/40 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-background transition-colors">
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-xs font-semibold">Match District</span>
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/tournaments')} className="text-xs text-on-surface-variant hover:text-primary transition-colors">Tournaments</button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-[24px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm overflow-hidden">

            {/* Banner with edit overlay */}
            <div className="relative aspect-[3/1] bg-surface-container-highest/40">
                    {displayBanner ? (
                <>
                  {!imgLoaded.banner && !imgError.banner && (
                    <div className="absolute inset-0 bg-surface-container-highest/60 animate-pulse" />
                  )}
                  {!imgError.banner ? (
                    <img
                      src={`${displayBanner}${displayBanner.includes('?') ? '&' : '?'}v=${profileImageVersion}`}
                      alt=""
                      className="w-full h-full object-cover"
                      onLoad={() => setImgLoaded(prev => ({ ...prev, banner: true }))}
                      onError={() => setImgError(prev => ({ ...prev, banner: true }))}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <img src={DEFAULT_BANNER} alt="" className="w-full h-full object-cover" />
                  )}
                </>
              ) : (
                <img src={DEFAULT_BANNER} alt="" className="w-full h-full object-cover" />
              )}
              {isOwner && (
                <div className="absolute inset-0 bg-black/0 hover:bg-black/30 flex items-center justify-center transition-all group">
                  <label className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-black/70 transition-colors">
                      <span className="material-symbols-outlined text-white text-xl">photo_camera</span>
                    </div>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleProfileImageSelect(file, 'banner') }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Avatar + Info row */}
            <div className="px-6 pb-6">
              <div className="flex items-start gap-5 -mt-12 relative z-10">
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-full border-4 border-surface/80 bg-surface-container-highest overflow-hidden">
                    {displayAvatar ? (
                      <>
                        {!imgLoaded.avatar && !imgError.avatar && (
                          <div className="absolute inset-0 bg-surface-container-highest/60 animate-pulse" />
                        )}
                        {!imgError.avatar ? (
                          <img
                            src={`${displayAvatar}${displayAvatar.includes('?') ? '&' : '?'}v=${profileImageVersion}`}
                            alt=""
                            className="avatar-img"
                            onLoad={() => setImgLoaded(prev => ({ ...prev, avatar: true }))}
                            onError={() => setImgError(prev => ({ ...prev, avatar: true }))}
                          />
                        ) : (
                          <img src={DEFAULT_AVATAR} alt="" className="avatar-img" />
                        )}
                      </>
                    ) : (
                      <img src={DEFAULT_AVATAR} alt="" className="avatar-img" />
                    )}
                  </div>
                  {isOwner && (
                    <label className="absolute -bottom-1 -right-1 cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-surface/80 hover:bg-primary/90 transition-colors shadow-md">
                        <span className="material-symbols-outlined text-on-primary text-sm">edit</span>
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleProfileImageSelect(file, 'avatar') }}
                      />
                    </label>
                  )}
                </div>

                <div className="pt-12 space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-extrabold text-on-background truncate">{org.orgName || org.name}</h1>
                    <VerificationBadge size="md" tier={org.tier} />
                  </div>
                  {org.orgHandle && (
                    <p className="text-xs text-on-surface-variant/60 font-mono">@{org.orgHandle}</p>
                  )}
                  {org.bio && <p className="text-sm text-on-surface-variant leading-relaxed">{org.bio}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {org.tier === 'Pro' && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase">Verified Pro</span>
                    )}
                    {org.tier === 'Basic' && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-highest/50 text-on-surface-variant uppercase">Basic</span>
                    )}
                    {(!org.tier || org.tier === 'Free') && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-highest/50 text-on-surface-variant uppercase">Free</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Button Grid — owner only */}
            {isOwner && (
              <div className="border-t border-outline-variant/20"></div>
            )}
            {isOwner && (
              <div className="px-6 pb-6 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => navigate('/profile')}
                    className="min-h-[48px] rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm">
                    <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">person</span> Return to Profile
                  </button>
                  <button onClick={openEditModal}
                    className="min-h-[48px] rounded-[12px] border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#F8FAFC] dark:hover:bg-white/10 text-[#2563EB] dark:text-white text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm">
                    <span className="material-symbols-outlined text-sm text-[#2563EB] dark:text-white">edit</span> Edit Organization
                  </button>
                </div>
                <button
                  ref={quickButtonRef}
                  onClick={handleToggleQuickActions}
                  className="min-h-[48px] w-full rounded-[12px] bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg">
                  <span className="material-symbols-outlined text-sm">bolt</span> Quick Actions
                  <span className="material-symbols-outlined text-sm ml-0.5">expand_more</span>
                </button>
                {/* Mobile inline dropdown */}
                <AnimatePresence>
                  {quickActionsOpen && (
                    <motion.div
                      key="mobile-dropdown"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="rounded-[14px] border border-black/10 dark:border-outline-variant/40 bg-white dark:bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden"
                    >
                      {renderMenuItems()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>

          {org.recent_tournaments?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="glass-card p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
              <h2 className="text-sm font-bold text-on-background mb-4">Recent Tournaments</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {org.recent_tournaments.map(t => (
                  <button key={t.id} onClick={() => navigate(`/tournaments/${t.id}`)}
                    className="text-left bg-surface-container-highest/20 hover:bg-surface-container-highest/40 border border-outline-variant/20 rounded-xl p-3 transition-all">
                    <p className="text-xs font-semibold text-on-surface truncate">{t.title}</p>
                    <p className="text-[10px] text-on-surface-variant mt-1">{t.game} · {formatDate(t.startDate)}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* Quick Actions backdrop — fixed overlay */}
      {typeof window !== 'undefined' && window.innerWidth >= 640 && quickActionsOpen && (
        <div className="fixed inset-0 z-[99998]" onClick={() => setQuickActionsOpen(false)} />
      )}

      {/* Desktop portal dropdown */}
      {typeof window !== 'undefined' && window.innerWidth >= 640 && quickActionsOpen && createPortal(
        <AnimatePresence>
          <motion.div
            key="desktop-portal-dropdown"
            initial={{ opacity: 0, y: openUp ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 4 : -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: desktopDropdownPos.top,
              left: desktopDropdownPos.left,
              width: 240,
            }}
            className="z-[99999] bg-white dark:bg-surface rounded-[14px] border border-black/10 dark:border-outline-variant/40 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden"
          >
            {renderMenuItems()}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Edit Org Profile Modal */}
      <AnimatePresence>
        {editModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="glass-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h3 className="font-bold text-lg text-on-background flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">edit</span> Edit Organization Profile
                </h3>
                <button onClick={() => setEditModalOpen(false)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveOrgProfile} className="space-y-4">
                {/* Banner Preview */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">Banner Background</label>
                  <div className="relative aspect-[3/1] bg-surface-container-highest/40 rounded-xl overflow-hidden border border-outline-variant/30">
                    {(uploadPreviewUrls.orgBanner || editForm.banner) && !imgError.modalBanner ? (
                      <img src={uploadPreviewUrls.orgBanner || editForm.banner} alt="" className="w-full h-full object-cover"
                        onError={() => setImgError(prev => ({ ...prev, modalBanner: true }))}
                      />
                    ) : (
                      <img src={DEFAULT_BANNER} alt="" className="w-full h-full object-cover" />
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 cursor-pointer transition-all">
                      <div className="opacity-0 hover:opacity-100 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <span className="material-symbols-outlined text-white text-base">photo_camera</span>
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleProfileImageSelect(file, 'orgBanner') }}
                      />
                    </label>
                  </div>
                </div>

                {/* Avatar Preview */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">Organization Logo / Avatar</label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-full bg-surface-container-higher border border-outline-variant/40 overflow-hidden shrink-0">
                      {(uploadPreviewUrls.avatar || uploadPreviewUrls.orgImage || editForm.avatar || editForm.orgImage) && !imgError.modalLogo ? (
                        <img src={uploadPreviewUrls.avatar || uploadPreviewUrls.orgImage || editForm.avatar || editForm.orgImage} alt="" className="avatar-img"
                          onError={() => setImgError(prev => ({ ...prev, modalLogo: true }))}
                        />
                      ) : (
                        <img src={DEFAULT_AVATAR} alt="" className="avatar-img" />
                      )}
                    </div>
                    <label className="cursor-pointer px-3 py-2 border border-outline-variant/40 hover:bg-surface-variant text-on-background text-xs font-semibold rounded-xl transition-all">
                      Change Logo
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleProfileImageSelect(file, 'orgImage') }}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-on-surface-variant">Organization Name</label>
                    <input type="text" value={editForm.orgName}
                      onChange={(e) => setEditForm(prev => ({ ...prev, orgName: e.target.value }))}
                      className="w-full min-h-[44px] px-3.5 bg-surface-container-highest/60 border border-outline-variant/40 rounded-xl text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors"
                      placeholder="Organization name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-on-surface-variant">Handle</label>
                    <input type="text" value={editForm.orgHandle}
                      onChange={(e) => setEditForm(prev => ({ ...prev, orgHandle: e.target.value }))}
                      className="w-full min-h-[44px] px-3.5 bg-surface-container-highest/60 border border-outline-variant/40 rounded-xl text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors"
                      placeholder="@handle"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">Email (public)</label>
                  <input type="email" value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 bg-surface-container-highest/60 border border-outline-variant/40 rounded-xl text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors"
                    placeholder="contact@org.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">Bio</label>
                  <textarea value={editForm.bio} rows={3}
                    onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-surface-container-highest/60 border border-outline-variant/40 rounded-xl text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors resize-none"
                    placeholder="Tell players about your organization..."
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
                  <button type="button" onClick={() => setEditModalOpen(false)}
                    className="px-5 py-2 border border-outline hover:bg-surface-variant transition-all text-on-background rounded-xl text-xs font-semibold">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSaving || isUploadingImage}
                    className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-on-primary rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5">
                    {(isSaving || isUploadingImage) ? (
                      <><span className="w-3.5 h-3.5 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin"></span> Saving...</>
                    ) : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crop Modal */}
      <AnimatePresence>
        {cropState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="glass-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h3 className="font-bold text-lg text-on-background flex items-center gap-2 tracking-tight">
                  <span className="material-symbols-outlined text-primary text-xl">crop</span> Crop {cropState.shape === 'rectangle' ? 'Banner' : 'Logo'}
                </h3>
                <button onClick={() => setCropState(null)} className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div
                  className={`relative w-full ${cropState.shape === 'rectangle' ? 'max-w-[360px] aspect-[3/1]' : 'max-w-[280px] aspect-square'} bg-black border border-outline-variant rounded-xl overflow-hidden cursor-move select-none`}
                  onMouseDown={handleCropMouseDown}
                  onTouchStart={handleCropTouchStart}
                >
                  <img
                    src={cropState.src}
                    alt="To Crop"
                    className="absolute pointer-events-none origin-center"
                    style={{
                      transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoomPercent / 100})`,
                      left: '50%',
                      top: '50%',
                      marginLeft: `-${cropState.width / 2}px`,
                      marginTop: `-${cropState.height / 2}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }}
                    ref={cropImgRef}
                  />
                  {cropState.shape === 'rectangle' ? (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                      <div className="w-full h-full border-2 border-dashed border-primary/70"></div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none flex items-center justify-center">
                      <div className="w-[200px] h-[200px] rounded-full border border-dashed border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
                    </div>
                  )}
                </div>

                <div className="w-full space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>Zoom</span>
                    <span>{cropZoomPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="1"
                    value={cropZoomPercent}
                    onChange={(e) => setCropZoomPercent(Number(e.target.value))}
                    className="w-full accent-primary bg-surface-container h-1 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
                <button onClick={() => setCropState(null)}
                  className="px-5 py-2 border border-outline hover:bg-surface-variant transition-all text-on-background rounded-lg text-xs font-semibold">
                  Cancel
                </button>
                <button onClick={handleCropConfirm}
                  className="px-5 py-2 bg-primary hover:bg-primary/90 transition-all text-on-primary rounded-lg text-xs font-bold shadow-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check</span> Apply & Upload
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 bg-surface-container-highest border border-outline-variant/40 rounded-xl shadow-xl">
            <p className="text-sm text-on-background font-medium">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
