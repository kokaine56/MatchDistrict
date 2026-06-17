import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSubscription } from '../contexts/SubscriptionContext.jsx'
import { subscriptionApi } from '../services/subscriptionApi.js'
import { useUser } from '../UserContext.jsx'
import { PLAN_PRICES, PLAN_ORDER } from '../utils/featureGates.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { uploadImage } from '../utils/cloudinaryUpload.js'
import qrBasicMonthly from '../assets/payment/qr_basic_monthly.png'
import qrProMonthly from '../assets/payment/qr_pro_monthly.png'
import qrAnnually from '../assets/payment/anually.png'

const UPI_ID = 'matchdistrict@upi'
const ACCOUNT_HOLDER = 'Match District'

export default function SubscriptionPayment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentUser } = useUser()
  const { hasFeature, subscription, refresh } = useSubscription()

  const rawPlan = searchParams.get('plan') || ''
  const validPlans = ['Basic', 'Pro']
  const planParam = validPlans.includes(rawPlan) ? rawPlan : ''
  const cycleParam = searchParams.get('cycle') || 'monthly'
  const [plan] = useState(planParam)
  const [billingCycle] = useState(cycleParam)

  const price = plan ? (PLAN_PRICES[plan]?.[billingCycle === 'yearly' ? 'yearly' : 'monthly'] || 0) : 0
  const displayPrice = billingCycle === 'yearly' ? Math.round(price) : price
  const monthlyPrice = plan ? (PLAN_PRICES[plan]?.monthly || 0) : 0

  // ── Upgrade credit calculation ────────────────────────────────────
  const proratedCredit = useMemo(() => {
    if (!subscription || subscription.plan === 'Free' || subscription.plan === plan) return 0;
    const currentPlanPrice = PLAN_PRICES[subscription.plan]?.[billingCycle === 'yearly' ? 'yearly' : 'monthly'];
    if (!currentPlanPrice || currentPlanPrice <= 0) return 0;
    const now = new Date();
    const startDate = subscription.startDate ? new Date(subscription.startDate) : null;
    const renewalDate = subscription.renewalDate ? new Date(subscription.renewalDate) : null;
    if (!startDate || !renewalDate || renewalDate <= now) return 0;
    const totalMs = renewalDate - startDate;
    const remainingMs = renewalDate - now;
    if (totalMs <= 0 || remainingMs <= 0) return 0;
    return Math.round(currentPlanPrice * (remainingMs / totalMs));
  }, [subscription, plan, billingCycle]);

  const finalAmount = Math.max(0, displayPrice - proratedCredit);
  // ── End credit calculation ────────────────────────────────────────

  // ── Check if already on this plan ─────────────────────────────────
  const currentTier = subscription?.plan || 'Free';
  const alreadyOnPlan = currentTier === plan && subscription?.status === 'active';
  const currentPlanIdx = PLAN_ORDER.indexOf(currentTier);
  const targetPlanIdx = PLAN_ORDER.indexOf(plan);
  const isDowngradeAttempt = targetPlanIdx < currentPlanIdx && currentTier !== 'Free';
  // ──────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState('payment')
  const [showQR, setShowQR] = useState(false)
  const [screenshotFile, setScreenshotFile] = useState(null)
  const [screenshotPreview, setScreenshotPreview] = useState(null)
  const [transactionId, setTransactionId] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedPayment, setSubmittedPayment] = useState(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const features = PLAN_FEATURES[plan] || {}

  const validateFile = (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { setError('Only JPG, PNG, and WEBP files are allowed.'); return false }
    if (file.size > 10 * 1024 * 1024) { setError('File size must be under 10MB.'); return false }
    return true
  }

  const handleFileSelect = (file) => {
    setError('')
    if (!file) return
    if (!validateFile(file)) return
    setScreenshotFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setScreenshotPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFileSelect(file)
  }, [])

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)

  const removeScreenshot = () => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadScreenshot = async () => {
    if (!screenshotFile) return null
    return uploadImage(screenshotFile)
  }

  const handleSubmit = async () => {
    setError('')
    if (!transactionId.trim()) { setError('Please enter the Transaction ID / UTR number.'); return }
    if (!screenshotFile) { setError('Please upload a payment screenshot.'); return }
    if (alreadyOnPlan) { setError('You already have an active subscription for this plan.'); return }

    setUploading(true)
    try {
      let screenshotUrl = null
      if (screenshotFile) {
        screenshotUrl = await uploadScreenshot()
      }

      setSubmitting(true)
      const submitAmount = proratedCredit > 0 ? finalAmount : displayPrice;
      const res = await subscriptionApi.submitPayment({
        plan,
        billingCycle,
        amount: submitAmount,
        transactionId: transactionId.trim(),
        screenshotUrl,
        notes: paymentNotes.trim() || null
      })

      if (res.success) {
        setSubmittedPayment(res.payment)
        setPhase('success')
        refresh()
      } else {
        setError(res.message || 'Failed to submit payment.')
      }
    } catch (err) {
      setError('Something went wrong while updating your subscription.')
    } finally {
      setUploading(false)
      setSubmitting(false)
    }
  }

  const qrSrc = billingCycle === 'yearly' ? qrAnnually : plan === 'Basic' ? qrBasicMonthly : qrProMonthly
  const qrKeyword = billingCycle === 'yearly' ? 'anually' : `qr_${plan.toLowerCase()}_monthly`

  const copyUpiId = () => {
    navigator.clipboard.writeText(UPI_ID)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openUpiApp = () => {
    const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(ACCOUNT_HOLDER)}&am=${displayPrice}&cu=INR&tn=${encodeURIComponent(`Match District ${plan} Plan`)}`
    window.open(upiUrl, '_blank')
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-on-surface-variant">Please sign in to continue with payment.</p>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center max-w-md">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant block mb-4">credit_card_off</span>
          <h2 className="text-lg font-bold text-on-background mb-2">No Plan Selected</h2>
          <p className="text-sm text-on-surface-variant mb-6">Please select a subscription plan to continue with payment.</p>
          <button onClick={() => navigate('/profile?tab=subscription')} className="px-6 py-3 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            Return to Pricing
          </button>
        </div>
      </div>
    )
  }

  if (alreadyOnPlan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center max-w-md">
          <span className="material-symbols-outlined text-4xl text-primary block mb-4">workspace_premium</span>
          <h2 className="text-lg font-bold text-on-background mb-2">Already on {plan} Plan</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            You already have an active {plan} subscription. Your plan benefits are already unlocked.
          </p>
          <button onClick={() => navigate('/profile?tab=subscription')} className="px-6 py-3 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            View My Subscription
          </button>
        </div>
      </div>
    )
  }

  if (isDowngradeAttempt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 rounded-[20px] border border-amber-400/30 bg-amber-400/5 backdrop-blur-md text-center max-w-md">
          <span className="material-symbols-outlined text-4xl text-amber-400 block mb-4">info</span>
          <h2 className="text-lg font-bold text-on-background mb-2">Downgrade Not Supported Here</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            You are currently on the {currentTier} plan. To switch to {plan}, please use the subscription management page in your dashboard.
          </p>
          <button onClick={() => navigate('/profile?tab=subscription')} className="px-6 py-3 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            Manage Subscription
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-sm">stadia_controller</span>
          </div>
          <div>
            <p className="text-sm font-bold text-on-background">Match District</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full">
          <span className="material-symbols-outlined text-success text-xs">lock</span>
          <span className="text-[10px] text-success font-semibold">SECURE PAYMENT</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row max-w-5xl mx-auto w-full p-4 sm:p-6 gap-6">
        {/* Main Payment Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {phase === 'payment' && (
              <motion.div key="payment" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
                {/* Plan Badge */}
                <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-on-surface-variant font-medium">Upgrading to</p>
                      <h1 className="text-xl sm:text-2xl font-bold text-on-background mt-0.5">{plan} Plan</h1>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-on-surface-variant font-medium">Amount Payable</p>
                      {proratedCredit > 0 ? (
                        <>
                          <p className="text-2xl sm:text-3xl font-bold text-primary mt-0.5">₹{finalAmount.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-on-surface-variant line-through">₹{displayPrice.toLocaleString('en-IN')}</p>
                        </>
                      ) : billingCycle === 'yearly' ? (
                        <>
                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            <p className="text-[13px] text-on-surface-variant/50 line-through">₹{monthlyPrice.toLocaleString('en-IN')}/mo</p>
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded">SAVE 25%</span>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold text-primary">₹{displayPrice.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-on-surface-variant">per year</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl sm:text-3xl font-bold text-primary mt-0.5">₹{displayPrice.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-on-surface-variant">per month</p>
                        </>
                      )}
                    </div>
                  </div>
                  {proratedCredit > 0 && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 mb-3">
                      <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">savings</span>
                        Prorated credit applied: ₹{proratedCredit.toLocaleString('en-IN')} from existing {subscription?.plan} plan
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low/30 rounded-xl px-3 py-2">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    Billing: <span className="text-on-surface font-medium capitalize">{billingCycle}</span>
                  </div>
                </div>

                {/* Plan Summary */}
                <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                  <h3 className="text-sm font-bold text-on-background mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">checklist</span>
                    What's Included
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(FEATURE_LABELS).filter(([key]) => features[key]).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2 text-xs text-on-surface">
                        <span className="material-symbols-outlined text-success text-[14px]">check_circle</span>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pay via UPI Button */}
                {!showQR && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setShowQR(true)}
                    className="w-full py-4 bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/20"
                  >
                    <span className="material-symbols-outlined">qr_code_scanner</span>
                    Pay ₹{(proratedCredit > 0 ? finalAmount : displayPrice).toLocaleString('en-IN')} via UPI
                  </motion.button>
                )}

                {/* QR Code + Upload Section */}
                {showQR && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                    {/* QR Code Card */}
                    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center">
                      <h3 className="text-sm font-bold text-on-background mb-3 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">qr_code_scanner</span>
                        Scan to Pay
                      </h3>
                      <div className="inline-flex flex-col items-center gap-3">
                        <img
                          src={qrSrc}
                          alt={`QR for ${plan} ${billingCycle} payment`}
                          className="w-52 h-52 sm:w-60 sm:h-60 rounded-xl border border-outline-variant/30 bg-white p-2 shadow-lg"
                        />
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-center gap-2 bg-surface-container-low/60 rounded-xl px-4 py-2 border border-outline-variant/20">
                            <span className="text-xs text-on-surface-variant font-medium">UPI ID:</span>
                            <span className="text-sm font-bold text-primary tracking-wider">{UPI_ID}</span>
                            <button onClick={copyUpiId} className="p-1 rounded-lg hover:bg-surface-container-high transition-colors" title="Copy UPI ID">
                              <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                            </button>
                          </div>
                          <p className="text-[10px] text-on-surface-variant">
                            Keyword: <span className="font-mono font-bold text-on-surface">{qrKeyword}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Upload Section */}
                    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                      <h3 className="text-sm font-bold text-on-background mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">image</span>
                        Upload Payment Screenshot
                      </h3>
                      <p className="text-[11px] text-on-surface-variant mb-4">Upload a screenshot of your UPI payment confirmation. Accepted formats: JPG, PNG, WEBP (max 10MB).</p>

                      {!screenshotPreview ? (
                        <div
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                            dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container-low/30'
                          }`}
                        >
                          <span className="material-symbols-outlined text-3xl text-on-surface-variant block mb-2">cloud_upload</span>
                          <p className="text-xs text-on-surface-variant">Drag & drop your screenshot here</p>
                          <p className="text-[10px] text-on-surface-variant mt-1">or click to browse files</p>
                          <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => handleFileSelect(e.target.files[0])} className="hidden" />
                        </div>
                      ) : (
                        <div className="relative">
                          <img src={screenshotPreview} alt="Payment Screenshot Preview" className="w-full max-h-64 object-contain rounded-xl bg-black/20" />
                          <button onClick={removeScreenshot} className="absolute top-2 right-2 p-1.5 bg-error/80 rounded-full text-white">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Transaction Details */}
                    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                      <h3 className="text-sm font-bold text-on-background mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">receipt</span>
                        Transaction Details
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[11px] text-on-surface-variant font-medium block mb-1.5">Transaction ID / UTR Number *</label>
                          <input
                            type="text"
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder="e.g. HDFC123456789 or UPI123456789012"
                            className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-on-surface-variant font-medium block mb-1.5">Payment Notes <span className="text-on-surface-variant/50">(optional)</span></label>
                          <select
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-background focus:outline-none focus:border-primary/50 transition-colors"
                          >
                            <option value="">Select payment method</option>
                            <option value="Paid from PhonePe">Paid from PhonePe</option>
                            <option value="Paid from Google Pay">Paid from Google Pay</option>
                            <option value="Paid from Paytm">Paid from Paytm</option>
                            <option value="Paid from BHIM">Paid from BHIM</option>
                            <option value="Paid from Other App">Paid from Other App</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-error bg-error/10 rounded-xl px-4 py-3">{error}</motion.p>
                    )}

                    {/* Submit Button */}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleSubmit}
                      disabled={submitting || uploading}
                      className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                      {uploading ? (
                        <><span className="animate-spin material-symbols-outlined text-sm">sync</span> Uploading Screenshot...</>
                      ) : submitting ? (
                        <><span className="animate-spin material-symbols-outlined text-sm">sync</span> Submitting Payment Proof...</>
                      ) : (
                        <><span className="material-symbols-outlined text-sm">check_circle</span> Submit Payment Proof</>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {phase === 'success' && submittedPayment && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                {/* Success Header */}
                <div className="glass-card p-6 sm:p-8 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center">
                  <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-success text-3xl">check_circle</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-on-background mb-2">Payment Submitted Successfully!</h2>
                  <p className="text-sm text-on-surface-variant">Your payment proof has been sent for verification.</p>
                </div>

                {/* Payment Summary */}
                <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                  <h3 className="text-sm font-bold text-on-background mb-3">Payment Summary</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-outline-variant/10">
                      <span className="text-on-surface-variant">Plan</span>
                      <span className="text-on-surface font-medium">{submittedPayment.plan}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-outline-variant/10">
                      <span className="text-on-surface-variant">Amount</span>
                      <span className="text-on-surface font-medium">₹{submittedPayment.amount?.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-outline-variant/10">
                      <span className="text-on-surface-variant">Transaction ID</span>
                      <span className="text-on-surface font-medium font-mono text-[10px]">{submittedPayment.transactionId}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-on-surface-variant">Status</span>
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">hourglass_top</span>
                        Pending Verification
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Tracker */}
                <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
                  <h3 className="text-sm font-bold text-on-background mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">timeline</span>
                    Status Tracker
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-success text-sm">check</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-on-surface">Payment Submitted</p>
                        <p className="text-[10px] text-on-surface-variant">Your payment proof has been received</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-amber-400 text-sm">hourglass_top</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-400">Verification Pending</p>
                        <p className="text-[10px] text-on-surface-variant">Admin will review your payment proof</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-outline-variant/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-on-surface-variant text-sm">pending</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-on-surface-variant">Subscription Activation</p>
                        <p className="text-[10px] text-on-surface-variant">Plan features unlocked after approval</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl">
                    <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">info</span>
                      Estimated verification time: Up to 24 hours. You'll be notified once your payment is approved.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => navigate('/subscription/history')}
                    className="flex-1 py-3 bg-surface-container-low/50 border border-outline-variant/30 text-on-surface font-semibold text-xs rounded-xl hover:bg-surface-container-low transition-all"
                  >
                    View Payment History
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => navigate('/profile')}
                    className="flex-1 py-3 bg-primary/10 text-primary font-semibold text-xs rounded-xl hover:bg-primary/20 transition-all"
                  >
                    Back to Dashboard
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar - Payment Info */}
        <div className="w-full lg:w-72 space-y-4">
          <div className="glass-card p-4 sm:p-5 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
            <h3 className="text-xs font-bold text-on-background mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">help</span>
              Need Help?
            </h3>
            <p className="text-[10px] text-on-surface-variant leading-relaxed">
              Having trouble with payment? Contact our support team for assistance.
            </p>
            <button className="mt-3 text-[10px] text-primary font-semibold">Contact Support →</button>
          </div>

          {billingCycle === 'yearly' && (
            <div className="glass-card p-4 sm:p-5 rounded-[20px] border border-amber-400/30 bg-amber-400/5 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-amber-400 text-sm">local_offer</span>
                <span className="text-xs font-bold text-amber-400">Best Value</span>
              </div>
              <p className="text-[10px] text-on-surface-variant">You're saving 25% with yearly billing!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const PLAN_FEATURES = {
  Free: {
    tournaments30: true,
    slots100: true,
    standardForms: true,
    dashboard: true,
    organizerProfile: true,
    analytics: true,
    publicListings: true,
    basicTools: true,
  },
  Basic: {
    tournaments60: true,
    slots200: true,
    standardForms: true,
    draftSupport: true,
    sponsorRequests: true,
    csvExport: true,
    customLink: true,
    revenueAnalytics: true,
    staffManagement: true,
  },
  Pro: {
    tournamentsUnlimited: true,
    slots1000: true,
    customForms: true,
    verifiedBadge: true,
    draftSupport: true,
    sponsorRequests: true,
    csvExport: true,
    automations: true,
    customDashboardLink: true,
    customLink: true,
    revenueAnalytics: true,
    earlyAccess: true,
    multiAdmin: true,
    staffManagement: true,
  }
}

const FEATURE_LABELS = {
  tournaments30: '30 Tournaments Per Month',
  tournaments60: '60 Tournaments Per Month',
  tournamentsUnlimited: 'Unlimited Tournaments Per Month',
  slots100: 'Up To 100 Slots Per Tournament',
  slots200: 'Up To 300 Slots Per Tournament',
  slots1000: 'Up To 1000 Slots Per Tournament',
  standardForms: 'Standard Registration Forms',
  customForms: 'Custom Registration Forms',
  dashboard: 'Tournament Management Dashboard',
  organizerProfile: 'Organizer Profile',
  analytics: 'Tournament Analytics',
  publicListings: 'Public Tournament Listings',
  basicTools: 'Basic Organizer Tools',
  draftSupport: 'Draft Tournament Support',
  sponsorRequests: 'Sponsored Prize Pool Requests',
  csvExport: 'CSV / Excel Slot Export',
  customLink: 'Share Custom Tournament Link',
  revenueAnalytics: 'Revenue & Growth Analytics',
  staffManagement: 'Staff Management',
  verifiedBadge: 'Gold Verified Badge',
  automations: 'Tournament Automations',
  customDashboardLink: 'Custom Dashboard Link',
  earlyAccess: 'Early Access To New Features',
  multiAdmin: 'Multi Admin Access',
}
