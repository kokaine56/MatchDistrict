import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { getAuthToken } from '../utils/getAuthToken'
import { uploadImage } from '../utils/cloudinaryUpload'
import AdminLayout from '../components/admin/AdminLayout.jsx'

export default function AdminProfile() {
  const navigate = useNavigate()
  const [currentUser] = useCurrentUser()
  const avatarInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    avatar: '',
    banner: '',
    gamerTag: '',
  })
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)

  const triggerToast = (msg) => {
    setToast(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await getAuthToken()
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success && data.user) {
          const u = data.user
          const profile = {
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            bio: u.bio || '',
            avatar: u.avatar || '',
            banner: u.banner || '',
            gamerTag: u.gamerTag || '',
          }
          setForm(profile)
          setOriginalForm(profile)
        }
      } catch {}
    }
    fetchProfile()
  }, [])

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleImageUpload = async (file, type) => {
    if (!file) return
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      triggerToast('Only JPEG, PNG, WebP allowed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Max 5MB allowed')
      return
    }
    setUploading(type)
    try {
      const url = await uploadImage(file)
      if (type === 'avatar') {
        setForm(prev => ({ ...prev, avatar: url }))
        setAvatarPreview(URL.createObjectURL(file))
      } else {
        setForm(prev => ({ ...prev, banner: url }))
        setBannerPreview(URL.createObjectURL(file))
      }
      triggerToast(`${type === 'avatar' ? 'Avatar' : 'Banner'} uploaded`)
    } catch (err) {
      triggerToast(`Upload failed: ${err.message}`)
    } finally {
      setUploading(null)
    }
  }

  const hasChanges = originalForm && JSON.stringify(form) !== JSON.stringify(originalForm)

  const handleSave = async () => {
    if (!form.name.trim()) {
      triggerToast('Name is required')
      return
    }
    setSaving(true)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          bio: form.bio.trim(),
          avatar: form.avatar,
          banner: form.banner,
          gamerTag: form.gamerTag.trim(),
        })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('Profile updated successfully')
        setOriginalForm({ ...form })
      } else {
        triggerToast(data.message || 'Failed to update profile')
      }
    } catch {
      triggerToast('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout
      activeTab="profile"
      onTabChange={(tab) => {
        navigate('/admin')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('admin-tab-change', { detail: tab }))
        }, 100)
      }}
      onNavigate={(page) => {
        if (page === 'home') navigate('/')
        else if (page === 'profile') navigate('/admin/profile')
        else if (page === 'create-tournament') navigate('/create-tournament')
      }}
    >
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-medium text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toast}
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-headline-lg text-lg sm:text-xl font-black text-on-background">Admin Profile</h1>
            <p className="font-body-sm text-[11px] text-on-surface-variant">Manage your administrator account</p>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 min-h-[44px] bg-primary text-white rounded-xl font-headline-md text-xs font-bold shadow-sm hover:bg-primary/95 transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-sm">save</span>
              )}
              Save Changes
            </button>
          )}
        </div>

        {/* Banner */}
        <div className="relative">
          <div
            className="w-full h-32 sm:h-44 rounded-2xl overflow-hidden bg-surface-variant/30 border border-outline-variant/20"
          >
            {(bannerPreview || form.banner) ? (
              <img
                src={bannerPreview || form.banner}
                alt="Banner"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-primary/20">panorama</span>
              </div>
            )}
          </div>
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={uploading === 'banner'}
            className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider hover:bg-black/70 transition-colors flex items-center gap-1"
          >
            {uploading === 'banner' ? (
              <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-xs">edit</span>
            )}
            Banner
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files[0], 'banner')}
          />
        </div>

        {/* Avatar */}
        <div className="relative -mt-14 sm:-mt-16 px-4">
          <div className="relative inline-block">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-background overflow-hidden bg-surface-variant/30">
              {(avatarPreview || form.avatar) ? (
                <img
                  src={avatarPreview || form.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/10">
                  <span className="material-symbols-outlined text-3xl text-primary/30">person</span>
                </div>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading === 'avatar'}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
            >
              {uploading === 'avatar' ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-sm">edit</span>
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files[0], 'avatar')}
            />
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder="Enter your name"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              readOnly
              className="w-full bg-surface-variant/30 border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface-variant cursor-not-allowed"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder="9876543210"
            />
          </div>

          {/* Gamer Tag */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Gamer Tag</label>
            <input
              type="text"
              value={form.gamerTag}
              onChange={(e) => updateField('gamerTag', e.target.value)}
              className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder="Your gaming handle"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => updateField('bio', e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all resize-none"
              placeholder="Tell us about yourself..."
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1 text-right">{form.bio.length}/300</p>
          </div>
        </div>

        {/* Quick Info */}
        <div className="p-4 rounded-xl bg-surface-variant/20 border border-outline-variant/15">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-sm text-primary">admin_panel_settings</span>
            <span className="text-xs font-bold text-on-background uppercase tracking-wider">Admin Account</span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            As an administrator, you have full access to all platform features including user management, payment verification, organizer approvals, and system settings.
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
