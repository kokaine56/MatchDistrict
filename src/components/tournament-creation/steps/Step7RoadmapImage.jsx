/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { uploadImage } from '../../../utils/cloudinaryUpload'

// Roadmap Preparation step (image flow): the organizer provides a pre-rendered
// roadmap image instead of authoring rounds inside the wizard. Rounds remain
// optional and can still be authored later from tournament management.
export const validateStep7 = (data) => {
  if (!data) return { roadmap_image: 'Form data is not available' }
  const errors = {}
  const roundsPublishing = data.rounds_published !== false
  const hasRounds = Array.isArray(data.roadmap) && data.roadmap.length > 0

  // With the image flow the roadmap is no longer required — the image or rounds
  // (authored later) drive the Tournament roadmap tab. Only hard-require a
  // publication source when the organizer explicitly chooses to publish now.
  if (roundsPublishing && !hasRounds && !data.roadmap_image_url) {
    errors.roadmap_image =
      'Upload a roadmap image, or switch "Publish Rounds" to Publish Later and add your roadmap from your tournament management page.'
  }

  return errors
}

export default function Step7RoadmapImage({ data, onChange, errors, showAllErrors }) {
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [uploadError, setUploadError] = useState('')
  const [isImgUploading, setIsImgUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setUploadError('Invalid Image Format')
      setUploadStatus('failed')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image Too Large')
      setUploadStatus('failed')
      return
    }

    setUploadStatus('uploading')
    setUploadError('')
    setIsImgUploading(true)
    try {
      const publicUrl = await uploadImage(file)
      if (publicUrl) {
        onChange({ ...data, roadmap_image_url: publicUrl })
        setUploadStatus('completed')
      } else {
        setUploadError('Upload failed, please try again')
        setUploadStatus('failed')
      }
    } catch (err) {
      setUploadError(err.message || 'Upload failed, please try again')
      setUploadStatus('failed')
    } finally {
      setIsImgUploading(false)
    }
  }, [data, onChange])

  const handleReplace = useCallback(() => {
    setUploadStatus('idle')
    setUploadError('')
    if (data.roadmap_image_url) {
      onChange({ ...data, roadmap_image_url: '' })
    }
    setTimeout(() => fileRef.current?.click(), 50)
  }, [data, onChange])

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const hasRounds = Array.isArray(data.roadmap) && data.roadmap.length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-2xl mx-auto space-y-8 pb-8"
    >
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Tournament execution</p>
        <h2 className="text-2xl font-bold text-on-background">Tournament Roadmap</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">Upload a ready-made roadmap graphic or publish the rounds you have configured. Rounds can always be added later from your tournament management page.</p>
      </header>

      {/* Section: Round Publication */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 space-y-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-background">Round Publication</h3>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">Control when players see your tournament rounds</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-1.5 p-1.5 rounded-xl bg-surface/60 border border-outline-variant/30">
          <button
            type="button"
            onClick={() => onChange({ ...data, rounds_published: true })}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              data.rounds_published !== false
                ? 'bg-primary text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                : 'text-on-surface-variant hover:text-on-background hover:bg-surface'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Publish Rounds
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...data, rounds_published: false })}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              data.rounds_published === false
                ? 'bg-primary text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                : 'text-on-surface-variant hover:text-on-background hover:bg-surface'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            Publish Later
          </button>
        </div>

        <div>
          <p className="text-xs leading-relaxed text-on-surface-variant/70">
            {data.rounds_published === false
              ? 'Players will see a "Rounds will be published soon." note instead of the roadmap. Publish anytime later from your tournament management page.'
              : 'Your roadmap (image or rounds) will be visible to players on the tournament page as soon as the tournament goes live.'}
          </p>
        </div>

        {showAllErrors && errors?.roadmap_image && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-error/10">
            <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p className="text-[11px] font-medium text-error">{errors.roadmap_image}</p>
          </div>
        )}

        {hasRounds && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {data.roadmap.length} round{data.roadmap.length > 1 ? 's' : ''} configured will be published alongside your roadmap image.
            </p>
          </div>
        )}
      </div>

      {/* Section: Roadmap Image */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-background">Roadmap Image</h3>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">Optional — a pre-designed guide of rounds, dates, and rules</p>
          </div>
        </div>

        {uploadStatus === 'completed' && data.roadmap_image_url ? (
          <div className="rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-surface-container/30 p-4">
            <div className="flex items-start gap-3">
              <div className="w-20 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-highest">
                <img src={data.roadmap_image_url} alt="Roadmap preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm font-medium text-emerald-500">Roadmap Image Uploaded</span>
                </div>
                <p className="text-xs text-on-surface-variant/70 mt-0.5">Players will see this roadmap on the tournament page.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={handleReplace}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant/30 text-on-surface-variant hover:bg-surface/50 transition-colors"
                  >Replace</button>
                  <button type="button" onClick={() => { onChange({ ...data, roadmap_image_url: '' }); setUploadStatus('idle'); setUploadError('') }}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant/30 text-error hover:bg-error/5 transition-colors"
                  >Remove</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { if (!isImgUploading && uploadStatus !== 'uploading') fileRef.current?.click() }}
            className={`relative w-full h-44 rounded-xl border-2 border-dashed border-slate-200 dark:border-outline-variant/30 bg-surface-container/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden group ${
              (isImgUploading || uploadStatus === 'uploading') ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            {(isImgUploading || uploadStatus === 'uploading') ? (
              <div className="flex flex-col items-center gap-3 px-6 w-full">
                <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-on-background font-medium">Uploading roadmap image...</span>
              </div>
            ) : uploadStatus === 'failed' ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm text-error font-medium">{uploadError || 'Upload failed'}</span>
                <button type="button" onClick={handleReplace}
                  className="text-xs text-primary hover:underline"
                >Try again</button>
              </div>
            ) : (
              <>
                <svg className="w-10 h-10 text-on-surface-variant/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-on-surface-variant">Click to upload roadmap image</span>
                <span className="text-xs text-on-surface-variant/60 mt-1">JPG, PNG, WEBP • Max 8MB</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              className="hidden"
              disabled={isImgUploading || uploadStatus === 'uploading'}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}