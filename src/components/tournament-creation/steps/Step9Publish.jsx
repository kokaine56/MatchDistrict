import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { uploadImage } from '../../../utils/cloudinaryUpload'

export default function Step9Publish({ data, userTier, isSubmitting, uploadingMedia, onSaveDraft, onPublishStep9, publishError, isEditMode }) {
  const navigate = useNavigate()
  const [published, setPublished] = useState(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishErrorMsg, setPublishErrorMsg] = useState(null)
  const [copied, setCopied] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const canDraft = userTier === 'Basic' || userTier === 'Pro'

  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0
  const basePrizePool = entryFee * totalSlots
  const sponsorContribs = (Array.isArray(data.sponsors) ? data.sponsors : []).filter((s) => s.status === 'approved').reduce((s, v) => s + (v.amount || 0), 0)
  const totalPrizePool = basePrizePool + sponsorContribs

  useEffect(() => {
    if (publishError) {
      setPublishErrorMsg(publishError)
      setIsPublishing(false)
    }
  }, [publishError])

  const handlePublish = async () => {
    setIsPublishing(true)
    setPublishErrorMsg(null)

    let finalImageUrl = data.cover_image_url || ''

    if (finalImageUrl && !finalImageUrl.includes('cloudinary.com') && !finalImageUrl.includes('unsplash.com')) {
      setMediaUploading(true)
      try {
        finalImageUrl = await uploadImage(finalImageUrl)
      } catch (err) {
        setMediaUploading(false)
        setIsPublishing(false)
        setPublishErrorMsg('Failed to upload cover image. Please try again.')
        return
      } finally {
        setMediaUploading(false)
      }
    }

    const result = await onPublishStep9(finalImageUrl)
    if (result?.tournament) {
      setPublished(result.tournament)
    } else if (result?.error) {
      setPublishErrorMsg(result.message || 'Failed to publish tournament.')
      setIsPublishing(false)
    }
  }

  const handleCopyLink = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const tournamentUrl = published
    ? `${window.location.origin}/tournaments/${published.id}`
    : ''

  const shareText = published
    ? `Join my tournament "${data.title}" on Match District! ${tournamentUrl}`
    : ''

  const handleShare = (platform) => {
    const encoded = encodeURIComponent(shareText)
    const urls = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(tournamentUrl)}&text=${encodeURIComponent(`Join my tournament "${data.title}" on Match District!`)}`,
      discord: `https://discord.com/channels/@me`,
    }
    if (platform === 'copy') {
      handleCopyLink(tournamentUrl)
    } else {
      window.open(urls[platform], '_blank', 'noopener,noreferrer')
    }
  }

  if (published) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl mx-auto space-y-6"
      >
        <div className="text-center space-y-3 pt-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto"
          >
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold text-on-background">{isEditMode ? 'Changes Saved' : 'Tournament Published'}</h2>
          <p className="text-sm text-on-surface-variant">{isEditMode ? 'Your tournament has been updated successfully.' : 'Your tournament is now live and visible to players.'}</p>
        </div>

        <div className="flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 100 }}
              className={`w-2 h-2 rounded-full ${['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-emerald-500', 'bg-amber-500'][i]}`}
            />
          ))}
        </div>

        <div className="bg-surface-container/60 border border-slate-200 dark:border-outline-variant/25 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Tournament URL</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-primary font-medium truncate">{tournamentUrl}</span>
                <button
                  onClick={() => handleCopyLink(tournamentUrl)}
                  className="p-1 rounded hover:bg-surface/50 text-on-surface-variant hover:text-primary transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Tournament ID</p>
              <p className="text-sm font-mono text-on-background font-medium mt-1">{published.id}</p>
            </div>
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Prize Pool</p>
              <p className="text-sm font-bold text-secondary mt-1">₹{totalPrizePool.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Slots</p>
              <p className="text-sm font-medium text-on-background mt-1">{totalSlots} {totalSlots === 1 ? 'Slot' : 'Slots'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-xs font-medium text-emerald-500">Registration Open</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium mb-2">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/tournaments/${published.id}`)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              View Tournament
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleCopyLink(tournamentUrl)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-on-surface-variant text-sm font-medium hover:bg-surface/50 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              {copied ? 'Copied!' : 'Copy Link'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleShare('whatsapp')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              Share on WhatsApp
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleShare('telegram')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 text-sky-500 text-sm font-medium hover:bg-sky-500/20 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
              Share on Telegram
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleShare('discord')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 text-sm font-medium hover:bg-indigo-500/20 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2914a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.1776-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" /></svg>
              Share on Discord
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/create-tournament?edit=${published.id}`)}
            className="px-4 py-3 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface-variant hover:bg-surface/50 transition-colors"
          >
            {isEditMode ? 'Continue Editing' : 'Edit Tournament'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/profile')}
            className="px-4 py-3 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface-variant hover:bg-surface/50 transition-colors"
          >
            Open Dashboard
          </motion.button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-on-background">Ready to Launch</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Your tournament is fully configured and ready to go live.
        </p>
      </div>

      <div className="bg-surface-container/60 border border-slate-200 dark:border-outline-variant/25 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-tertiary/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-on-background">All steps completed</p>
            <p className="text-xs text-on-surface-variant">Your tournament is valid and ready to go live.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-outline-variant/10">
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Tournament</p>
            <p className="text-sm font-medium text-on-background mt-0.5">{data.title || 'Untitled'}</p>
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Game</p>
            <p className="text-sm font-medium text-on-background mt-0.5">{data.game || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Prize Pool</p>
            <p className="text-sm font-bold text-secondary mt-0.5">₹{totalPrizePool.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Slots</p>
            <p className="text-sm font-medium text-on-background mt-0.5">{totalSlots}</p>
          </div>
        </div>
      </div>

      {publishErrorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-rose-500">Failed to Publish Tournament</p>
              <p className="text-xs text-rose-400/80 mt-1">{publishErrorMsg}</p>
            </div>
          </div>
        </motion.div>
      )}

      <p className="text-xs text-on-surface-variant text-center">
        Publishing will immediately make your tournament visible on the homepage, discover page, and search results.
      </p>
    </motion.div>
  )
}
