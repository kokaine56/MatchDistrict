import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import TournamentCard from '../../../components/TournamentCard'
import CropModal from '../CropModal'
import { uploadImage } from '../../../utils/cloudinaryUpload'

import { getThemesByTier, isThemeUnlocked } from '../../../utils/themeEngine'

export default function Step5Media({ data, onChange, orgName, orgTier, userTier }) {
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [showCrop, setShowCrop] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const [isImgUploading, setIsImgUploading] = useState(false)
  const fileRef = useRef(null)
  const pendingUpload = useRef(null)

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setUploadError('Invalid Image Format')
      setUploadStatus('failed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image Too Large')
      setUploadStatus('failed')
      return
    }

    setUploadFile(file)
    setUploadStatus('validating')
    setUploadError('')

    const img = new Image()
    const tempUrl = URL.createObjectURL(file)
    let loadOk = false
    img.onload = () => { loadOk = true }
    img.src = tempUrl
    await new Promise((res) => { img.onload = () => { loadOk = true; res() }; img.onerror = res })

    if (!loadOk || !img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(tempUrl)
      setUploadError('Could not read this image. Try a different file or convert it to JPEG/PNG.')
      setUploadStatus('failed')
      return
    }

    const { naturalWidth: w, naturalHeight: h } = img
    const imgRatio = w / h
    const TARGET_RATIO = 3 / 4
    const TOLERANCE = 0.02

    if (Math.abs(imgRatio - TARGET_RATIO) <= TOLERANCE) {
      URL.revokeObjectURL(tempUrl)
      setIsImgUploading(true)
      try {
        const publicUrl = await uploadImage(file)
        if (publicUrl) {
          onChange({ ...data, cover_image_url: publicUrl })
          setUploadStatus('completed')
        }
      } catch (err) {
        setUploadError(err.message || 'Upload failed, please try again')
        setUploadStatus('failed')
      } finally {
        setIsImgUploading(false)
      }
      return
    }

    setCropSrc(tempUrl)
    pendingUpload.current = file
    setShowCrop(true)
  }, [data, onChange])

  const handleCropDone = useCallback(async (blob) => {
    setShowCrop(false)
    setCropSrc('')
    URL.revokeObjectURL(cropSrc)
    const croppedFile = new File([blob], pendingUpload.current?.name || 'cover.jpg', { type: 'image/jpeg' })
    pendingUpload.current = null

    setIsImgUploading(true)
    try {
      const publicUrl = await uploadImage(croppedFile)
      if (publicUrl) {
        onChange({ ...data, cover_image_url: publicUrl })
        setUploadStatus('completed')
      }
    } catch (err) {
      setUploadError(err.message || 'Upload failed, please try again')
      setUploadStatus('failed')
    } finally {
      setIsImgUploading(false)
    }
  }, [data, onChange, cropSrc])

  const handleCropCancel = useCallback(() => {
    setShowCrop(false)
    setCropSrc('')
    URL.revokeObjectURL(cropSrc)
    setUploadStatus('idle')
    setUploadFile(null)
    pendingUpload.current = null
  }, [cropSrc])

  const handleReplace = () => {
    setUploadFile(null)
    setUploadStatus('idle')
    setUploadError('')
    if (data.cover_image_url) {
      onChange({ ...data, cover_image_url: '' })
    }
    setTimeout(() => fileRef.current?.click(), 50)
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0
  const totalPrizePool = entryFee * totalSlots
  const matchLabel = data.match_type === 'solo' ? 'Solo' : data.match_type === 'duo' ? 'Duo' : 'Squad'
  const perspLabel = data.perspective === 'tpp' ? 'TPP' : 'FPP'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {showCrop && cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onCrop={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}

      <div>
        <h2 className="text-xl font-bold text-on-background">Tournament Media</h2>
        <p className="text-sm text-on-surface-variant mt-1">Upload a cover image and preview how your tournament card looks.</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">Cover Image</label>

        {uploadStatus === 'completed' && data.cover_image_url ? (
          <div className="rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-surface-container/30 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-highest">
                <img src={data.cover_image_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm font-medium text-emerald-500">Cover Image Uploaded</span>
                </div>
                {uploadFile && (
                  <p className="text-xs text-on-surface-variant/70 mt-0.5 truncate">
                    {uploadFile.name} ({formatSize(uploadFile.size)})
                  </p>
                )}
                <div className="mt-2">
                  <button type="button" onClick={handleReplace}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant/30 text-on-surface-variant hover:bg-surface/50 transition-colors"
                  >Replace Image</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { if (!isImgUploading && uploadStatus !== 'validating') fileRef.current?.click() }}
            className={`relative w-full h-44 rounded-xl border-2 border-dashed border-slate-200 dark:border-outline-variant/30 bg-surface-container/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden group ${
              (isImgUploading || uploadStatus === 'validating') ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            {(isImgUploading || uploadStatus === 'validating') ? (
              <div className="flex flex-col items-center gap-3 px-6 w-full">
                <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-on-background font-medium">
                  {isImgUploading ? 'Uploading image...' : 'Processing Image...'}
                </span>
                {uploadFile && (
                  <span className="text-xs text-on-surface-variant/70">
                    {uploadFile.name} ({formatSize(uploadFile.size)})
                  </span>
                )}
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
                <span className="text-sm text-on-surface-variant">Click to upload cover image</span>
                <span className="text-xs text-on-surface-variant/60 mt-1">JPG, PNG, WEBP • 3:4 ratio recommended • Max 5MB</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              className="hidden"
              disabled={isImgUploading || uploadStatus === 'validating'}
            />
          </div>
        )}
      </div>

      {/* ── Collectible Card Theme Selection ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-on-background flex items-center gap-2">
            <span>Collectible Card Theme</span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Living Artwork
            </span>
          </h3>
          <p className="text-[10px] text-on-surface-variant mt-0.5">Select a handcrafted theme for your tournament card & hero banner. Upgrading unlocks living legendary game artwork.</p>
        </div>

        {/* Tier Sections */}
        {Object.entries(getThemesByTier()).map(([tierName, themes]) => (
          <div key={tierName} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/80">
                {tierName === 'free' ? 'Free Plan Theme' : 'Pro Theme'}
              </span>
              {tierName !== 'free' && (
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  PRO
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {themes.map((theme) => {
                const isSelected = (data.card_color || 'white') === theme.id
                const isUnlocked = isThemeUnlocked(theme.id, userTier)

                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onChange({ ...data, card_color: theme.id })}
                    className={`group relative flex items-center gap-2.5 p-2 rounded-xl border-2 transition-all duration-300 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                        : 'border-outline-variant/20 bg-surface-container/30 hover:border-outline-variant/50'
                    }`}
                  >
                    {/* Swatch Circle */}
                    <div 
                      className="w-8 h-8 rounded-lg shrink-0 border relative overflow-hidden transition-transform duration-300 group-hover:scale-105"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.borderHex }}
                    >
                      <div 
                        className="absolute inset-0 opacity-40"
                        style={{ background: `radial-gradient(circle at 30% 30%, ${theme.accentColor}, transparent 70%)` }}
                      />
                      {!isUnlocked && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                          <span className="material-symbols-outlined text-xs text-amber-300">lock</span>
                        </div>
                      )}
                    </div>

                    {/* Label & Tagline */}
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-xs font-bold text-on-background truncate group-hover:text-amber-400 transition-colors">
                        {theme.name}
                      </span>
                      <span className="text-[8px] text-on-surface-variant/70 truncate">
                        {isUnlocked ? theme.tagline : 'Unlock with subscription'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-on-background">Card Preview</h3>
        <p className="text-[10px] text-on-surface-variant">This is how your tournament will appear on the homepage &amp; discover page.</p>
        <div className="flex justify-center overflow-hidden sm:overflow-visible">
          <div className="origin-center scale-[0.78] sm:scale-100 -my-6 sm:my-0">
          {isImgUploading ? (
            <div className="w-[300px] h-[400px] rounded-2xl bg-surface-container-high flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-on-surface-variant">Uploading image...</span>
              </div>
            </div>
          ) : (
            <TournamentCard
              id="preview"
              title={data.title || 'Untitled Tournament'}
              game={data.game || 'GAME'}
              badgeText="UPCOMING"
              badgeBg="bg-primary"
              badgeTextColor="text-white"
              imgSrc={data.cover_image_url || ''}
              imgAlt={data.title || 'Tournament cover'}
              prizePool={totalPrizePool > 0 ? `₹${totalPrizePool.toLocaleString('en-IN')}` : 'TBD'}
              entryFee={entryFee > 0 ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free'}
              matchType={matchLabel}
              perspective={perspLabel}
              orgName={orgName}
              orgTier={orgTier}
              slotsTotal={data.slotsTotal}
              slotsFilled={0}
              entryFeeAmount={entryFee}
              isPreview={true}
              buttonText="JOIN NOW"
              onNavigate={() => {}}
              cardColor={data.card_color || 'white'}
            />
          )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
